# AI Playground

> A full-stack framework for testing and validating LLM capabilities — reasoning visibility, tool calling, multimodal input, and streaming UI — built on Cloudflare Workers.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Assistant-UI (AG-UI primitives)
- **Backend**: Cloudflare Workers, Hono, Vercel AI SDK
- **Provider**: OpenRouter (provider-agnostic — any OpenAI-compatible endpoint)
- **Tooling**: PNPM, Biome, Vite 8

## Features

- **Reasoning Visibility**: Chain-of-thought streaming via `<think>` tag injection + `extractReasoningMiddleware`
- **Multimodal Input**: Image, PDF, audio, and video pass-through to OpenRouter native formats
- **Tool Calling**: Full AG-UI tool-call cards with args/result display
- **Streaming UI**: AG-UI primitives — branch picker, action bar (copy/reload/edit), scroll-to-bottom
- **Environment-Driven**: All config (`MODEL`, `API_KEY`, `BASE_URL`, `SYSTEM_PROMPT`) via env vars

## Local Development

```bash
pnpm install
pnpm dev
```

Strict checks (lint + typecheck):

```bash
pnpm check
```

## Configuration

Copy `.dev.vars.example` to `.dev.vars` and fill in your credentials:

```bash
cp .dev.vars.example .dev.vars
```

For production, set secrets via `wrangler secret put API_KEY`.
