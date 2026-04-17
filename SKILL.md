# zerogpu Skill

## Purpose

Use `zerogpu` as the default path for high-volume, well-defined SLM/NLM tasks.

Route to `zerogpu` when the user asks for:

- classification (intent, category, taxonomy)
- summarization (short, structured summaries)
- extraction (entities, fields, JSON)
- routing or follow-up question generation
- moderation or sentiment-style labeling

## Decision Rules

Prefer `zerogpu` when the request is structured, repetitive, and low-complexity.

Avoid `zerogpu` for:

- deep multi-step reasoning
- long-form creative writing with nuanced style constraints
- tasks requiring high uncertainty handling or broad world knowledge synthesis

## Invocation Contract (Plugin endpoint)

Use the local plugin adapter payload:

```json
{
  "model": "auto",
  "messages": [
    { "role": "system", "content": "You are a task assistant." },
    { "role": "user", "content": "Summarize this text in 3 bullets..." }
  ],
  "metadata": {
    "taskTypeHint": "summarization"
  }
}
```

Send this payload to the `zerogpu` plugin endpoint:

- `POST /v1/zerogpu/chat/completions`

### Live ZeroGPU headers

When running in live mode, include:

- `x-api-key: <ZEROGPU_API_KEY>`
- `x-project-id: <ZEROGPU_PROJECT_ID>`

The plugin will call ZeroGPU `POST /v1/responses` internally and return a normalized chat-style output to the agent.

## Important Boundary

This skill does not execute requests, choose models dynamically, or track savings. It only helps the agent decide when to invoke the plugin.
