/* ZeroGPU OpenCLAW Provider Plugin */
"use strict";

const DEFAULT_BASE_URL = "https://zerogpu-openclaw-plugin.onrender.com/v1";
const ENV = {
  API_KEY: "ZEROGPU_API_KEY",
  PROJECT_ID: "ZEROGPU_PROJECT_ID",
};

const MODELS = [
  { id: "zerogpu/auto", name: "ZeroGPU Auto" },
  { id: "zerogpu/chat", name: "ZeroGPU Chat" },
  { id: "zerogpu/chat-thinking", name: "ZeroGPU Chat Thinking" },
  { id: "zerogpu/summarize", name: "ZeroGPU Summarize" },
  { id: "zerogpu/classify", name: "ZeroGPU Classify" },
  { id: "zerogpu/extract", name: "ZeroGPU Extract" },
  { id: "zerogpu/followups", name: "ZeroGPU Follow-up Questions" },
];

function normalizeConfig(raw) {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw.config || raw : {};
  const baseUrl = typeof obj.baseUrl === "string" && obj.baseUrl.trim() ? obj.baseUrl.trim() : DEFAULT_BASE_URL;
  return { baseUrl: baseUrl.replace(/\/+$/, "") };
}

function encodeCredentials(apiKey, projectId) {
  const payload = { apiKey, projectId };
  return `zgpu-user-${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

function providerConfig(baseUrl, apiKey) {
  return {
    baseUrl,
    api: "openai-completions",
    apiKey,
    models: MODELS,
  };
}

function validateApiKey(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "ZeroGPU API key is required";
  if (!trimmed.startsWith("zgpu-")) return "ZeroGPU API key should start with 'zgpu-'";
  return undefined;
}

function validateProjectId(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "ZeroGPU project ID is required";
  return undefined;
}

async function runProviderSetup(ctx, baseUrl) {
  const envApiKey = process.env[ENV.API_KEY] || "";
  const envProjectId = process.env[ENV.PROJECT_ID] || "";

  await ctx.prompter.intro("ZeroGPU Router for OpenCLAW");
  await ctx.prompter.note(
    "ZeroGPU routes lightweight tasks like summarization, classification, extraction, and follow-up generation through a hosted OpenAI-compatible adapter.\n\nYour ZeroGPU API key and project ID are stored in your OpenCLAW provider config and sent to the adapter per request.",
    "About ZeroGPU",
  );

  const apiKey = envApiKey
    ? envApiKey.trim()
    : (
        await ctx.prompter.text({
          message: "Enter your ZeroGPU API key",
          placeholder: "zgpu-...",
          validate: validateApiKey,
        })
      ).trim();

  const projectId = envProjectId
    ? envProjectId.trim()
    : (
        await ctx.prompter.text({
          message: "Enter your ZeroGPU project ID",
          placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
          validate: validateProjectId,
        })
      ).trim();

  const credentialToken = encodeCredentials(apiKey, projectId);

  await ctx.prompter.outro(
    "ZeroGPU configured. Use model zerogpu/auto, then run `openclaw gateway restart` to activate if OpenCLAW does not restart automatically.",
  );

  return {
    profiles: [
      {
        profileId: "zerogpu:default",
        credential: {
          type: "api_key",
          provider: "zerogpu",
          key: credentialToken,
        },
      },
    ],
    configPatch: {
      models: {
        providers: {
          zerogpu: providerConfig(baseUrl, credentialToken),
        },
      },
    },
    defaultModel: "zerogpu/auto",
  };
}

function registerProvider(api, config, logger) {
  if (typeof api.registerProvider !== "function") {
    logger.debug("[zerogpu] registerProvider not available in this OpenCLAW version");
    return;
  }

  api.registerProvider({
    id: "zerogpu",
    label: "ZeroGPU",
    envVars: [ENV.API_KEY, ENV.PROJECT_ID],
    auth: [
      {
        id: "zero-gpu-credentials",
        label: "ZeroGPU API Key + Project ID",
        hint: "Get these from your ZeroGPU dashboard.",
        kind: "api_key",
        run: (ctx) => runProviderSetup(ctx, config.baseUrl),
      },
    ],
    models: {
      baseUrl: config.baseUrl,
      api: "openai-completions",
      models: MODELS,
    },
  });
  logger.info("[zerogpu] Registered provider (model: zerogpu/auto)");
}

function registerCommand(api, config, logger) {
  if (typeof api.registerCommand !== "function") return;

  api.registerCommand({
    name: "zerogpu",
    description: "Show ZeroGPU adapter status",
    async handler() {
      return `ZeroGPU Router\nAdapter: ${config.baseUrl}\nModel: zerogpu/auto`;
    },
    async execute() {
      try {
        const healthUrl = config.baseUrl.replace(/\/v1\/?$/, "/health");
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
        const status = response.ok ? "reachable" : `HTTP ${response.status}`;
        const text = `ZeroGPU Router\nAdapter: ${config.baseUrl}\nHealth: ${status}\nModel: zerogpu/auto`;
        return { text, content: [{ type: "text", text }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.debug(`[zerogpu] health check failed: ${message}`);
        const text = `ZeroGPU Router\nAdapter: ${config.baseUrl}\nHealth: failed (${message})`;
        return { text, content: [{ type: "text", text }] };
      }
    },
  });
}

module.exports = {
  id: "zerogpu-router",
  name: "ZeroGPU Router",
  register(api) {
    const logger = api.logger || {
      info: (...args) => console.log(...args),
      debug: () => {},
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args),
    };
    const config = normalizeConfig(api.pluginConfig);
    registerProvider(api, config, logger);
    registerCommand(api, config, logger);
  },
};
