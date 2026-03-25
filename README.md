# Arc6Bot Basic

Standalone Cloudflare Worker that powers the Arc6Bot chat widget. Clients install it by pasting 2 script tags into their website — no backend setup required on their side.

## What It Does

| Endpoint | Description |
|---|---|
| `GET /widget.js` | Serves the embeddable chat widget |
| `POST /chat` | Streaming chat API (OpenAI gpt-4o-mini) |
| `GET /whatsapp` | Meta webhook verification (planned) |
| `POST /whatsapp` | WhatsApp message handler (planned) |

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

## Secrets

```bash
npx wrangler secret put OPENAI_API_KEY
```
