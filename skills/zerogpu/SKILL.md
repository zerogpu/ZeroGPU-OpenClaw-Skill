---
name: zerogpu
description: ZeroGPU Router for OpenCLAW. Keep the user's normal primary model and offload lightweight tasks to ZeroGPU tools for summarization, classification, extraction, and follow-up generation.
metadata: {"openclaw":{"requires":{"bins":["openclaw"]},"homepage":"https://github.com/zerogpu/ZeroGPU-OpenClaw-Plugin"}}
---

# ZeroGPU Router for OpenCLAW

Use ZeroGPU for well-scoped tasks that do not need a large reasoning model:

- summarization
- classification
- extraction
- follow-up question generation
- lightweight chat

## Tools And Model Aliases

Prefer tools when the user's primary model is not ZeroGPU:

- `zerogpu_summarize`
- `zerogpu_classify`
- `zerogpu_extract`
- `zerogpu_followups`

Model aliases are also available for explicit model selection:

- `zerogpu/auto`
- `zerogpu/summarize`
- `zerogpu/classify`
- `zerogpu/extract`
- `zerogpu/followups`
- `zerogpu/chat`
- `zerogpu/chat-thinking`

Do not make ZeroGPU the global default model unless the user explicitly asks. Keep normal OpenCLAW models such as `nearai/auto` as the primary brain, and use ZeroGPU as task offload.

## Setup

Production install:

```bash
openclaw plugins install zerogpu-router
openclaw gateway restart
```

Then configure credentials:

```bash
curl -fsSL https://raw.githubusercontent.com/zerogpu/ZeroGPU-OpenClaw-Plugin/main/scripts/setup-openclaw-provider.sh | bash
```

The setup script asks for the user's ZeroGPU API key and project ID, then writes a standard OpenAI-compatible provider entry for the hosted adapter without changing the primary model.

## Privacy

The hosted adapter does not store user credentials. Credentials are encoded into the user's OpenCLAW provider config and sent to the adapter per request.
