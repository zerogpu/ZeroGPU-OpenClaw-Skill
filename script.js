const sampleRows = [
  {
    task: "Classification (IAB)",
    model: "zlm-v1-iab-classify-edge-enriched",
    tokens: 247,
    zeroGpu: 0.00005,
    llm: 0.00247,
  },
  {
    task: "Summarization",
    model: "t5-small",
    tokens: 76,
    zeroGpu: 0.000014,
    llm: 0.00076,
  },
  {
    task: "Follow-up generation",
    model: "zlm-v1-followup-questions-edge",
    tokens: 82,
    zeroGpu: 0.000026,
    llm: 0.00082,
  },
  {
    task: "Extraction (NER)",
    model: "gliner2-base-v1",
    tokens: 89,
    zeroGpu: 0.00002,
    llm: 0.00089,
  },
];

const installPrompt = `Set up ZeroGPU-OpenClaw-Skill locally for me and configure it as a tool.

Steps to execute:
1) Clone and run
- git clone https://github.com/zerogpu/ZeroGPU-OpenClaw-Plugin.git
- cd ZeroGPU-OpenClaw-Plugin
- npm install
- export ZEROGPU_API_KEY="<PASTE_MY_API_KEY>"
- export ZEROGPU_PROJECT_ID="<PASTE_MY_PROJECT_ID>"
- npm start

2) Verify plugin
- curl http://localhost:8787/health
- curl http://localhost:8787/v1/models

3) Register OpenClaw HTTP tool
- name: zerogpu_chat
- method: POST
- url: http://localhost:8787/v1/zerogpu/chat/completions
- headers: content-type: application/json
- body:
{
  "model": "auto",
  "messages": [{ "role": "user", "content": "{{user_input}}" }]
}

4) Confirm setup
- Return health/models/test output and the latest dashboard event.`;

function usd(v) {
  return `$${v.toFixed(6)}`;
}

function renderRows() {
  const body = document.getElementById("results-body");
  if (!body) return;

  body.innerHTML = sampleRows
    .map((row) => {
      const savings = Math.max(0, row.llm - row.zeroGpu);
      return `<tr>
        <td>${row.task}</td>
        <td>${row.model}</td>
        <td>${row.tokens}</td>
        <td>${usd(row.zeroGpu)}</td>
        <td>${usd(row.llm)}</td>
        <td>${usd(savings)}</td>
      </tr>`;
    })
    .join("");
}

function setupPromptCopy() {
  const promptEl = document.getElementById("installPrompt");
  const copyBtn = document.getElementById("copyPromptBtn");
  const statusEl = document.getElementById("copyStatus");
  if (!promptEl || !copyBtn || !statusEl) return;

  promptEl.value = installPrompt;
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(promptEl.value);
      statusEl.textContent = "Copied. Paste into OpenClaw chat.";
    } catch {
      statusEl.textContent = "Copy failed. Select text and copy manually.";
    }
  });
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadModels() {
  const body = document.getElementById("models-body");
  const status = document.getElementById("modelsStatus");
  if (!body || !status) return;

  try {
    const res = await fetch("https://api-dashboard.zerogpu.ai/api/models");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const models = Array.isArray(json?.models) ? json.models : [];
    status.textContent = `${models.length} models loaded from api-dashboard.zerogpu.ai`;

    body.innerHTML = models
      .sort((a, b) => safeNumber(b.displayPriority) - safeNumber(a.displayPriority))
      .map((m) => {
        const p = m.pricing || {};
        const input = safeNumber(p.input_per_1m_tokens);
        const output = safeNumber(p.output_per_1m_tokens);
        return `<tr>
          <td>${m.modelId || "-"}</td>
          <td>${m.taskDisplayName || "-"}</td>
          <td>${m.parameters || "-"}</td>
          <td>${m.maxTokens || "-"}</td>
          <td>${usd(input)}</td>
          <td>${usd(output)}</td>
        </tr>`;
      })
      .join("");
  } catch (error) {
    status.textContent = "Failed to load live catalog. Check network/CORS and try again.";
    body.innerHTML = `<tr><td colspan="6">Unable to fetch model catalog.</td></tr>`;
  }
}

renderRows();
setupPromptCopy();
loadModels();
