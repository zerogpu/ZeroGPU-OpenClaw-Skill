import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 8787);
const CATALOG_PATH = path.join(__dirname, "model-catalog.json");
const TRACKING_PATH = path.join(__dirname, "tracking-events.jsonl");
const CATALOG_REFRESH_MS = 60_000;
const MODEL_CATALOG_URL = process.env.MODEL_CATALOG_URL || "https://api-dashboard.zerogpu.ai/api/models";
const ESTIMATED_LLM_COST_PER_1K = Number(process.env.ESTIMATED_LLM_COST_PER_1K || 0.01);
const INFERENCE_API_URL = process.env.INFERENCE_API_URL || "https://api.zerogpu.ai/v1/responses";
const INFERENCE_TIMEOUT_MS = Number(process.env.INFERENCE_TIMEOUT_MS || 10_000);
const INFERENCE_MAX_RETRIES = Number(process.env.INFERENCE_MAX_RETRIES || 2);
const DEFAULT_CLASSIFICATION_CATEGORIES = (process.env.DEFAULT_CLASSIFICATION_CATEGORIES ||
  "Technology,Business,Health,Sports,Entertainment,Politics,Finance,Education,Lifestyle").split(",");
const DEFAULT_API_KEY = process.env.ZEROGPU_API_KEY || "";
const DEFAULT_PROJECT_ID = process.env.ZEROGPU_PROJECT_ID || "";
const DEFAULT_SHOW_SAVINGS = String(process.env.DEFAULT_SHOW_SAVINGS || "true").toLowerCase() !== "false";

let catalogCache = { updatedAt: null, models: [] };
let lastCatalogLoad = 0;
let catalogSource = "local";

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

async function loadCatalog(force = false) {
  const now = Date.now();
  if (!force && now - lastCatalogLoad < CATALOG_REFRESH_MS && catalogCache.models.length > 0) {
    return catalogCache;
  }

  try {
    const remoteCatalog = await fetchRemoteCatalog();
    if (remoteCatalog.models.length > 0) {
      catalogCache = remoteCatalog;
      lastCatalogLoad = now;
      catalogSource = "remote";
      return catalogCache;
    }
  } catch (_) {
    // Fall through to local catalog if remote catalog is unavailable.
  }

  const raw = await fs.readFile(CATALOG_PATH, "utf8");
  catalogCache = JSON.parse(raw);
  lastCatalogLoad = now;
  catalogSource = "local";
  return catalogCache;
}

function toTaskTypeSet(...values) {
  const types = new Set();
  const text = values
    .flat()
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())
    .join(" ");

  if (text.includes("classif")) types.add("classification");
  if (text.includes("summar")) types.add("summarization");
  if (text.includes("extract") || text.includes("entity") || text.includes("pii") || text.includes("json")) {
    types.add("extraction");
  }
  if (text.includes("follow up") || text.includes("follow-up") || text.includes("question")) {
    types.add("follow_up_generation");
  }
  if (types.size === 0 && text.includes("text generation")) types.add("summarization");
  return [...types];
}

function mapRemoteModel(model) {
  const pricing = model.pricing || {};
  const inputPer1m = Number(pricing.input_per_1m_tokens || 0);
  const outputPer1m = Number(pricing.output_per_1m_tokens || 0);
  const blendedPer1k = inputPer1m || outputPer1m ? (inputPer1m + outputPer1m) / 2000 : 0.0005;

  const usecaseHints = [
    model.taskDisplayName,
    ...(pricing.use_cases || []),
    ...(Object.keys(model.modelUsecases || {}) || []),
  ];
  const supportedTaskTypes = toTaskTypeSet(usecaseHints);
  if (supportedTaskTypes.length === 0) return null;

  return {
    id: model.modelId,
    provider: "zerogpu",
    supportedTaskTypes,
    inputCostPer1kTokensUsd: Number((inputPer1m / 1000 || 0).toFixed(8)),
    outputCostPer1kTokensUsd: Number((outputPer1m / 1000 || 0).toFixed(8)),
    costPer1kTokensUsd: Number(blendedPer1k.toFixed(8)),
    avgLatencyMs: 200,
    maxTokens: model.maxTokens || null,
    quantized: Boolean(model.quantized),
  };
}

async function fetchRemoteCatalog() {
  const response = await fetch(MODEL_CATALOG_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch remote catalog: ${response.status}`);
  }
  const json = await response.json();
  if (!json?.success || !Array.isArray(json.models)) {
    throw new Error("Unexpected remote catalog response shape");
  }

  const models = json.models.map(mapRemoteModel).filter(Boolean);
  return {
    updatedAt: new Date().toISOString(),
    models,
  };
}

function detectTaskType(messages, taskTypeHint) {
  if (taskTypeHint) return taskTypeHint;
  const text = (messages || [])
    .map((m) => String(m.content || ""))
    .join("\n")
    .toLowerCase();

  if (text.includes("classify") || text.includes("label") || text.includes("category")) {
    return "classification";
  }
  if (text.includes("extract") || text.includes("pull out") || text.includes("parse")) {
    return "extraction";
  }
  if (text.includes("follow-up") || text.includes("follow up") || text.includes("next question")) {
    return "follow_up_generation";
  }
  if (text.includes("summarize") || text.includes("summary") || text.includes("tl;dr")) {
    return "summarization";
  }
  return "summarization";
}

function selectModels(catalog, taskType, messages, requestedModel) {
  const requested = String(requestedModel || "").trim();
  const hasRequested = requested && requested.toLowerCase() !== "auto";
  if (hasRequested) {
    const exact = catalog.models.find((m) => String(m.id || "").toLowerCase() === requested.toLowerCase());
    if (exact) {
      const others = catalog.models.filter((m) => m.id !== exact.id);
      return [exact, ...others];
    }
  }

  const candidates = catalog.models.filter((m) => (m.supportedTaskTypes || []).includes(taskType));
  if (candidates.length === 0) return [];
  const userText = (messages || [])
    .filter((m) => m?.role === "user")
    .map((m) => String(m?.content || ""))
    .join(" ")
    .toLowerCase();

  if (taskType === "classification" && userText.includes("iab")) {
    candidates.sort((a, b) => {
      const aIab = String(a.id || "").toLowerCase().includes("iab") ? 1 : 0;
      const bIab = String(b.id || "").toLowerCase().includes("iab") ? 1 : 0;
      if (aIab !== bIab) return bIab - aIab;
      return getBlendedCostPer1k(a) - getBlendedCostPer1k(b) || a.avgLatencyMs - b.avgLatencyMs;
    });
    return candidates;
  }

  candidates.sort((a, b) => getBlendedCostPer1k(a) - getBlendedCostPer1k(b) || a.avgLatencyMs - b.avgLatencyMs);
  return candidates;
}

function getBlendedCostPer1k(model) {
  if (typeof model.costPer1kTokensUsd === "number" && model.costPer1kTokensUsd > 0) {
    return model.costPer1kTokensUsd;
  }
  const input = Number(model.inputCostPer1kTokensUsd || 0);
  const output = Number(model.outputCostPer1kTokensUsd || 0);
  if (input > 0 || output > 0) return (input + output) / 2;
  return 0.0005;
}

function computeZeroGpuCostUsd(model, promptTokens, completionTokens) {
  const inputCostPer1k = Number(model.inputCostPer1kTokensUsd || 0);
  const outputCostPer1k = Number(model.outputCostPer1kTokensUsd || 0);

  if (inputCostPer1k > 0 || outputCostPer1k > 0) {
    return (promptTokens / 1000) * inputCostPer1k + (completionTokens / 1000) * outputCostPer1k;
  }

  // Backward-compatible fallback for local/static catalogs with only blended pricing.
  return ((promptTokens + completionTokens) / 1000) * getBlendedCostPer1k(model);
}

function estimateTokens(messages) {
  const chars = (messages || []).map((m) => String(m.content || "")).join(" ").length;
  return Math.max(1, Math.ceil(chars / 4));
}

function buildMockOutput(taskType, messages) {
  const userText = (messages || [])
    .filter((m) => m.role === "user")
    .map((m) => String(m.content || ""))
    .join("\n")
    .slice(0, 240);

  switch (taskType) {
    case "classification":
      return `Predicted class: general_request\nReason: message appears informational.\nInput preview: ${userText}`;
    case "extraction":
      return JSON.stringify(
        {
          entities: [],
          key_points: [userText || "No user text provided."],
        },
        null,
        2
      );
    case "follow_up_generation":
      return `1) What is your target output format?\n2) What constraints should I apply?\n3) Any examples to follow?`;
    case "summarization":
    default:
      return `- Main intent: user requests assistance.\n- Input preview: ${userText}\n- Suggested next step: execute task-specific action.`;
  }
}

function getRequestCredentials(req) {
  const projectId = req.headers["x-project-id"];
  const auth = req.headers.authorization || req.headers.Authorization;
  let apiKey = "";
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    apiKey = auth.slice(7).trim();
  }

  const headerApiKey = req.headers["x-api-key"];
  if (!apiKey && typeof headerApiKey === "string" && headerApiKey.trim()) {
    apiKey = headerApiKey.trim();
  }

  return {
    apiKey: apiKey || DEFAULT_API_KEY,
    projectId: (typeof projectId === "string" ? projectId.trim() : "") || DEFAULT_PROJECT_ID,
  };
}

function toResponsesInput(messages) {
  return (messages || []).map((m) => ({
    role: m.role || "user",
    content: String(m.content || ""),
  }));
}

function buildInferencePayload({ modelId, messages, body, taskType }) {
  const payload = {
    model: modelId,
    input: toResponsesInput(messages),
    text: { format: { type: "text" } },
  };

  const isGliner = String(modelId || "").toLowerCase().includes("gliner2");
  if (!isGliner) return payload;

  const providedUsecase = typeof body?.usecase === "string" ? body.usecase : "";
  let usecase = providedUsecase;
  if (!usecase) {
    if (body?.schema) usecase = "json";
    else if (body?.labels) usecase = "ner";
    else if (taskType === "classification") usecase = "classification";
    else usecase = "json";
  }

  payload.usecase = usecase;
  if (body?.schema) payload.schema = body.schema;
  if (body?.labels) payload.labels = body.labels;
  if (typeof body?.threshold === "number") payload.threshold = body.threshold;

  // Fallback for extraction requests with no gliner-specific hints.
  if (!payload.schema && !payload.labels && taskType === "extraction") {
    payload.usecase = "ner";
    payload.labels = ["person", "organization", "email", "phone", "address", "date", "amount"];
    payload.threshold = 0.3;
  }

  return payload;
}

function ensureClassificationSystemMessage(messages, taskType, selectedModelId) {
  const normalized = Array.isArray(messages) ? [...messages] : [];
  if (taskType !== "classification") return normalized;
  if (String(selectedModelId || "").toLowerCase().includes("iab")) return normalized;

  const hasCategorySystemPrompt = normalized.some((m) => {
    if (m?.role !== "system") return false;
    const text = String(m?.content || "").toLowerCase();
    return text.includes("categor") || text.includes("label") || text.includes("class");
  });
  if (hasCategorySystemPrompt) return normalized;

  const categories = DEFAULT_CLASSIFICATION_CATEGORIES.map((c) => c.trim()).filter(Boolean);
  const categoriesJson = JSON.stringify(categories);
  normalized.unshift({
    role: "system",
    content: [
      "You are a strict single-label classifier.",
      `Allowed categories (JSON array): ${categoriesJson}`,
      'Return JSON only in this exact shape: {"category":"<one allowed label>","confidence":0.0}',
      "Do not return scores for multiple labels.",
      "Do not include explanations.",
    ].join("\n"),
  });
  return normalized;
}

function parseJsonObject(text) {
  if (typeof text !== "string") return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeClassificationOutput(content, taskType) {
  if (taskType !== "classification") return content;
  const parsed = parseJsonObject(content);
  if (!parsed) return content;
  if (typeof parsed.category === "string") return content;

  const categories = new Set(DEFAULT_CLASSIFICATION_CATEGORIES.map((c) => c.trim()).filter(Boolean));
  const scored = Object.entries(parsed)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .filter(([k]) => {
      const key = String(k || "").trim();
      if (!key) return false;
      const keyLower = key.toLowerCase();
      if (
        keyLower.includes("classify") ||
        keyLower.includes("return") ||
        keyLower.includes("allowed categories") ||
        keyLower.includes("strict json")
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b[1] - a[1]);
  if (scored.length === 0) return content;

  const [bestCategory, bestScore] = scored[0];
  return JSON.stringify(
    {
      category: bestCategory,
      confidence: Number(bestScore.toFixed(6)),
      source: categories.has(bestCategory) ? "normalized_probability_map" : "normalized_top_score",
    },
    null,
    2
  );
}

async function postInference({ apiKey, projectId, modelId, messages, body, taskType }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INFERENCE_TIMEOUT_MS);
  try {
    const response = await fetch(INFERENCE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "x-project-id": projectId,
      },
      body: JSON.stringify(buildInferencePayload({ modelId, messages, body, taskType })),
      signal: controller.signal,
    });

    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }

    if (!response.ok) {
      const detail = json?.error?.message || json?.message || `status ${response.status}`;
      throw new Error(`Inference API error: ${detail}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function callInferenceWithRetry(payload) {
  let lastError = null;
  for (let attempt = 0; attempt <= INFERENCE_MAX_RETRIES; attempt += 1) {
    try {
      return await postInference(payload);
    } catch (error) {
      lastError = error;
      if (attempt === INFERENCE_MAX_RETRIES) break;
    }
  }
  throw lastError || new Error("Inference API call failed");
}

function getContentFromInferenceResponse(json) {
  if (Array.isArray(json?.output)) {
    for (const item of json.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const chunk of item.content) {
        if (typeof chunk?.text === "string" && chunk.text.trim()) return chunk.text;
      }
    }
  }
  if (json?.choices?.[0]?.message?.content) return String(json.choices[0].message.content);
  if (typeof json?.output_text === "string") return json.output_text;
  if (typeof json?.text === "string") return json.text;
  return "";
}

async function appendTrackingEvent(event) {
  await fs.appendFile(TRACKING_PATH, `${JSON.stringify(event)}\n`, "utf8");
}

async function readTrackingEvents(limit = 100) {
  try {
    const raw = await fs.readFile(TRACKING_PATH, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function toOpenAiLikeResponse({ modelId, content, promptTokens, completionTokens, zerogpuMeta }) {
  const response = {
    id: `zgpu_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
  if (zerogpuMeta) response.zerogpu = zerogpuMeta;
  return response;
}

function shouldAppendSavingsToContent(body, content) {
  const override = body?.metadata?.showSavings;
  const show = typeof override === "boolean" ? override : DEFAULT_SHOW_SAVINGS;
  if (!show) return false;
  const trimmed = String(content || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  return true;
}

function buildSavingsPostamble({ event, suggestionModel }) {
  const savingsLine =
    `Savings this call: $${event.savingsUsd.toFixed(6)} ` +
    `(ZeroGPU $${event.zerogpuCostUsd.toFixed(6)} vs est. LLM $${event.estimatedLlmCostUsd.toFixed(6)}).`;
  if (!suggestionModel) return savingsLine;
  return `${savingsLine}\nTry also with model: ${suggestionModel}.`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, service: "zerogpu-plugin" });
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      const catalog = await loadCatalog();
      return sendJson(res, 200, { ...catalog, source: catalogSource });
    }

    if (req.method === "POST" && url.pathname === "/v1/zerogpu/chat/completions") {
      const body = await parseJsonBody(req);
      const messages = body.messages || [];
      const taskType = detectTaskType(messages, body?.metadata?.taskTypeHint);
      const catalog = await loadCatalog();
      const rankedModels = selectModels(catalog, taskType, messages, body?.model);
      const selectedModel = rankedModels[0];
      const suggestionModel = rankedModels[1]?.id || null;
      if (!selectedModel) {
        return sendJson(res, 400, { error: `No model available for task type: ${taskType}` });
      }

      const preparedMessages = ensureClassificationSystemMessage(messages, taskType, selectedModel?.id);
      const startedAt = Date.now();
      const promptTokens = estimateTokens(preparedMessages);
      let completionText = "";
      let completionTokens = 0;
      const { apiKey, projectId } = getRequestCredentials(req);
      const shouldUseLiveInference = Boolean(INFERENCE_API_URL && apiKey && projectId);

      if (shouldUseLiveInference) {
        const inferenceJson = await callInferenceWithRetry({
          apiKey,
          projectId,
          modelId: selectedModel.id,
          messages: preparedMessages,
          body,
          taskType,
        });
        completionText = getContentFromInferenceResponse(inferenceJson);
      }

      if (!completionText) {
        completionText = buildMockOutput(taskType, preparedMessages);
      }
      completionText = normalizeClassificationOutput(completionText, taskType);
      completionTokens = estimateTokens([{ content: completionText }]);
      const totalTokens = promptTokens + completionTokens;
      const zerogpuCost = computeZeroGpuCostUsd(selectedModel, promptTokens, completionTokens);
      const estimatedLlmCost = (totalTokens / 1000) * ESTIMATED_LLM_COST_PER_1K;
      const savings = Math.max(0, estimatedLlmCost - zerogpuCost);
      const latencyMs = Date.now() - startedAt;

      const event = {
        timestamp: new Date().toISOString(),
        taskType,
        model: selectedModel.id,
        latencyMs,
        totalTokens,
        inferenceMode: shouldUseLiveInference ? "live" : "mock",
        zerogpuCostUsd: Number(zerogpuCost.toFixed(8)),
        estimatedLlmCostUsd: Number(estimatedLlmCost.toFixed(8)),
        savingsUsd: Number(savings.toFixed(8)),
      };

      if (shouldAppendSavingsToContent(body, completionText)) {
        completionText = `${completionText}\n\n${buildSavingsPostamble({ event, suggestionModel })}`;
      }

      appendTrackingEvent(event).catch(() => {});

      return sendJson(
        res,
        200,
        toOpenAiLikeResponse({
          modelId: selectedModel.id,
          content: completionText,
          promptTokens,
          completionTokens,
          zerogpuMeta: {
            taskType,
            selectedModel: selectedModel.id,
            suggestionModel,
            inferenceMode: event.inferenceMode,
            zerogpuCostUsd: event.zerogpuCostUsd,
            estimatedLlmCostUsd: event.estimatedLlmCostUsd,
            savingsUsd: event.savingsUsd,
          },
        })
      );
    }

    if (req.method === "GET" && url.pathname === "/dashboard/events") {
      const limit = Number(url.searchParams.get("limit") || 50);
      const events = await readTrackingEvents(limit);
      return sendJson(res, 200, { count: events.length, events });
    }

    if (req.method === "GET" && url.pathname === "/dashboard/summary") {
      const events = await readTrackingEvents(10_000);
      const totals = events.reduce(
        (acc, e) => {
          acc.requests += 1;
          acc.totalSavingsUsd += e.savingsUsd || 0;
          acc.totalZeroGpuCostUsd += e.zerogpuCostUsd || 0;
          acc.totalEstimatedLlmCostUsd += e.estimatedLlmCostUsd || 0;
          acc.avgLatencyMs += e.latencyMs || 0;
          acc.byTaskType[e.taskType] = (acc.byTaskType[e.taskType] || 0) + 1;
          return acc;
        },
        {
          requests: 0,
          totalSavingsUsd: 0,
          totalZeroGpuCostUsd: 0,
          totalEstimatedLlmCostUsd: 0,
          avgLatencyMs: 0,
          byTaskType: {},
        }
      );

      if (totals.requests > 0) {
        totals.avgLatencyMs = Number((totals.avgLatencyMs / totals.requests).toFixed(2));
      }

      totals.totalSavingsUsd = Number(totals.totalSavingsUsd.toFixed(8));
      totals.totalZeroGpuCostUsd = Number(totals.totalZeroGpuCostUsd.toFixed(8));
      totals.totalEstimatedLlmCostUsd = Number(totals.totalEstimatedLlmCostUsd.toFixed(8));

      return sendJson(res, 200, totals);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: "Internal server error", detail: String(error.message || error) });
  }
});

server.listen(PORT, () => {
  console.log(`zerogpu plugin listening on http://localhost:${PORT}`);
});
