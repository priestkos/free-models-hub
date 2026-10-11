// Builds data/models.json: every "Stealth" model the four providers are serving
// right now — OpenRouter, OpenCode (Zen + Go), Nous Portal and Command Code.
//
// A model counts as Stealth when its id starts with `stealth/` (or its display
// name starts with "Stealth"). Only live provider APIs are read, so a model that
// is listed on a docs page but not actually served is not included.
//
// Fail-fast on purpose: if any provider API errors, the script exits non-zero
// and the previous snapshot is kept, rather than publishing a partial list that
// silently drops a provider.
//
// No dependencies — Node 18+ global fetch.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "data/models.json");

const PROVIDERS = [
  {
    key: "openrouter",
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/models",
    url: (id) => `https://openrouter.ai/${id}`,
  },
  {
    key: "opencode",
    label: "OpenCode Zen",
    endpoint: "https://opencode.ai/zen/v1/models",
    url: () => "https://opencode.ai/docs/zen",
  },
  {
    key: "opencode-go",
    label: "OpenCode Go",
    endpoint: "https://opencode.ai/zen/go/v1/models",
    url: () => "https://opencode.ai/docs/zen",
  },
  {
    key: "nous-portal",
    label: "Nous Portal",
    endpoint: "https://inference-api.nousresearch.com/v1/models",
    url: () => "https://portal.nousresearch.com",
  },
  {
    key: "commandcode",
    label: "Command Code",
    endpoint: "https://api.commandcode.ai/provider/v1/models",
    url: () => "https://commandcode.ai/models",
  },
];

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const isStealth = (m) => /^stealth\//i.test(m.id || "") || /^stealth\b/i.test(m.name || "");

// Each API reports a different shape; normalise to one record.
function shape(p, m) {
  const pricing = m.pricing && typeof m.pricing === "object" ? m.pricing : null;
  const prompt = pricing ? num(pricing.prompt) : null;
  const completion = pricing ? num(pricing.completion) : null;
  const endpoints = Array.isArray(m.supported_endpoints) ? m.supported_endpoints : [];
  const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
  return {
    id: m.id,
    name: m.name || m.id,
    provider_key: p.key,
    provider: p.label,
    description: (m.description || "").trim(),
    context_length: m.context_length ?? m.context ?? null,
    // Price per token in USD as reported by the provider; null = not reported.
    price: prompt === null && completion === null ? null : { prompt, completion },
    endpoints,
    reasoning: !!(m.reasoning && (m.reasoning.default_enabled || m.reasoning.mandatory)) || !!m.reasoning,
    tool_call: params.includes("tools") || !!m.tool_call,
    url: p.url(m.id),
  };
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  return res.json();
}

async function main() {
  const bodies = await Promise.all(PROVIDERS.map((p) => getJSON(p.endpoint)));

  const models = [];
  const providers = PROVIDERS.map((p, i) => {
    const all = Array.isArray(bodies[i].data) ? bodies[i].data : [];
    const found = all.filter(isStealth).map((m) => shape(p, m));
    models.push(...found);
    return {
      key: p.key,
      label: p.label,
      endpoint: p.endpoint,
      live_count: all.length,
      count: found.length,
    };
  });

  models.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));

  const out = {
    generated_at: new Date().toISOString(),
    sources: PROVIDERS.map((p) => p.endpoint),
    count: models.length,
    providers,
    models,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `Wrote ${models.length} Stealth models -> ${OUT}\n` +
      providers.map((p) => `  ${p.label}: ${p.count} (of ${p.live_count} live)`).join("\n")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
