import { useState, useEffect } from "react";
import { useStore } from "../../app/store";
import { useAuth } from "../../lib/auth";
import { callFunction } from "../../lib/auth";
import { Card, Field, Button, Textarea, EmptyState, Badge, Spinner } from "../../components/ui";
import { Icon } from "../../components/ui/Icon";

interface DiagnosisResult {
  causes: {
    rank: number;
    title: string;
    detail: string;
    likelihood: "high" | "medium" | "low";
  }[];
  inspectionSteps: string[];
  safetyWarnings: string[];
  suggestedParts: string[];
  confidence: number;
  disclaimer: string;
}

interface SavedDiagnosis {
  id: string;
  device: { type: string; brand: string; model: string; serial?: string };
  complaint: string;
  observations?: string;
  result: DiagnosisResult;
  model: string;
  provider: string;
  technicianId?: string;
  addedToNotes: boolean;
  createdAt: string;
}

export function AIDiagnosisPage() {
  const { session, pushToast, actor } = useStore();
  const { signIn } = useAuth();
  const [deviceType, setDeviceType] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [complaint, setComplaint] = useState("");
  const [observations, setObservations] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedDiagnosis[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [repairId, setRepairId] = useState("");

  // Check if we have a repair context from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const repairIdParam = params.get("repairId");
    if (repairIdParam) {
      setRepairId(repairIdParam);
      // Could pre-fill from repair data here
    }
  }, []);

  const runDiagnosis = async () => {
    if (!deviceType || !brand || !model || !complaint.trim()) {
      pushToast("error", "Please fill in all required fields: Device Type, Brand, Model, and Complaint");
      return;
    }

    setBusy(true);
    setResult(null);
    setDiagnosisId(null);

    try {
      const response = await callFunction<{
        ok: boolean;
        diagnosis: DiagnosisResult;
        diagnosisId: string;
        error?: string;
      }>("runAiDiagnosis", {
        device: { type: deviceType, brand, model, serial: serial || undefined },
        complaint: complaint.trim(),
        observations: observations.trim() || undefined,
        repairId: repairId || undefined,
      });

      if (response.ok) {
        setResult(response.diagnosis);
        setDiagnosisId(response.diagnosisId);
        pushToast("success", "AI diagnosis complete");
      } else {
        throw new Error(response.error || "Diagnosis failed");
      }
    } catch (error) {
      console.error("AI Diagnosis error:", error);
      pushToast("error", `Diagnosis failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  const confirmAndAddToRepair = async () => {
    if (!diagnosisId || !repairId) {
      pushToast("error", "No diagnosis or repair ID available");
      return;
    }

    if (!window.confirm("Add this AI diagnosis to the repair notes? This requires technician confirmation.")) {
      return;
    }

    try {
      const response = await callFunction<{ ok: boolean; error?: string }>("confirmAiDiagnosis", {
        diagnosisId,
        repairId,
      });

      if (response.ok) {
        pushToast("success", "AI diagnosis added to repair notes");
        // Refresh history if on a repair
        if (repairId) loadHistory(repairId);
      } else {
        throw new Error(response.error || "Failed to add to repair");
      }
    } catch (error) {
      console.error("Confirm diagnosis error:", error);
      pushToast("error", `Failed to add to repair: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const loadHistory = async (repairId: string) => {
    try {
      const response = await callFunction<{ ok: boolean; diagnoses: SavedDiagnosis[] }>("getAiDiagnosisHistory", {
        repairId,
      });
      if (response.ok) {
        setHistory(response.diagnoses);
      }
    } catch (error) {
      console.error("Load history error:", error);
    }
  };

  const formatLikelihood = (likelihood: string) => {
    const colors: Record<string, string> = { high: "danger", medium: "warning", low: "in-stock" };
    return colors[likelihood] || "in-stock";
  };

  return (
    <div className="ai-diagnosis-page">
      <div className="page-head">
        <div>
          <h1>
            <Icon name="brain" size={24} />
            AI Repair Diagnosis
          </h1>
          <p>Get preliminary diagnostic suggestions for customer-reported symptoms. Always verify with physical inspection.</p>
        </div>
        <div className="head-actions">
          <Button onClick={() => setShowHistory(!showHistory)} variant="ghost">
            <Icon name={showHistory ? "close" : "history"} size={14} />
            {showHistory ? "Hide History" : "View History"}
          </Button>
        </div>
      </div>

      <div className="ai-diagnosis-layout">
        <main className="diagnosis-main">
          <Card>
            <h3>Device Information</h3>
            <div className="diagnosis-form">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Device Type" required>
                  <input
                    type="text"
                    placeholder="e.g., Laptop, Smartphone, Tablet, Desktop"
                    value={deviceType}
                    onChange={(e) => setDeviceType(e.target.value)}
                    disabled={busy}
                  />
                </Field>
                <Field label="Brand" required>
                  <input
                    type="text"
                    placeholder="e.g., Apple, Dell, Samsung, HP"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    disabled={busy}
                  />
                </Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Model" required>
                  <input
                    type="text"
                    placeholder="e.g., MacBook Pro 16, iPhone 13 Pro"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={busy}
                  />
                </Field>
                <Field label="Serial Number">
                  <input
                    type="text"
                    placeholder="Optional"
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                    disabled={busy}
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <h3>Symptoms & Observations</h3>
            <div className="diagnosis-form">
              <Field label="Customer Complaint" required>
                <Textarea
                  value={complaint}
                  onChange={(value: string) => setComplaint(value)}
                  placeholder="What did the customer report? e.g., 'Laptop won't turn on, no lights, charger light is on'"
                  rows={3}
                  disabled={busy}
                />
              </Field>
              <Field label="Technician Observations (Optional)">
                <Textarea
                  value={observations}
                  onChange={(value: string) => setObservations(value)}
                  placeholder="Any initial observations? e.g., 'No visible damage, charger tests OK, no POST beeps'"
                  rows={2}
                  disabled={busy}
                />
              </Field>
            </div>
            <div className="form-actions">
              <Button onClick={runDiagnosis} disabled={busy} full>
                {busy ? <Spinner size={16} /> : "Run AI Diagnosis"}
              </Button>
            </div>
          </Card>

          {result && (
            <Card className="diagnosis-result">
              <div className="result-header">
                <h3>AI Diagnosis Result</h3>
                <Badge tone={formatLikelihood(result.confidence >= 0.7 ? "high" : result.confidence >= 0.4 ? "medium" : "low")}>
                  Confidence: {Math.round(result.confidence * 100)}%
                </Badge>
              </div>

              <div className="result-section">
                <h4>Possible Causes (Ranked by Likelihood)</h4>
                <ol>
                  {result.causes.map((cause) => (
                    <li key={cause.rank} className="cause-item">
                      <div className="cause-header">
                        <span className="cause-rank">{cause.rank}.</span>
                        <strong>{cause.title}</strong>
                        <Badge tone={formatLikelihood(cause.likelihood)}>{cause.likelihood}</Badge>
                      </div>
                      <p>{cause.detail}</p>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="result-section">
                <h4>Suggested Inspection Steps</h4>
                <ol>
                  {result.inspectionSteps.map((step, i) => (
                    <li key={i} className="inspection-step">
                      <span className="step-number">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="result-section safety">
                <h4>
                  <Icon name="alert" size={16} />
                  Safety Warnings
                </h4>
                <ul>
                  {result.safetyWarnings.map((warning, i) => (
                    <li key={i} className="safety-warning">
                      <Icon name="alert" size={14} />
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>

              {result.suggestedParts.length > 0 && (
                <div className="result-section">
                  <h4>Suggested Parts to Check</h4>
                  <ul className="parts-list">
                    {result.suggestedParts.map((part, i) => (
                      <li key={i}>
                        <Icon name="package" size={14} />
                        {part}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="disclaimer">
                <Icon name="alert" size={14} />
                <strong>Disclaimer:</strong> {result.disclaimer}
              </div>

              {repairId && actor && ["technician", "manager", "admin"].includes(actor.role) && (
                <div className="result-actions">
                  <Button onClick={confirmAndAddToRepair} variant="primary" full>
                    <Icon name="check" size={14} />
                    Confirm & Add to Repair Notes
                  </Button>
                  <p className="confirm-hint">
                    Requires technician confirmation. This adds the AI analysis to the repair record as a preliminary finding.
                  </p>
                </div>
              )}
            </Card>
          )}

          {!result && !busy && (
            <Card>
              <EmptyState
                icon="brain"
                title="Ready for diagnosis"
                message="Enter the device details and customer complaint above, then click 'Run AI Diagnosis' to get preliminary diagnostic suggestions."
              />
            </Card>
          )}
        </main>

        {showHistory && (
          <aside className="diagnosis-history">
            <Card>
              <h3>Diagnosis History</h3>
              {repairId ? (
                <div className="history-list">
                  {history.length === 0 ? (
                    <EmptyState icon="history" title="No previous diagnoses" message="Run a diagnosis to see history here." />
                  ) : (
                    history.map((diag) => (
                      <div key={diag.id} className="history-item">
                        <div>
                          <strong>{diag.device.brand} {diag.device.model}</strong>
                          <small>{diag.complaint}</small>
                        </div>
                        <div className="history-meta">
                          <Badge tone={formatLikelihood(diag.result.confidence >= 0.7 ? "high" : diag.result.confidence >= 0.4 ? "medium" : "low")}>
                            {Math.round(diag.result.confidence * 100)}%
                          </Badge>
                          <small>{new Date(diag.createdAt).toLocaleDateString()}</small>
                          {diag.addedToNotes && <Badge tone="in-stock">Added to notes</Badge>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <EmptyState
                  icon="alert"
                  title="Select a repair"
                  message="Open this page from a repair detail view (with ?repairId= parameter) to see diagnosis history for that repair."
                />
              )}
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}