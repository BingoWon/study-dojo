#!/usr/bin/env node
/**
 * scripts/test-api.mjs
 * Manual smoke-test for the AI provider connection.
 * Reads ALL credentials and config from .dev.vars — never hardcode secrets here.
 *
 * Usage:
 *   node scripts/test-api.mjs           # raw fetch baseline test
 *   node scripts/test-api.mjs --sdk     # @ai-sdk/openai streaming test (mirrors worker)
 */
import { readFileSync, existsSync } from "fs";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

// ── Load .dev.vars ────────────────────────────────────────────────────────────
function loadDevVars(path = ".dev.vars") {
  if (!existsSync(path)) {
    console.error(`ERROR: ${path} not found.\nCopy .dev.vars.example to .dev.vars and fill in your credentials.`);
    process.exit(1);
  }
  const vars = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 1 || line.startsWith("#")) continue;
    vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return vars;
}

const env = loadDevVars();
const { BASE_URL, API_KEY, MODEL, SITE_URL, SITE_NAME, SITE_CATEGORIES } = env;

for (const [k, v] of [["BASE_URL", BASE_URL], ["API_KEY", API_KEY], ["MODEL", MODEL]]) {
  if (!v) { console.error(`ERROR: ${k} is missing from .dev.vars`); process.exit(1); }
}

console.log("BASE_URL          :", BASE_URL);
console.log("MODEL             :", MODEL);
console.log("API_KEY           :", `${API_KEY.slice(0, 12)}...`);
console.log("SITE_URL          :", SITE_URL);
console.log("SITE_NAME         :", SITE_NAME);
console.log("SITE_CATEGORIES   :", SITE_CATEGORIES);
console.log("");

// Origin headers — exactly as the Worker sends them
const originHeaders = {
  "HTTP-Referer": SITE_URL,
  "X-OpenRouter-Title": SITE_NAME,
  "X-OpenRouter-Categories": SITE_CATEGORIES,
};

if (process.argv.includes("--sdk")) {
  // ── SDK streaming test (mirrors worker code exactly) ──────────────────────
  console.log("Mode: @ai-sdk/openai streaming\n");
  const provider = createOpenAI({
    baseURL: BASE_URL,
    apiKey: API_KEY,
    headers: originHeaders,
    fetch,
  });
  const result = streamText({
    model: provider.chat(MODEL),
    messages: [{ role: "user", content: "你好，来一句最经典的嘲讽。" }],
    system: "你是暴躁教授。",
  });
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n\n[SDK stream finished]");
} else {
  // ── Raw fetch baseline test (auth/network check) ──────────────────────────
  console.log("Mode: raw fetch baseline\n");
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...originHeaders,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: "ping" }],
      stream: false,
    }),
  });
  const data = await res.json();
  console.log("Status  :", res.status);
  console.log("Response:", JSON.stringify(data).slice(0, 400));
}
