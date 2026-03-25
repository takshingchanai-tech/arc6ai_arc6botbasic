import { SYSTEM_PROMPT } from './prompt'
import WIDGET_JS from './widget.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request: Request, env: { OPENAI_API_KEY: string }): Promise<Response> {
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
          'Cache-Control': 'public, max-age=300', // 5-minute cache
        },
      })
    }

    // ── Chat API ────────────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/chat') {
      if (!env.OPENAI_API_KEY) {
        return new Response('OPENAI_API_KEY is not configured', {
          status: 503,
          headers: CORS,
        })
      }

      try {
        const { messages } = await request.json() as { messages: { role: string; content: string }[] }

        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
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

    return new Response('Not found', { status: 404, headers: CORS })
  },
}
