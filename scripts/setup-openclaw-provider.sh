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

ZEROGPU_API_URL="${ZEROGPU_API_URL:-https://api.zerogpu.ai/v1/responses}"
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

CONFIG_DIR="${HOME}/.openclaw/zerogpu"
CONFIG_PATH="${CONFIG_DIR}/config.json"
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

ZEROGPU_API_KEY="$ZEROGPU_API_KEY" \
ZEROGPU_PROJECT_ID="$ZEROGPU_PROJECT_ID" \
ZEROGPU_API_URL="$ZEROGPU_API_URL" \
node -e '
const fs = require("node:fs");
const path = process.argv[1];
const payload = {
  apiKey: process.env.ZEROGPU_API_KEY,
  projectId: process.env.ZEROGPU_PROJECT_ID,
  apiUrl: process.env.ZEROGPU_API_URL,
};
fs.writeFileSync(path, JSON.stringify(payload, null, 2), { mode: 0o600 });
' "$CONFIG_PATH"

provider_json="$(cat <<EOF
{
  "baseUrl": "https://api.zerogpu.ai/v1",
  "api": "openai-completions",
  "apiKey": "${ZEROGPU_API_KEY}",
  "headers": {
    "x-api-key": "${ZEROGPU_API_KEY}",
    "x-project-id": "${ZEROGPU_PROJECT_ID}"
  },
  "models": [
    { "id": "zlm-v1-iab-classify-edge", "name": "ZeroGPU IAB Classify" },
    { "id": "zlm-v1-followup-questions-edge", "name": "ZeroGPU Follow-up Questions" },
    { "id": "t5-small", "name": "ZeroGPU Summarize" },
    { "id": "gliner2-base-v1", "name": "ZeroGPU Extract" }
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
  summarize: "t5-small",
  classify: "zlm-v1-iab-classify-edge",
  extract: "gliner2-base-v1",
  followups: "zlm-v1-followup-questions-edge",
};

const DEFAULT_API_URL = "https://api.zerogpu.ai/v1/responses";

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
    process.env.ZEROGPU_ROUTER_CONFIG,
    path.join(os.homedir(), ".openclaw", "zerogpu", "config.json"),
    path.join(os.homedir(), "openclaw", "zerogpu", "config.json"),
  ].filter(Boolean);

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.apiKey && parsed?.projectId) return parsed;
  }

  if (process.env.ZEROGPU_API_KEY && process.env.ZEROGPU_PROJECT_ID) {
    return {
      apiKey: process.env.ZEROGPU_API_KEY,
      projectId: process.env.ZEROGPU_PROJECT_ID,
      apiUrl: process.env.ZEROGPU_API_URL || DEFAULT_API_URL,
    };
  }

  throw new Error("ZeroGPU credentials not found. Run the ZeroGPU Router setup script first.");
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

  const config = readConfig();
  const response = await fetch(config.apiUrl || DEFAULT_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "x-project-id": config.projectId,
    },
    body: JSON.stringify({
      text: { format: { type: "text" } },
      input: [{ role: "user", content: input }],
      model,
    }),
    signal: AbortSignal.timeout(Number(process.env.ZEROGPU_ROUTER_TIMEOUT_MS || 30000)),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.detail || body?.message || body?.error || `HTTP ${response.status}`;
    throw new Error(String(detail));
  }

  const content =
    body?.choices?.[0]?.message?.content ||
    body?.output_text ||
    body?.output?.flatMap?.((item) => item?.content || [])?.find?.((chunk) => typeof chunk?.text === "string")?.text ||
    body?.text ||
    JSON.stringify(body);
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
echo "Credentials: ${CONFIG_PATH}"
echo "Provider: models.providers.zerogpu (direct ZeroGPU API)"
if [[ "$INSTALL_ZEROGPU_SKILL" == "1" ]]; then
  echo "Skill: zerogpu"
  echo "CLI: zerogpu-router"
fi
if [[ "$SET_ZEROGPU_AS_DEFAULT" == "1" ]]; then
  echo "Primary model: ${PRIMARY_MODEL}"
else
  echo "Primary model: unchanged"
fi
echo "Credentials are stored locally at ${CONFIG_PATH}."
echo
echo "Verify with:"
echo "  openclaw config get models.providers.zerogpu"
echo "  openclaw config get agents.defaults.model.primary"
echo "  openclaw skills list | grep -i zerogpu"
echo "  zerogpu-router summarize \"Summarize this sentence.\""
