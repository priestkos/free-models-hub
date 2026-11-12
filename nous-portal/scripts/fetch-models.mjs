// Builds data/models.json for the Nous Portal: every model priced $0 in / $0 out.
//
// Source: the Nous inference API (the model list the Portal serves).
// No dependencies — Node 18+ global fetch.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "data/models.json");
const API = "https://inference-api.nousresearch.com/v1/models";

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

// Refuse an empty or reshaped response, so a bad 200 never replaces the last good catalog.
function dataOf(body, what) {
  const list = body && body.data;
  if (!Array.isArray(list) || !list.length || !list.every((m) => m && typeof m.id === "string")) {
    throw new Error(`${what}: expected a non-empty data[] of models with string ids`);
  }
  return list;
}

export function build(body) {
  const all = dataOf(body, "Nous");

  const models = all
    .filter((m) => {
      const p = m.pricing || {};
      return num(p.prompt) === 0 && num(p.completion) === 0;
    })
    .map((m) => {
      const arch = m.architecture || {};
      const tp = m.top_provider || {};
      const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
      const parts = String(m.name || m.id).split(": ");
      return {
        id: m.id,
        name: m.name || m.id,
        provider: parts.length > 1 ? parts[0].trim() : (m.id.includes("/") ? m.id.split("/")[0] : "Nous"),
        model: parts.length > 1 ? parts.slice(1).join(": ") : m.name || m.id,
        description: (m.description || "").trim(),
        context_length: m.context_length ?? null,
        max_completion_tokens: tp.max_completion_tokens ?? null,
        modality: arch.modality || null,
        input_modalities: arch.input_modalities || [],
        output_modalities: arch.output_modalities || [],
        knowledge_cutoff: m.knowledge_cutoff ?? null,
        created: m.created ?? null,
        expiration_date: m.expiration_date ?? null,
        hugging_face_id: m.hugging_face_id || null,
        canonical_slug: m.canonical_slug || null,
        reasoning: !!((m.reasoning || {}).default_enabled || (m.reasoning || {}).mandatory),
        tool_call: params.includes("tools"),
        supported_parameters: params.length,
        url: "https://portal.nousresearch.com",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!models.length) throw new Error("Nous: no free models found, refusing to publish an empty catalog");

  const out = {
    generated_at: new Date().toISOString(),
    source: API,
    portal: "https://portal.nousresearch.com",
    total_models: all.length,
    count: models.length,
    models,
  };
  return out;
}

async function main() {
  const res = await fetch(API, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nous API responded ${res.status} ${res.statusText}`);
  const out = build(await res.json());

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${out.count} free models (of ${out.total_models}) -> ${OUT}`);
}

// Run only as a script, so the tests can import build() without fetching.
if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
