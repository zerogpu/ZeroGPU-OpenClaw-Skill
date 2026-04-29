---
name: zerogpu
description: Use ZeroGPU Router tools for small, well-scoped AI tasks. Trigger on summarization, classification, extraction, JSON/entity parsing, and follow-up question generation. Keep the normal primary model for general reasoning and chat.
metadata: {"openclaw":{"requires":{"bins":["openclaw"]},"homepage":"https://github.com/zerogpu/ZeroGPU-OpenClaw-Plugin"}}
---

# ZeroGPU Router Offload Skill

Use ZeroGPU Router as a task offload layer, not as the primary brain.

Keep the user's existing primary model for general conversation, coding, planning, debugging, and reasoning. When the user asks for one of the focused tasks below, call the matching ZeroGPU tool instead of answering directly.

## Required Tool Routing

- Summaries, TL;DR, "summarize this", bullet summaries, compression -> run `zerogpu-router summarize`.
- Labels, categories, intents, sentiment-style decisions, taxonomy -> run `zerogpu-router classify`.
- Extract fields, entities, JSON, names, dates, contacts, structured data -> run `zerogpu-router extract`.
- Generate follow-up questions, next questions, interview prompts -> run `zerogpu-router followups`.

## Do Not Use ZeroGPU For

- Deep reasoning
- Coding implementation
- Multi-step planning
- Debugging
- Broad research or synthesis
- Long-form creative writing

## Operating Rule

If the request is a focused task listed above, run the matching `zerogpu-router` command first and return its result. If the request needs reasoning or judgment beyond the command output, use the primary model after the command to explain or format the answer.

## Command Examples

```bash
zerogpu-router summarize <<'TEXT'
Text to summarize...
TEXT
```

```bash
zerogpu-router classify "Text to classify"
```

## Model Aliases

Model aliases are available for explicit model selection:

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
