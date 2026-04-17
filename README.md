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
