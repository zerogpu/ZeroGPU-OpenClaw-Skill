---
name: zerogpu
description: ZeroGPU Router for OpenCLAW. Route lightweight tasks like summarization, classification, extraction, and follow-up generation through ZeroGPU using zerogpu/auto or task-specific model aliases.
metadata: {"openclaw":{"requires":{"bins":["openclaw"]},"homepage":"https://github.com/zerogpu/ZeroGPU-OpenClaw-Plugin"}}
---

# ZeroGPU Router for OpenCLAW

Use ZeroGPU for well-scoped tasks that do not need a large reasoning model:

- summarization
- classification
- extraction
- follow-up question generation
- lightweight chat

## Model Aliases

- `zerogpu/auto`
- `zerogpu/summarize`
- `zerogpu/classify`
- `zerogpu/extract`
- `zerogpu/followups`
- `zerogpu/chat`
- `zerogpu/chat-thinking`

Prefer task-specific aliases when intent is clear. Use `zerogpu/auto` as the default ZeroGPU route.

## Setup

Production install:

```bash
openclaw plugins install zerogpu-router
openclaw providers setup zerogpu
openclaw gateway restart
```

The setup wizard asks for the user's ZeroGPU API key and project ID, then writes a standard OpenAI-compatible provider entry for the hosted adapter.

## Privacy

The hosted adapter does not store user credentials. Credentials are encoded into the user's OpenCLAW provider config and sent to the adapter per request.
