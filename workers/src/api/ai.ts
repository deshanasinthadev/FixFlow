import { Hono } from 'hono'
import { z } from 'zod'
import { getDb } from '../lib/firebase-admin.js'

interface CloudflareEnv {
  FIREBASE_PROJECT_ID: string
  FIREBASE_CLIENT_EMAIL: string
  FIREBASE_PRIVATE_KEY: string
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
}

const ai = new Hono<{ Bindings: CloudflareEnv }>()

// Validation schemas
const diagnosisRequestSchema = z.object({
  deviceType: z.string().min(1),
  deviceBrand: z.string().min(1),
  deviceModel: z.string().min(1),
  complaint: z.string().min(10),
  symptoms: z.array(z.string()).optional(),
  errorCodes: z.array(z.string()).optional(),
  previousRepairs: z.array(z.string()).optional(),
})

const chatRequestSchema = z.object({
  message: z.string().min(1),
  context: z.object({
    deviceType: z.string().optional(),
    deviceBrand: z.string().optional(),
    deviceModel: z.string().optional(),
    complaint: z.string().optional(),
    conversationHistory: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })).optional(),
  }).optional(),
})

// AI Diagnosis - Preliminary assessment only
ai.post('/diagnosis', async (c) => {
  try {
    const body = await c.req.json()
    const data = diagnosisRequestSchema.parse(body)

    const apiKey = c.env.OPENAI_API_KEY || c.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return c.json({
        ok: false,
        error: 'AI service not configured. Please add OPENAI_API_KEY or ANTHROPIC_API_KEY to Cloudflare Workers secrets.',
      }, 503)
    }

    // Build prompt for diagnosis
    const prompt = buildDiagnosisPrompt(data)

    let diagnosis: string
    let model: string

    if (c.env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_DIAGNOSIS_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1500,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('OpenAI error:', error)
        throw new Error('AI diagnosis failed')
      }

      const result = await response.json() as { choices: Array<{ message: { content: string } }> }
      diagnosis = result.choices[0]?.message?.content ?? 'No diagnosis generated'
      model = 'gpt-4o-mini'
    } else {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': c.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          system: SYSTEM_DIAGNOSIS_PROMPT,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 1500,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('Anthropic error:', error)
        throw new Error('AI diagnosis failed')
      }

      const result = await response.json() as { content: Array<{ text: string }> }
      diagnosis = result.content[0]?.text ?? 'No diagnosis generated'
      model = 'claude-3-haiku-20240307'
    }

    // Save diagnosis to Firestore for tracking
    const db = getDb()
    const diagnosisId = db.collection('aiDiagnoses').doc().id
    await db.collection('aiDiagnoses').doc(diagnosisId).set({
      ...data,
      diagnosis,
      model,
      status: 'preliminary',
      createdAt: new Date(),
    })

    // Add safety disclaimer
    const disclaimer = `
⚠️ IMPORTANT SAFETY NOTICE:
This is a PRELIMINARY AI-generated diagnosis for informational purposes only.
It MUST be verified by a qualified technician before any repair work begins.
Do NOT attempt dangerous repairs based solely on this assessment.
Electrical, microwave, and high-voltage components can cause serious injury or death.
Always follow manufacturer safety guidelines and local regulations.
`

    return c.json({
      ok: true,
      diagnosis: diagnosis + disclaimer,
      diagnosisId,
      model,
      status: 'preliminary',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ ok: false, error: 'Validation error', details: error.errors }, 400)
    }
    console.error('AI diagnosis error:', error)
    return c.json({ ok: false, error: 'Failed to generate diagnosis' }, 500)
  }
})

// AI Chat Assistant
ai.post('/chat', async (c) => {
  try {
    const body = await c.req.json()
    const data = chatRequestSchema.parse(body)

    const apiKey = c.env.OPENAI_API_KEY || c.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return c.json({
        ok: false,
        error: 'AI service not configured. Please add OPENAI_API_KEY or ANTHROPIC_API_KEY to Cloudflare Workers secrets.',
      }, 503)
    }

    const messages = buildChatMessages(data)

    let responseText: string
    let model: string

    if (c.env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.5,
          max_tokens: 1000,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('OpenAI chat error:', error)
        throw new Error('AI chat failed')
      }

      const result = await response.json() as { choices: Array<{ message: { content: string } }> }
      responseText = result.choices[0]?.message?.content ?? 'No response generated'
      model = 'gpt-4o-mini'
    } else {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': c.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          system: SYSTEM_CHAT_PROMPT,
          messages: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
          temperature: 0.5,
          max_tokens: 1000,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('Anthropic chat error:', error)
        throw new Error('AI chat failed')
      }

      const result = await response.json() as { content: Array<{ text: string }> }
      responseText = result.content[0]?.text ?? 'No response generated'
      model = 'claude-3-haiku-20240307'
    }

    // Save chat to Firestore
    const db = getDb()
    const chatId = db.collection('aiChats').doc().id
    await db.collection('aiChats').doc(chatId).set({
      ...data,
      response: responseText,
      model,
      createdAt: new Date(),
    })

    return c.json({ ok: true, response: responseText, model })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ ok: false, error: 'Validation error', details: error.errors }, 400)
    }
    console.error('AI chat error:', error)
    return c.json({ ok: false, error: 'Failed to generate response' }, 500)
  }
})

// Get diagnosis history
ai.get('/diagnoses', async (c) => {
  try {
    const { limit = '20', offset = '0' } = c.req.query()
    const db = getDb()

    const snapshot = await db.collection('aiDiagnoses')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset))
      .get()

    const diagnoses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return c.json({ ok: true, diagnoses })
  } catch (error) {
    console.error('Get diagnoses error:', error)
    return c.json({ ok: false, error: 'Failed to get diagnoses' }, 500)
  }
})

// Get chat history
ai.get('/chats', async (c) => {
  try {
    const { limit = '20', offset = '0' } = c.req.query()
    const db = getDb()

    const snapshot = await db.collection('aiChats')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset))
      .get()

    const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return c.json({ ok: true, chats })
  } catch (error) {
    console.error('Get chats error:', error)
    return c.json({ ok: false, error: 'Failed to get chats' }, 500)
  }
})

// ============================================================================
// Prompt Builders
// ============================================================================

const SYSTEM_DIAGNOSIS_PROMPT = `You are an expert appliance and electronics repair technician with 20+ years of experience.
Provide a structured, preliminary diagnosis based on the symptoms described.
Your response MUST include:
1. Most likely cause(s) - ranked by probability
2. Recommended diagnostic steps to confirm
3. Parts likely needed
4. Estimated repair difficulty (Easy/Medium/Hard/Expert)
5. Safety warnings specific to this device type
6. Whether professional repair is recommended

Be concise but thorough. This is for a repair shop management system.
Always emphasize this is PRELIMINARY and requires technician verification.`

const SYSTEM_CHAT_PROMPT = `You are FixFlow AI Assistant, a knowledgeable repair shop assistant.
Help technicians with repair questions, part identification, troubleshooting steps, and shop management.
Be practical, concise, and safety-conscious. Always remind users to verify critical information.`

function buildDiagnosisPrompt(data: z.infer<typeof diagnosisRequestSchema>): string {
  return `Device: ${data.deviceType} - ${data.deviceBrand} ${data.deviceModel}
Customer Complaint: ${data.complaint}
${data.symptoms?.length ? `Observed Symptoms: ${data.symptoms.join(', ')}` : ''}
${data.errorCodes?.length ? `Error Codes: ${data.errorCodes.join(', ')}` : ''}
${data.previousRepairs?.length ? `Previous Repairs: ${data.previousRepairs.join(', ')}` : ''}

Provide a structured preliminary diagnosis.`
}

function buildChatMessages(data: z.infer<typeof chatRequestSchema>): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_CHAT_PROMPT },
  ]

  if (data.context?.conversationHistory) {
    messages.push(...data.context.conversationHistory)
  }

  // Add context if provided
  if (data.context) {
    const contextParts = []
    if (data.context.deviceType) contextParts.push(`Device: ${data.context.deviceType}`)
    if (data.context.deviceBrand) contextParts.push(`Brand: ${data.context.deviceBrand}`)
    if (data.context.deviceModel) contextParts.push(`Model: ${data.context.deviceModel}`)
    if (data.context.complaint) contextParts.push(`Issue: ${data.context.complaint}`)
    if (contextParts.length > 0) {
      messages.push({ role: 'user', content: `Context: ${contextParts.join(', ')}` })
    }
  }

  messages.push({ role: 'user', content: data.message })
  return messages
}

export { ai }