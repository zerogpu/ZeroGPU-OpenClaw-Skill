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
