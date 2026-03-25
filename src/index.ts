import { SYSTEM_PROMPT } from './prompt'
import WIDGET_JS from './widget.js'

interface Env {
  OPENAI_API_KEY: string
  PROMPTS: KVNamespace
  WHATSAPP_TOKEN: string
  WHATSAPP_VERIFY_TOKEN: string
  WHATSAPP_PHONE_NUMBER_ID: string
}

type Message = { role: string; content: string }

interface WAMessage {
  from: string
  id: string
  type: string
  text?: { body: string }
}

interface WAWebhookBody {
  object: string
  entry: Array<{
    changes: Array<{
      value: {
        messages?: WAMessage[]
        metadata: { phone_number_id: string }
      }
    }>
  }>
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

async function getWAHistory(env: Env, phoneNumberId: string, userPhone: string): Promise<Message[]> {
  const raw = await env.PROMPTS.get(`wa:history:${phoneNumberId}:${userPhone}`)
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

async function saveWAHistory(env: Env, phoneNumberId: string, userPhone: string, messages: Message[]): Promise<void> {
  await env.PROMPTS.put(
    `wa:history:${phoneNumberId}:${userPhone}`,
    JSON.stringify(messages.slice(-20)),
    { expirationTtl: 86400 },
  )
}

async function sendWhatsAppMessage(env: Env, to: string, text: string): Promise<void> {
  await fetch(`https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })
}

async function handleWhatsApp(body: WAWebhookBody, env: Env): Promise<void> {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value.metadata.phone_number_id

      for (const msg of change.value.messages ?? []) {
        // Only handle inbound text messages
        if (msg.type !== 'text' || !msg.text?.body) continue

        const userPhone = msg.from
        const userText = msg.text.body

        // Per-client: look up prompt by Meta phone number ID (same clientId pattern as website widget)
        // Falls back to default system prompt if no KV entry exists for this WhatsApp number
        const systemPrompt = (await env.PROMPTS.get(phoneNumberId)) ?? SYSTEM_PROMPT

        // History is scoped per (WhatsApp business number × user phone) so clients don't share context
        const history = await getWAHistory(env, phoneNumberId, userPhone)

        let reply: string
        try {
          const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userText }],
              stream: false,
              max_tokens: 800,
              temperature: 0.65,
            }),
          })
          const data = await openaiRes.json() as { choices: Array<{ message: { content: string } }> }
          reply = data.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response."
        } catch {
          reply = "Sorry, I'm having trouble responding right now. Please try again later."
        }

        await saveWAHistory(env, phoneNumberId, userPhone, [
          ...history,
          { role: 'user', content: userText },
          { role: 'assistant', content: reply },
        ])

        await sendWhatsAppMessage(env, userPhone, reply)
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // ── CORS preflight ──────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    // ── Serve embeddable widget script ──────────────────────────────
    if (request.method === 'GET' && url.pathname === '/widget.js') {
      return new Response(WIDGET_JS, {
        headers: {
          ...CORS,
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      })
    }

    // ── Chat API ────────────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/chat') {
      if (!env.OPENAI_API_KEY) {
        return new Response('OPENAI_API_KEY is not configured', { status: 503, headers: CORS })
      }

      try {
        const { messages, clientId } = await request.json() as { messages: Message[]; clientId?: string }
        const systemPrompt = (clientId ? await env.PROMPTS.get(clientId) : null) ?? SYSTEM_PROMPT

        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            stream: true,
            max_tokens: 800,
            temperature: 0.65,
          }),
        })

        if (!openaiRes.ok) {
          const err = await openaiRes.text()
          return new Response(`OpenAI error: ${err}`, { status: 502, headers: CORS })
        }

        // Stream SSE → plain text chunks
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          async start(controller) {
            const reader = openaiRes.body!.getReader()
            const decoder = new TextDecoder()
            let buf = ''
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += decoder.decode(value, { stream: true })
                const lines = buf.split('\n')
                buf = lines.pop() ?? ''
                for (const line of lines) {
                  if (!line.startsWith('data: ')) continue
                  const data = line.slice(6).trim()
                  if (data === '[DONE]') continue
                  try {
                    const chunk = JSON.parse(data)
                    const content = chunk.choices?.[0]?.delta?.content ?? ''
                    if (content) controller.enqueue(encoder.encode(content))
                  } catch {}
                }
              }
              controller.close()
            } catch (e) {
              controller.error(e)
            }
          },
        })

        return new Response(stream, {
          headers: {
            ...CORS,
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Failed to process request' }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
    }

    // ── WhatsApp webhook verification ───────────────────────────────
    if (request.method === 'GET' && url.pathname === '/whatsapp') {
      const mode      = url.searchParams.get('hub.mode')
      const token     = url.searchParams.get('hub.verify_token')
      const challenge = url.searchParams.get('hub.challenge')
      if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 })
      }
      return new Response('Forbidden', { status: 403 })
    }

    // ── WhatsApp incoming messages ──────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/whatsapp') {
      try {
        const body = await request.json() as WAWebhookBody
        ctx.waitUntil(handleWhatsApp(body, env))
      } catch {}
      // Always return 200 immediately — Meta retries if it doesn't get one
      return new Response('OK', { status: 200 })
    }

    return new Response('Not found', { status: 404, headers: CORS })
  },
}
