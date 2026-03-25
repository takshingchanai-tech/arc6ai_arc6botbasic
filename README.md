# Arc6Bot Basic

Standalone Cloudflare Worker that powers the Arc6Bot chat widget and WhatsApp channel. Clients install the website widget by pasting 2 script tags — no backend setup required on their side.

## What It Does

| Endpoint | Description |
|---|---|
| `GET /widget.js` | Serves the embeddable chat widget |
| `POST /chat` | Streaming chat API (OpenAI gpt-4o-mini) |
| `GET /whatsapp` | Meta webhook verification |
| `POST /whatsapp` | Receive WhatsApp messages, reply via OpenAI |

## Getting Started

```bash
npm install
npm run dev    # local dev at http://localhost:8787
```

Set your OpenAI key for local dev:
```bash
echo "OPENAI_API_KEY=sk-..." > .dev.vars
```

## Deploy

```bash
npm run deploy
```

Live at: `https://arc6bot.takshingchanai.workers.dev`

## Per-Client System Prompts

Each client is identified by a `clientId`. Their system prompt is stored in Cloudflare KV.

```bash
# Add / update a client prompt
npx wrangler kv key put --namespace-id=7d9a3204cc3c4ceca755e54e88e7cc11 --remote "client-id" "You are a helpful assistant for..."

# Read a client prompt
npx wrangler kv key get --namespace-id=7d9a3204cc3c4ceca755e54e88e7cc11 --remote "client-id"

# List all clients
npx wrangler kv key list --namespace-id=7d9a3204cc3c4ceca755e54e88e7cc11 --remote
```

## Client Install Snippet

Give each client this snippet to paste into their website before `</body>`:

```html
<script>
  window.Arc6BotConfig = {
    apiUrl: 'https://arc6bot.takshingchanai.workers.dev/chat',
    clientId: 'their-client-id',
    accentColor: '#6366F1',
    greeting: 'Hi! How can I help you today?',
    botName: 'MyBot',
    poweredBy: 'Powered by Arc6AI'
  }
</script>
<script src="https://arc6bot.takshingchanai.workers.dev/widget.js"></script>
```

## File Structure

```
src/
├── index.ts    # Worker entry — all routes
├── widget.js   # Embeddable vanilla JS chat widget
├── widget.d.ts # TypeScript type declaration for widget.js
└── prompt.ts   # Default system prompt (fallback)
```

## WhatsApp Setup (one-time per deployment)

1. Fill in `WHATSAPP_PHONE_NUMBER_ID` in `wrangler.toml [vars]`, then deploy
2. Set secrets:
   ```bash
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put WHATSAPP_TOKEN         # Meta Graph API access token
   npx wrangler secret put WHATSAPP_VERIFY_TOKEN  # any string you choose
   ```
3. In Meta Developer Console → WhatsApp → Configuration, point the webhook to `https://arc6bot.takshingchanai.workers.dev/whatsapp` with your chosen verify token

## Onboarding a WhatsApp Client

Each client's WhatsApp number gets its own system prompt in KV, keyed by their **Meta phone number ID** (found in Meta Developer Console):

```bash
npx wrangler kv key put --namespace-id=7d9a3204cc3c4ceca755e54e88e7cc11 --remote "123456789012345" "You are the assistant for ABC Bakery on WhatsApp..."
```

No redeployment needed. Conversation history is stored per (business number × user), 24h TTL, last 20 messages.
