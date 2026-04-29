# ZeroGPU Router Provider Spec

## Primary Endpoints

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`

## Compatibility Endpoints

- `POST /v1/zerogpu/chat/completions`
- `GET /v1/zerogpu/models`
- `GET /dashboard/events?limit=50`
- `GET /dashboard/summary`

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

## Authentication

The hosted adapter accepts either:

- `Authorization: Bearer zgpu-user-<base64url-json>` from OpenCLAW provider config.
- `x-api-key` and `x-project-id` headers for curl/debug.

The encoded credential JSON shape is:

```json
{
  "apiKey": "zgpu-...",
  "projectId": "..."
}
```

## Runtime Behavior

1. Decode per-request ZeroGPU credentials.
2. Resolve provider aliases such as `zerogpu/auto` or `zerogpu/summarize`.
3. Fetch or fallback to the local ZeroGPU model catalog.
4. Pick a compatible model for the task.
5. Call ZeroGPU `POST /v1/responses`.
6. Return normalized OpenAI-compatible chat completion output.
7. Append a local tracking event for dashboard summaries.

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
