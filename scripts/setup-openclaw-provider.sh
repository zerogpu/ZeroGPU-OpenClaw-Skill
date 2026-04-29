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
openclaw config set agents.defaults.model.primary "$PRIMARY_MODEL"

if [[ "${SKIP_GATEWAY_RESTART:-0}" == "1" ]]; then
  echo "Skipped gateway restart because SKIP_GATEWAY_RESTART=1."
elif ! openclaw gateway restart; then
  echo "OpenCLAW config was updated, but gateway restart failed."
  echo "If you are in OpenCLAW Cloud, restart/reload the gateway from the cloud UI or run: openclaw gateway"
fi

echo "OpenCLAW configured for ZeroGPU."
echo "Provider: models.providers.zerogpu"
echo "Primary model: ${PRIMARY_MODEL}"
echo "Credentials are stored in OpenCLAW provider config, not in the hosted adapter."
echo
echo "Verify with:"
echo "  openclaw config get models.providers.zerogpu"
echo "  openclaw config get agents.defaults.model.primary"
