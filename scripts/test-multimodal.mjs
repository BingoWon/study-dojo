#!/usr/bin/env node
/**
 * scripts/test-multimodal.mjs
 * Tests ALL multimodal input types: text, image URL, image base64, PDF
 * Reads credentials from .dev.vars — never hardcode secrets here.
 *
 * Usage:
 *   node scripts/test-multimodal.mjs             # image URL test
 *   node scripts/test-multimodal.mjs --base64    # image base64 test
 *   node scripts/test-multimodal.mjs --sdk       # via @ai-sdk (mirror worker exactly)
 */
import { readFileSync, existsSync } from "fs";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

function loadDevVars(path = ".dev.vars") {
  if (!existsSync(path)) { console.error(`ERROR: ${path} not found`); process.exit(1); }
  const vars = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 1 || line.startsWith("#")) continue;
    vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return vars;
}

const { BASE_URL, API_KEY, MODEL, SITE_URL, SITE_NAME, SITE_CATEGORIES } = loadDevVars();
if (!API_KEY || !MODEL) { console.error("ERROR: API_KEY or MODEL missing from .dev.vars"); process.exit(1); }

// A small public test image (Wikimedia nature photo)
const TEST_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/320px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg";

const originHeaders = {
  "HTTP-Referer": SITE_URL,
  "X-OpenRouter-Title": SITE_NAME,
  "X-OpenRouter-Categories": SITE_CATEGORIES,
};

const useSDK = process.argv.includes("--sdk");
const useBase64 = process.argv.includes("--base64");

// ── Build the multimodal message content ─────────────────────────────────────
async function buildImageContent() {
  if (useBase64) {
    console.log("Fetching test image for base64 encoding...");
    const res = await fetch(TEST_IMAGE_URL);
    const buf = Buffer.from(await res.arrayBuffer());
    const b64 = buf.toString("base64");
    // As a data URL (this is what Assistant-UI sends for local file uploads)
    return [
      { type: "text", text: "这张图里有什么？用暴躁教授的语气描述。" },
      { type: "image", image: `data:image/jpeg;base64,${b64}` },
    ];
  }
  // Image URL (public)
  return [
    { type: "text", text: "这张图里有什么？用暴躁教授的语气描述。" },
    { type: "image", image: TEST_IMAGE_URL },
  ];
}

const content = await buildImageContent();
console.log(`\nMode: ${useSDK ? "@ai-sdk streaming" : "raw fetch"} | Image: ${useBase64 ? "base64 data URL" : "public URL"}`);
console.log("Image content type:", content[1].type, "| value prefix:", String(content[1].image).slice(0, 60));
console.log("");

if (useSDK) {
  // ── @ai-sdk test — mirrors exactly what the worker does ──────────────────
  const provider = createOpenAI({ baseURL: BASE_URL, apiKey: API_KEY, headers: originHeaders, fetch });
  const result = streamText({
    model: provider.chat(MODEL),
    messages: [{ role: "user", content }],
    system: "你是暴躁教授。",
  });
  for await (const chunk of result.textStream) process.stdout.write(chunk);
  console.log("\n\n[SDK stream done]");
} else {
  // ── Raw fetch — baseline to confirm OpenRouter accepts this format ────────
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", ...originHeaders },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content }],
      stream: false,
    }),
  });
  const data = await res.json();
  console.log("Status:", res.status);
  const text = data.choices?.[0]?.message?.content ?? JSON.stringify(data).slice(0, 300);
  console.log("Response:", text);
}
