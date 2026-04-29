# openclaw+zerogpu

Hosted OpenAI-compatible provider adapter for routing OpenCLAW tasks to ZeroGPU.

OpenCLAW talks to this project through standard provider endpoints:

- `GET /v1/models`
- `POST /v1/chat/completions`

The adapter decodes each user's ZeroGPU credentials from the OpenCLAW provider `apiKey`, then forwards requests to ZeroGPU with `x-api-key` and `x-project-id`. Render or any shared host does not need user-specific ZeroGPU secrets.

## Quick Start For Users

Run the production installer in your OpenCLAW shell:

```bash
curl -fsSL https://raw.githubusercontent.com/zerogpu/ZeroGPU-OpenClaw-Plugin/main/scripts/setup-openclaw-provider.sh | bash
```

The installer asks for:

- `ZeroGPU API key`
- `ZeroGPU project ID`

It stores those credentials in OpenCLAW provider config as an encoded provider token. The hosted adapter stays stateless.

If OpenCLAW Cloud cannot restart the gateway automatically, use:

```bash
curl -fsSL https://raw.githubusercontent.com/zerogpu/ZeroGPU-OpenClaw-Plugin/main/scripts/setup-openclaw-provider.sh | SKIP_GATEWAY_RESTART=1 bash
```

Then restart or reload the gateway from the OpenCLAW Cloud UI.

## Clone-Based Setup

If you want to inspect or modify the installer locally:

```bash
git clone https://github.com/zerogpu/ZeroGPU-OpenClaw-Plugin.git
cd ZeroGPU-OpenClaw-Plugin
npm install
npm run setup:openclaw
```

You can pre-seed values for non-interactive environments:

```bash
ZEROGPU_API_KEY="YOUR_ZEROGPU_API_KEY" \
ZEROGPU_PROJECT_ID="YOUR_ZEROGPU_PROJECT_ID" \
npm run setup:openclaw
```

## Deploy The Adapter

Render is the fastest hosted path:

1. Create a Render Web Service from this repo.
2. Use build command `npm install`.
3. Use start command `npm start`.
4. Set health check path `/health`.

Do not add `ZEROGPU_API_KEY` or `ZEROGPU_PROJECT_ID` to Render. Users provide those during OpenCLAW setup.

## Local Development

```bash
npm install
npm start
```

The server listens on `http://localhost:8787` by default.

Useful checks:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/v1/models
curl http://localhost:8787/v1/zerogpu/models
```

Debug calls can pass credentials directly:

```bash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_ZEROGPU_API_KEY" \
  -H "x-project-id: YOUR_ZEROGPU_PROJECT_ID" \
  -d '{
    "model": "zerogpu/summarize",
    "messages": [
      { "role": "user", "content": "Summarize this feature request in 3 bullets." }
    ]
  }'
```

The old endpoint remains available as a compatibility alias:

- `POST /v1/zerogpu/chat/completions`

## Model Aliases

- `zerogpu/auto` routes based on task detection.
- `zerogpu/chat` uses general chat.
- `zerogpu/chat-thinking` uses reasoning-oriented chat.
- `zerogpu/summarize` routes summarization.
- `zerogpu/classify` routes classification.
- `zerogpu/extract` routes extraction.
- `zerogpu/followups` routes follow-up question generation.

## Dashboard

The adapter keeps the dashboard idea from the original prototype:

- `GET /dashboard/events?limit=50`
- `GET /dashboard/summary`

Runtime events are written to `plugin/tracking-events.jsonl`. That file is generated on demand and should not be committed.

## Configuration

Optional environment variables:

- `PORT` defaults to `8787`.
- `MODEL_CATALOG_URL` defaults to `https://api-dashboard.zerogpu.ai/api/models`.
- `INFERENCE_API_URL` defaults to `https://api.zerogpu.ai/v1/responses`.
- `INFERENCE_TIMEOUT_MS` defaults to `10000`.
- `INFERENCE_MAX_RETRIES` defaults to `2`.
- `DEFAULT_SHOW_SAVINGS` defaults to `true`.
- `ENABLE_AUTO_TASK_INFERENCE` defaults to `false`. Set `true` to enable keyword-based task inference for `zerogpu/auto`.

`ZEROGPU_API_KEY` and `ZEROGPU_PROJECT_ID` are only supported as local development fallbacks. Hosted deployments should rely on per-request credentials from OpenCLAW.

## Verify

```bash
npm run check
bash -n scripts/setup-openclaw-provider.sh
curl http://localhost:8787/health
curl http://localhost:8787/v1/models
```
