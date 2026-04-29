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
