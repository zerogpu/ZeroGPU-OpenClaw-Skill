#!/usr/bin/env bash
set -euo pipefail

if ! command -v openclaw >/dev/null 2>&1; then
  echo "openclaw is not installed or not on PATH"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is not installed or not on PATH"
  exit 1
fi

ADAPTER_BASE_URL="${ADAPTER_BASE_URL:-https://zerogpu-openclaw-plugin.onrender.com/v1}"
PRIMARY_MODEL="${PRIMARY_MODEL:-zerogpu/auto}"
SET_ZEROGPU_AS_DEFAULT="${SET_ZEROGPU_AS_DEFAULT:-0}"
INSTALL_ZEROGPU_SKILL="${INSTALL_ZEROGPU_SKILL:-1}"
ZEROGPU_API_KEY="${ZEROGPU_API_KEY:-}"
ZEROGPU_PROJECT_ID="${ZEROGPU_PROJECT_ID:-}"

if [[ -z "$ZEROGPU_API_KEY" ]]; then
  read -r -s -p "ZeroGPU API key: " ZEROGPU_API_KEY
  echo
fi

if [[ -z "$ZEROGPU_PROJECT_ID" ]]; then
  read -r -p "ZeroGPU project ID: " ZEROGPU_PROJECT_ID
fi

if [[ -z "$ZEROGPU_API_KEY" || -z "$ZEROGPU_PROJECT_ID" ]]; then
  echo "ZeroGPU API key and project ID are required."
  exit 1
fi

credential_token="$(
  ZEROGPU_API_KEY="$ZEROGPU_API_KEY" ZEROGPU_PROJECT_ID="$ZEROGPU_PROJECT_ID" node -e '
const payload = {
  apiKey: process.env.ZEROGPU_API_KEY,
  projectId: process.env.ZEROGPU_PROJECT_ID,
};
process.stdout.write("zgpu-user-" + Buffer.from(JSON.stringify(payload)).toString("base64url"));
'
)"

provider_json="$(cat <<EOF
{
  "baseUrl": "${ADAPTER_BASE_URL}",
  "api": "openai-completions",
  "apiKey": "${credential_token}",
  "models": [
    { "id": "zerogpu/auto", "name": "ZeroGPU Auto" },
    { "id": "zerogpu/chat", "name": "ZeroGPU Chat" },
    { "id": "zerogpu/chat-thinking", "name": "ZeroGPU Chat Thinking" },
    { "id": "zerogpu/summarize", "name": "ZeroGPU Summarize" },
    { "id": "zerogpu/classify", "name": "ZeroGPU Classify" },
    { "id": "zerogpu/extract", "name": "ZeroGPU Extract" },
    { "id": "zerogpu/followups", "name": "ZeroGPU Follow-up Questions" }
  ]
}
EOF
)"

openclaw config set models.providers.zerogpu "$provider_json"

if [[ "$SET_ZEROGPU_AS_DEFAULT" == "1" ]]; then
  openclaw config set agents.defaults.model.primary "$PRIMARY_MODEL"
else
  echo "Leaving existing primary model unchanged."
  echo "Set SET_ZEROGPU_AS_DEFAULT=1 if you want ${PRIMARY_MODEL} as the global default."
fi

install_skill_dir() {
  local skill_dir="$1"
  mkdir -p "$skill_dir"
  cat > "${skill_dir}/SKILL.md" <<'EOF'
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
EOF
}

install_cli() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"
  cat > "${bin_dir}/zerogpu-router" <<'EOF'
#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TASK_MODELS = {
  summarize: "zerogpu/summarize",
  classify: "zerogpu/classify",
  extract: "zerogpu/extract",
  followups: "zerogpu/followups",
};

function usage() {
  console.error(`Usage:
  zerogpu-router summarize [text]
  zerogpu-router classify [text]
  zerogpu-router extract [text]
  zerogpu-router followups [text]

If text is omitted, input is read from stdin.`);
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function readConfig() {
  const candidates = [
    process.env.OPENCLAW_CONFIG_PATH,
    path.join(os.homedir(), ".openclaw", "openclaw.json"),
    path.join(os.homedir(), "openclaw", "openclaw.json"),
  ].filter(Boolean);

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const provider = parsed?.models?.providers?.zerogpu;
    if (provider?.baseUrl && provider?.apiKey) return provider;
  }
  throw new Error("ZeroGPU provider config not found. Run the ZeroGPU Router setup script first.");
}

async function main() {
  const task = String(process.argv[2] || "").trim().toLowerCase();
  const model = TASK_MODELS[task];
  if (!model) {
    usage();
    process.exit(2);
  }

  const input = process.argv.slice(3).join(" ").trim() || readStdin().trim();
  if (!input) {
    console.error("Input text is required.");
    process.exit(2);
  }

  const provider = readConfig();
  const response = await fetch(`${String(provider.baseUrl).replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: input }],
    }),
    signal: AbortSignal.timeout(Number(process.env.ZEROGPU_ROUTER_TIMEOUT_MS || 30000)),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.detail || body?.message || body?.error || `HTTP ${response.status}`;
    throw new Error(String(detail));
  }

  const content = body?.choices?.[0]?.message?.content || "";
  process.stdout.write(`${content.trim()}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
EOF
  chmod +x "${bin_dir}/zerogpu-router"
}

if [[ "$INSTALL_ZEROGPU_SKILL" == "1" ]]; then
  install_skill_dir "${PWD}/skills/zerogpu"
  install_cli "${PWD}/bin"
  if [[ -d "${HOME}/.openclaw" ]]; then
    install_skill_dir "${HOME}/.openclaw/skills/zerogpu"
    install_cli "${HOME}/.openclaw/bin"
  fi
  echo "Installed ZeroGPU skill guidance and CLI helper."
fi

if [[ "${SKIP_GATEWAY_RESTART:-0}" == "1" ]]; then
  echo "Skipped gateway restart because SKIP_GATEWAY_RESTART=1."
elif ! openclaw gateway restart; then
  echo "OpenCLAW config was updated, but gateway restart failed."
  echo "If you are in OpenCLAW Cloud, restart/reload the gateway from the cloud UI or run: openclaw gateway"
fi

echo "OpenCLAW configured for ZeroGPU."
echo "Provider: models.providers.zerogpu"
if [[ "$INSTALL_ZEROGPU_SKILL" == "1" ]]; then
  echo "Skill: zerogpu"
  echo "CLI: zerogpu-router"
fi
if [[ "$SET_ZEROGPU_AS_DEFAULT" == "1" ]]; then
  echo "Primary model: ${PRIMARY_MODEL}"
else
  echo "Primary model: unchanged"
fi
echo "Credentials are stored in OpenCLAW provider config, not in the hosted adapter."
echo
echo "Verify with:"
echo "  openclaw config get models.providers.zerogpu"
echo "  openclaw config get agents.defaults.model.primary"
echo "  openclaw skills list | grep -i zerogpu"
echo "  zerogpu-router summarize \"Summarize this sentence.\""
