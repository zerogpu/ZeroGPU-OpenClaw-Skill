# ZeroGPU Router Spec

## Primary Flow

The OpenCLAW skill calls the local `zerogpu-router` CLI. The CLI calls ZeroGPU directly:

- `POST https://api.zerogpu.ai/v1/responses`
- `x-api-key: <ZEROGPU_API_KEY>`
- `x-project-id: <ZEROGPU_PROJECT_ID>`

Credentials are stored locally at:

- `~/.openclaw/zerogpu/config.json`

## CLI Commands

- `zerogpu-router summarize`
- `zerogpu-router classify`
- `zerogpu-router extract`
- `zerogpu-router followups`

## Request

```json
{
  "model": "zerogpu/auto",
  "messages": [
    { "role": "system", "content": "You are helpful." },
    { "role": "user", "content": "Summarize this transcript in 3 bullets." }
  ],
  "metadata": {
    "taskTypeHint": "summarization"
  }
}
```

## Optional Hosted Adapter

The Render adapter remains available for legacy OpenAI-compatible provider experiments:

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `GET /dashboard/events?limit=50`
- `GET /dashboard/summary`

## Runtime Behavior

1. Read local credentials.
2. Choose a ZeroGPU model for the task.
3. Call ZeroGPU `POST /v1/responses`.
4. Return text output to OpenCLAW.

## Tracking Event Schema

```json
{
  "timestamp": "2026-04-29T13:40:11.200Z",
  "taskType": "summarization",
  "model": "t5-small",
  "latencyMs": 320,
  "totalTokens": 124,
  "zerogpuCostUsd": 0.0000558,
  "estimatedLlmCostUsd": 0.00124,
  "savingsUsd": 0.0011842
}
```
