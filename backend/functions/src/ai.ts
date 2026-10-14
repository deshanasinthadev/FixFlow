import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, CallContext, ErrorCode, throwError, serverTimestamp, requireBranchAccess } from "./types.js";

function getContext(auth: any): CallContext {
  if (!auth) throwError(ErrorCode.UNAUTHENTICATED, "You must be signed in");
  const claims = (auth.token ?? {}) as any;
  return {
    uid: auth.uid,
    claims,
    isAdmin: claims.role === "admin",
    isStaff: ["admin", "manager", "technician", "cashier"].includes(claims.role),
    isCustomer: claims.role === "customer",
    isTechnician: claims.role === "technician",
    isManager: claims.role === "manager",
    isCashier: claims.role === "cashier",
    branchId: claims.branchId,
    customerId: claims.customerId,
    technicianId: claims.technicianId,
  };
}

type DiagnosisInput = {
  device: {
    type: string;
    brand: string;
    model: string;
    serial?: string;
  };
  complaint: string;
  observations?: string;
  repairId?: string;
};

type ChatInput = {
  prompt: string;
  device?: {
    type?: string;
    brand?: string;
    model?: string;
    serial?: string;
  };
};

type DiagnosisResult = {
  causes: { rank: number; title: string; detail: string; likelihood: "high" | "medium" | "low" }[];
  inspectionSteps: string[];
  safetyWarnings: string[];
  suggestedParts: string[];
  confidence: number;
  disclaimer: string;
};

function isDiagnosisInput(data: any): data is DiagnosisInput {
  return data && data.device && data.device.type && data.device.brand && data.device.model && data.complaint;
}

function isChatInput(data: any): data is ChatInput {
  return data && typeof data.prompt === "string";
}

/** Call AI provider for repair diagnosis or chat assistance. */
export const runAiDiagnosis = onCall(async (request) => {
  const context = getContext(request.auth);
  const data = request.data;

  // Handle both structured diagnosis and chat assistant modes
  let prompt: string;
  let deviceInfo: DiagnosisInput["device"];
  let complaint: string;
  let observations: string | undefined;
  let repairId: string | undefined;

  if (isDiagnosisInput(data)) {
    // Structured diagnosis mode
    deviceInfo = data.device;
    complaint = data.complaint;
    observations = data.observations;
    repairId = data.repairId;
    prompt = buildDiagnosisPrompt({ device: deviceInfo, complaint, observations, repairId });
  } else if (isChatInput(data)) {
    // Chat assistant mode
    const device = data.device || { type: "unknown", brand: "unknown", model: "unknown" };
    deviceInfo = {
      type: device.type || "unknown",
      brand: device.brand || "unknown",
      model: device.model || "unknown",
      serial: device.serial,
    };
    complaint = data.prompt;
    observations = undefined;
    repairId = undefined;
    prompt = buildChatPrompt(data.prompt, deviceInfo);
  } else {
    throwError(ErrorCode.INVALID_ARGUMENT, "Invalid request format. Provide either diagnosis input or chat prompt.");
  }

  const settingsDoc = await db.collection("settings").doc("integrations").get();
  const aiConfig = settingsDoc.exists ? settingsDoc.data()?.ai : null;

  if (!aiConfig?.enabled) {
    throwError(ErrorCode.FAILED_PRECONDITION, "AI diagnosis is not configured");
  }

  const provider = aiConfig.provider ?? "openai";
  const model = aiConfig.model ?? "gpt-4o-mini";
  const apiKey = process.env[provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"];

  if (!apiKey) {
    throwError(ErrorCode.INTERNAL, "AI provider API key not configured on server");
  }

  let result: DiagnosisResult;

  try {
    if (provider === "openai") {
      result = await callOpenAI(apiKey, model, prompt);
    } else if (provider === "anthropic") {
      result = await callAnthropic(apiKey, model, prompt);
    } else {
      throwError(ErrorCode.INTERNAL, `Unknown AI provider: ${provider}`);
    }
  } catch (error) {
    console.error("AI diagnosis failed:", error);
    throwError(ErrorCode.INTERNAL, "AI diagnosis failed. Please try again later.");
  }

  // For chat mode, return just the response text
  if (isChatInput(data)) {
    return { ok: true, response: result.disclaimer };
  }

  // For diagnosis mode, save to history
  const diagnosisId = `diag-${Date.now()}`;
  await db.collection("ai_diagnoses").doc(diagnosisId).set({
    repairId: repairId ?? null,
    device: deviceInfo,
    complaint,
    observations: observations ?? null,
    result,
    model,
    provider,
    technicianId: context.isTechnician ? context.uid : null,
    addedToNotes: false,
    createdAt: serverTimestamp(),
  });

  return { ok: true, diagnosis: result, diagnosisId };
});

/** Add AI diagnosis to repair notes (technician confirmation). */
export const confirmAiDiagnosis = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");
  if (!["admin", "manager", "technician"].includes(context.claims.role)) {
    throwError(ErrorCode.PERMISSION_DENIED, "Only technicians and above can confirm AI diagnosis");
  }

  const { diagnosisId, repairId } = request.data as { diagnosisId: string; repairId: string };

  const diagSnap = await db.collection("ai_diagnoses").doc(diagnosisId).get();
  if (!diagSnap.exists) throwError(ErrorCode.NOT_FOUND, "Diagnosis not found");

  const diag = diagSnap.data()!;
  if (diag.addedToNotes) throwError(ErrorCode.FAILED_PRECONDITION, "Already added to repair");

  const repairRef = db.collection("repairs").doc(repairId);
  const repairSnap = await repairRef.get();
  if (!repairSnap.exists) throwError(ErrorCode.NOT_FOUND, "Repair not found");

  const repair = repairSnap.data()!;
  requireBranchAccess(context, repair.branchId);

  const findings = `AI-assisted diagnosis (${diag.provider}/${diag.model}, confidence: ${Math.round(diag.result.confidence * 100)}%):\n\n` +
    `Possible causes:\n` +
    diag.result.causes.map((c: { rank: number; title: string; likelihood: string; detail: string }) => `${c.rank}. ${c.title} (${c.likelihood}): ${c.detail}`).join("\n") +
    `\n\nSuggested inspection steps:\n` +
    diag.result.inspectionSteps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n") +
    `\n\nSafety warnings:\n` +
    diag.result.safetyWarnings.map((w: string) => `⚠ ${w}`).join("\n") +
    `\n\nSuggested parts: ${diag.result.suggestedParts.join(", ") || "None"}`;

  const recommended = diag.result.inspectionSteps[0] ?? "Inspect device and verify AI suggestions";

  await db.runTransaction(async (tx) => {
    tx.update(repairRef, {
      diagnosis: {
        findings,
        recommended,
        recordedByUserId: context.uid,
        recordedAt: new Date().toISOString(),
        technicianConfirmed: true,
      },
      updatedAt: serverTimestamp(),
    });

    const eventRef = repairRef.collection("events").doc();
    tx.set(eventRef, {
      type: "diagnosis",
      message: findings,
      visibility: "internal",
      actorUserId: context.uid,
      actorName: "Technician",
      actorRole: context.claims.role,
      createdAt: serverTimestamp(),
    });

    tx.update(db.collection("ai_diagnoses").doc(diagnosisId), { addedToNotes: true });
  });

  return { ok: true };
});

/** Get AI diagnosis history for a repair. */
export const getAiDiagnosisHistory = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");

  const { repairId } = request.data as { repairId: string };

  const repairRef = db.collection("repairs").doc(repairId);
  const repairSnap = await repairRef.get();
  if (!repairSnap.exists) throwError(ErrorCode.NOT_FOUND, "Repair not found");

  const repair = repairSnap.data()!;
  requireBranchAccess(context, repair.branchId);

  const snap = await db.collection("ai_diagnoses")
    .where("repairId", "==", repairId)
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  return {
    ok: true,
    diagnoses: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })),
  };
});

function buildDiagnosisPrompt(input: DiagnosisInput): string {
  return `You are FixFlow AI, an expert repair diagnostic assistant for a professional electronics repair shop. 
Your role is to provide PRELIMINARY diagnostic suggestions based on customer-reported symptoms.
You MUST NOT present guesses as confirmed faults. You MUST NOT invent test results, component measurements, or repair history.
You MUST warn against dangerous electrical work, battery puncturing, and opening power supplies.

DEVICE INFORMATION:
- Type: ${input.device.type}
- Brand: ${input.device.brand}
- Model: ${input.device.model}
${input.device.serial ? `- Serial: ${input.device.serial}` : ""}

CUSTOMER COMPLAINT:
${input.complaint}

${input.observations ? `TECHNICIAN OBSERVATIONS:\n${input.observations}` : ""}

RESPOND WITH A JSON OBJECT CONTAINING:
{
  "causes": [
    { "rank": 1, "title": "Short descriptive title", "detail": "Explanation of why this could cause the symptoms", "likelihood": "high|medium|low" },
    { "rank": 2, "title": "...", "detail": "...", "likelihood": "medium|low" },
    { "rank": 3, "title": "...", "detail": "...", "likelihood": "low" }
  ],
  "inspectionSteps": [
    "Step 1: Safe, non-invasive check (e.g., visual inspection, charger verification)",
    "Step 2: Measurement or test that requires basic tools",
    "Step 3: Advanced test requiring disassembly (mark as requiring qualified technician)"
  ],
  "safetyWarnings": [
    "WARNING: Do not attempt to open the power supply unit - lethal voltages present",
    "WARNING: Do not puncture or bend lithium batteries - fire/explosion risk",
    "WARNING: Ensure device is unplugged and battery disconnected before internal inspection"
  ],
  "suggestedParts": ["Part name 1", "Part name 2"],
  "confidence": 0.7,
  "disclaimer": "This is a PRELIMINARY analysis based on reported symptoms only. Physical inspection by a qualified technician is required to confirm any diagnosis. FixFlow AI cannot verify component conditions, measure voltages, or perform tests. Recommendations are starting points for investigation, not confirmed repair procedures."
}

Guidelines:
- List 3-5 possible causes ranked by likelihood
- Inspection steps should progress from safest/easiest to most invasive
- Always include safety warnings relevant to the device type
- Confidence should reflect uncertainty (typically 0.5-0.8 for preliminary diagnosis)
- For "laptop does not turn on" type issues, consider: power adapter, battery, DC jack, motherboard, RAM, CPU
- For display issues: panel, cable, GPU, backlight, inverter
- For overheating: dust, thermal paste, fan, heatsink, voltage regulation
- Never suggest opening PSU, CRT monitors, or high-voltage components
- Always recommend professional service for anything beyond basic external checks`;
}

function buildChatPrompt(userMessage: string, deviceInfo: DiagnosisInput["device"]): string {
  return `You are FixFlow AI, a helpful repair assistant for FixFlow Repair shop.
You assist technicians and staff with repair questions, troubleshooting, part identification, workflow guidance, and general repair knowledge.

Current device context (if provided):
- Type: ${deviceInfo.type}
- Brand: ${deviceInfo.brand}
- Model: ${deviceInfo.model}
${deviceInfo.serial ? `- Serial: ${deviceInfo.serial}` : ""}

Guidelines:
- Be helpful, professional, and concise
- For repair questions, ask clarifying questions if needed
- Always prioritize safety - warn against dangerous procedures
- Don't make definitive diagnoses - suggest inspection steps
- Reference FixFlow workflows (repair intake, parts ordering, estimates, invoicing, warranty)
- If asked about specific repairs, suggest using the AI Diagnosis tool for structured analysis
- Keep responses conversational but informative

User message: ${userMessage}

Respond in a helpful, conversational manner. If you don't know something, say so.`;
}

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<DiagnosisResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are FixFlow AI, a professional repair diagnostic assistant. Respond ONLY with valid JSON matching the specified schema." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");

  return JSON.parse(content) as DiagnosisResult;
}

async function callAnthropic(apiKey: string, model: string, prompt: string): Promise<DiagnosisResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 0.3,
      system: "You are FixFlow AI, a professional repair diagnostic assistant. Respond ONLY with valid JSON matching the specified schema.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const data = await response.json() as { content: { text: string }[] };
  const content = data.content[0]?.text;
  if (!content) throw new Error("Empty response from Anthropic");

  return JSON.parse(content) as DiagnosisResult;
}