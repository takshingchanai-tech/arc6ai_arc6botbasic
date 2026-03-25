# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# User instruction:
"After building or adding new features to the project or app, always run the tests and check the logs until every new functions and features work properly. And update both Readme.md and Claude.md."

## What This Repo Is

**Arc6Bot Basic** — a standalone Cloudflare Worker that provides:
1. `GET /widget.js` — embeddable vanilla JS chat widget (clients paste 2 script tags to install)
2. `POST /chat` — chat API with streaming OpenAI responses, per-client system prompts via KV
3. `GET /whatsapp` — Meta webhook verification
4. `POST /whatsapp` — WhatsApp Business API: read inbound messages, reply via OpenAI, persist conversation history in KV

This is a **product repo**, separate from the Arc6AI website. The website (`arc6ai_website`) is just one of many clients that install this widget.

## Commands

```bash
npm run dev      # local dev server at http://localhost:8787
npm run deploy   # deploy to Cloudflare Workers (arc6bot.takshingchanai.workers.dev)
```

There is no test suite or linter configured. TypeScript is compiled directly by wrangler — no separate `tsc` step needed.

```bash
# Manage per-client system prompts in KV
npx wrangler kv key put --namespace-id=7d9a3204cc3c4ceca755e54e88e7cc11 --remote "client-id" "system prompt text"
npx wrangler kv key get --namespace-id=7d9a3204cc3c4ceca755e54e88e7cc11 --remote "client-id"
npx wrangler kv key list --namespace-id=7d9a3204cc3c4ceca755e54e88e7cc11 --remote

# Manage secrets
npx wrangler secret put OPENAI_API_KEY
```

## File Structure

```
src/
├── index.ts      # Worker entry point — all routes (widget.js, /chat, /whatsapp)
├── widget.js     # Vanilla JS embeddable widget (inlined as text via wrangler rules)
├── widget.d.ts   # TypeScript declaration for widget.js import
└── prompt.ts     # Default system prompt (fallback when clientId not found in KV)
wrangler.toml     # Worker config — name, KV binding, text rules
package.json
```

## Architecture

### Routing (index.ts)
- `OPTIONS *` — CORS preflight
- `GET /widget.js` — serves `widget.js` with `Content-Type: application/javascript`
- `POST /chat` — accepts `{ messages, clientId }`, streams OpenAI response
- `GET /whatsapp` — Meta webhook verification (`hub.mode`, `hub.verify_token`, `hub.challenge`)
- `POST /whatsapp` — receive WhatsApp messages → look up history → call OpenAI (non-streaming) → send reply → persist history

### Per-Client System Prompts (Cloudflare KV)
- KV namespace binding: `PROMPTS` (id: `7d9a3204cc3c4ceca755e54e88e7cc11`)
- Worker reads `clientId` from POST body → looks up `env.PROMPTS.get(clientId)`
- Falls back to `SYSTEM_PROMPT` from `prompt.ts` if not found
- Arc6AI website uses `clientId: 'arc6ai'` (prompt stored in KV)

### Widget Config (client install snippet)
Clients paste this into their website:
```html
<script>
  window.Arc6BotConfig = {
    apiUrl: 'https://arc6bot.takshingchanai.workers.dev/chat',
    clientId: 'their-client-id',
    accentColor: '#6366F1',
    greeting: 'Hi! How can I help?',
    botName: 'MyBot',
    poweredBy: 'Powered by Arc6AI'
  }
</script>
<script src="https://arc6bot.takshingchanai.workers.dev/widget.js"></script>
```

### Widget (widget.js)
- Pure vanilla JS IIFE, no framework dependencies
- Reads `window.Arc6BotConfig` for all configuration
- Sends `{ messages, clientId }` to `apiUrl` on each message
- Streams response via Fetch Streams API
- UI: floating bottom-right button + slide-in panel from right
- `widget.js` is imported into `index.ts` as a raw string via the wrangler `[[rules]]` `type = "Text"` config in `wrangler.toml` — `widget.d.ts` exists solely to satisfy TypeScript for this non-standard import

### Streaming Pipeline
The `/chat` endpoint converts OpenAI's SSE stream (lines like `data: {...}`) into a plain UTF-8 text stream of content chunks. The widget reads this directly with `getReader()` — there is no SSE parsing on the client side.

### CORS
All responses include `Access-Control-Allow-Origin: *` so any client website can call the API.

## Environment Variables / Secrets

| Name | Where | Description |
|---|---|---|
| `OPENAI_API_KEY` | Cloudflare Worker secret | Required for /chat and /whatsapp endpoints |
| `WHATSAPP_TOKEN` | Cloudflare Worker secret | Meta Graph API access token |
| `WHATSAPP_VERIFY_TOKEN` | Cloudflare Worker secret | Webhook verification token (you choose this value) |
| `WHATSAPP_PHONE_NUMBER_ID` | wrangler.toml `[vars]` | Meta phone number ID (from Meta Developer Console) |

Set secrets via: `npx wrangler secret put SECRET_NAME`

## Deployment

Deployed at: `https://arc6bot.takshingchanai.workers.dev`

```bash
npm run deploy
```

## Onboarding a New Client

1. Choose a `clientId` (e.g. `abc-bakery`)
2. Write their system prompt to KV:
   ```bash
   npx wrangler kv key put --namespace-id=7d9a3204cc3c4ceca755e54e88e7cc11 --remote "abc-bakery" "You are a helpful assistant for ABC Bakery..."
   ```
3. Give the client their install snippet with `clientId: 'abc-bakery'`
4. No redeployment needed — KV updates take effect immediately

## WhatsApp Setup (one-time)

1. Fill in `WHATSAPP_PHONE_NUMBER_ID` in `wrangler.toml [vars]`
2. Deploy: `npm run deploy`
3. Set secrets:
   ```bash
   npx wrangler secret put WHATSAPP_TOKEN
   npx wrangler secret put WHATSAPP_VERIFY_TOKEN
   ```
4. In Meta Developer Console → WhatsApp → Configuration, set webhook URL to `https://arc6bot.takshingchanai.workers.dev/whatsapp` and verify token to match what you set for `WHATSAPP_VERIFY_TOKEN`
5. Set a system prompt for this WhatsApp number in KV using the Meta phone number ID as the key:
   ```bash
   npx wrangler kv key put --namespace-id=7d9a3204cc3c4ceca755e54e88e7cc11 --remote "123456789012345" "You are the assistant for ABC Bakery on WhatsApp..."
   ```

### WhatsApp Architecture
- **Per-client isolation**: system prompt is looked up by `metadata.phone_number_id` (the Meta phone number ID of the receiving business). Each client WhatsApp number gets its own prompt in KV.
- **Conversation history** stored in KV under `wa:history:{phoneNumberId}:{userPhone}`, max 20 messages, 24h TTL — scoped per (business number × user) so clients never share context
- `POST /whatsapp` acknowledges Meta with `200 OK` immediately; all AI+KV+send work runs in `ctx.waitUntil()` to avoid Meta retries
- Non-streaming OpenAI call (WhatsApp needs a complete text payload, not a stream)
- Only `type: "text"` messages are processed; delivery receipts and media are silently ignored
