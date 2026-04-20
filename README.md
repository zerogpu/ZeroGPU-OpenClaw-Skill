# openclaw+zerogpu

## Overview

`zerogpu` is a unified capability layer that helps agents such as Claude and OpenClaw use small and nano language models for common AI tasks instead of expensive large language models (LLMs).

The goal is simple:

- not every AI task requires full LLM reasoning
- common tasks can run faster and cheaper with smaller models
- savings and performance should be measurable

The system combines:

1. **Skill (behavior layer)**
2. **Plugin / Tool (execution + intelligence layer)**
3. **Model Catalog (dynamic model capability source)**
4. **Tracking Dashboard (usage, performance, and savings)**

---

## Core Idea

`zerogpu` provides agents with a practical routing path for lightweight AI tasks:

- classification
- summarization
- extraction
- follow-up question generation

Instead of defaulting to expensive LLM calls, the agent can invoke `zerogpu` for these categories and receive results from cost-efficient models.

---

## How It Works

The `zerogpu` skill guides the agent on **when** to use `zerogpu`.
The `zerogpu` plugin handles **how** requests are executed.

If a task fits common lightweight categories, the agent invokes the plugin. The plugin then selects an appropriate model dynamically, executes inference, and reports cost savings.

---

## 1) Skill (Guidance Layer)

The skill’s role is behavioral guidance only.

It:

- introduces `zerogpu` as a capability for common tasks
- explains that small/nano models are often the better fit for lightweight operations
- helps the agent identify when a request matches supported task categories
- encourages invocation of the `zerogpu` plugin when appropriate
- includes a basic OpenAI-compatible API definition for invocation context

It does **not**:

- execute requests
- select models
- track usage
- run dynamic logic

In short, the skill influences decision-making and surfaces `zerogpu` as the right tool when applicable.

---

## 2) Plugin (Execution + Intelligence Layer)

The plugin is responsible for execution, model intelligence, and value tracking.

When invoked, the plugin:

1. receives the request and user API key
2. analyzes the request type (classification, summarization, extraction, follow-up generation)
3. fetches the latest model catalog (cached + periodically refreshed)
4. selects the best model for the identified task
5. executes inference via the `zerogpu` API
6. returns the result to the agent
7. estimates equivalent LLM cost and calculates savings
8. sends tracking metadata asynchronously to the dashboard pipeline

Tracked metadata can include:

- task type
- selected model
- latency
- request cost (`zerogpu`)
- estimated LLM cost
- total savings

Because model selection is dynamic, the plugin adapts automatically as models are added or updated in the catalog.

---

## End-to-End Flow (Simple)

User query -> Agent -> Skill suggests `zerogpu` -> Agent calls plugin -> Plugin selects model (via catalog) -> `zerogpu` executes -> Response returned -> Savings tracked -> Dashboard updated

---

## Why This Matters

- **Cost efficiency:** use small/nano models when full LLM reasoning is unnecessary
- **Speed:** lightweight tasks can run with lower latency
- **Adaptability:** plugin model routing updates automatically with catalog changes
- **Proof of value:** dashboard quantifies savings and performance over time

This makes `zerogpu` a practical optimization layer for agent ecosystems rather than just another model endpoint.

---

## MVP Included in This Repo

- `SKILL.md`: guidance layer for when to route tasks to `zerogpu`
- `PLUGIN_SPEC.md`: execution contract and event schema
- `plugin/index.mjs`: runnable plugin server with dynamic model selection
- `plugin/model-catalog.json`: local fallback model catalog used if remote fetch fails

---

## Run Locally

## Recommended User Setup (OpenClaw)

For now, the simplest distribution model is local usage:

1. user clones this repo
2. user runs the plugin locally
3. user adds one HTTP tool in OpenClaw that points to localhost

This avoids shared hosting costs and keeps each user's credentials local.

### 1) Clone and start

```bash
git clone https://github.com/zerogpu/ZeroGPU-OpenClaw-Skill.git
cd ZeroGPU-OpenClaw-Skill
npm install
```

Set credentials in your shell (recommended, server-side only):

```bash
export ZEROGPU_API_KEY="YOUR_ZEROGPU_API_KEY"
export ZEROGPU_PROJECT_ID="YOUR_ZEROGPU_PROJECT_ID"
```

Then start the plugin:

```bash
npm start
```

Server starts on `http://localhost:8787`.

By default the plugin fetches models from:

- `https://api-dashboard.zerogpu.ai/api/models`

You can override this with `MODEL_CATALOG_URL`.

Live inference targets ZeroGPU Responses API by default:

- `https://api.zerogpu.ai/v1/responses`

To enable live inference (instead of mock fallback), send request headers:

- `x-api-key: <user_api_key>`
- `x-project-id: <project_id>`

You can override endpoint with `INFERENCE_API_URL`.

Optional runtime settings:

- `INFERENCE_TIMEOUT_MS` (default `10000`)
- `INFERENCE_MAX_RETRIES` (default `2`)
- `DEFAULT_CLASSIFICATION_CATEGORIES` (comma-separated allowed labels)
- `DEFAULT_SHOW_SAVINGS` (`true` by default; set `false` to disable auto savings line in text outputs)

Optional server-side credential defaults (for local dev only):

- `ZEROGPU_API_KEY`
- `ZEROGPU_PROJECT_ID`

When set, requests can omit `x-api-key` and `x-project-id` headers.

### Safe variable passing (OpenClaw or shell)

Never hardcode keys in config files. Export them in your shell session:

```bash
export ZEROGPU_API_KEY="YOUR_ZEROGPU_API_KEY"
export ZEROGPU_PROJECT_ID="YOUR_ZEROGPU_PROJECT_ID"
```

Then run:

```bash
npm start
```

And call the plugin without embedding secrets in request payloads or workspace docs.

### 2) Add OpenClaw tool

Create an HTTP tool in OpenClaw with:

- `name`: `zerogpu_chat`
- `method`: `POST`
- `url`: `http://localhost:8787/v1/zerogpu/chat/completions`
- `headers`:
  - `content-type: application/json`
- `body`:

```json
{
  "model": "auto",
  "messages": [
    { "role": "user", "content": "{{user_input}}" }
  ]
}
```

If `ZEROGPU_API_KEY` and `ZEROGPU_PROJECT_ID` are exported before `npm start`, you do not need to hardcode secrets in tool headers.

### Extraction and GLiNER notes

For `gliner2-base-v1`, the upstream API expects a `usecase` and often either `schema` or `labels`.

This plugin now auto-handles missing `usecase` for GLiNER models, but you can pass explicit fields for better control:

```json
{
  "model": "auto",
  "messages": [
    { "role": "user", "content": "Extract contact fields from this signature..." }
  ],
  "metadata": { "taskTypeHint": "extraction" },
  "usecase": "json",
  "schema": {
    "contact": [
      "name::str::Full name",
      "title::str::Job title",
      "company::str::Company name",
      "phone::str::Phone number",
      "email::str::Email address",
      "address::str::Office address"
    ]
  }
}
```

### 3) Verify quickly

```bash
curl http://localhost:8787/health
```

```bash
curl -X POST http://localhost:8787/v1/zerogpu/chat/completions \
  -H "content-type: application/json" \
  -d '{
    "model":"auto",
    "messages":[
      {"role":"user","content":"Summarize this feature request into 3 bullets."}
    ]
  }'
```

### Quick checks

```bash
curl http://localhost:8787/health
```

```bash
curl http://localhost:8787/v1/models
```

```bash
curl -X POST http://localhost:8787/v1/zerogpu/chat/completions \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_ZEROGPU_API_KEY" \
  -H "x-project-id: YOUR_ZEROGPU_PROJECT_ID" \
  -d '{
    "model":"auto",
    "messages":[
      {"role":"user","content":"Summarize this feature request into 3 bullets."}
    ],
    "metadata":{"taskTypeHint":"summarization"}
  }'
```

```bash
curl http://localhost:8787/dashboard/summary
```

## OpenClaw Copy-Paste Prompt (Easy Setup)

Copy this prompt directly into OpenClaw:

```text
Set up ZeroGPU-OpenClaw-Skill locally for me and configure it as a tool.

Steps to execute:

1) Clone and run
- git clone https://github.com/zerogpu/ZeroGPU-OpenClaw-Skill.git
- cd ZeroGPU-OpenClaw-Skill
- npm install
- export ZEROGPU_API_KEY="<PASTE_MY_API_KEY>"
- export ZEROGPU_PROJECT_ID="<PASTE_MY_PROJECT_ID>"
- npm start

2) Verify plugin
- curl http://localhost:8787/health
- curl http://localhost:8787/v1/models

3) Register OpenClaw HTTP tool
Create tool:
- name: zerogpu_chat
- method: POST
- url: http://localhost:8787/v1/zerogpu/chat/completions
- headers:
  - content-type: application/json
- body template:
{
  "model": "auto",
  "messages": [
    { "role": "user", "content": "{{user_input}}" }
  ]
}

Important:
- Do NOT write API keys into any file (TOOLS.md, AGENTS.md, repo files).
- Use only shell environment variables for secrets.
- If port 8787 is in use, kill existing process and restart plugin.

4) Live test
Run:
curl -X POST http://localhost:8787/v1/zerogpu/chat/completions \
  -H "content-type: application/json" \
  -d '{
    "model":"auto",
    "messages":[
      {"role":"user","content":"Classify this paragraph into a likely IAB category and return only category + confidence."}
    ]
  }'

5) Confirm it worked
- curl "http://localhost:8787/dashboard/events?limit=1"
- curl http://localhost:8787/dashboard/summary

Return to me:
- whether setup succeeded
- tool config that was registered
- health/models/test outputs
- last dashboard event
```
