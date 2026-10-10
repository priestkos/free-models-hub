// Fetches the OpenRouter model catalog and writes data/models.json
// with every zero-priced (free) model. No dependencies — Node 18+ global fetch.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "data/models.json");
const API = "https://openrouter.ai/api/v1/models";

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

async function main() {
  const res = await fetch(API, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenRouter API responded ${res.status} ${res.statusText}`);
  const body = await res.json();
  const all = Array.isArray(body.data) ? body.data : [];

  const models = all
    .filter((m) => {
      const p = m.pricing || {};
      return num(p.prompt) === 0 && num(p.completion) === 0;
    })
    .map((m) => {
      const arch = m.architecture || {};
      const tp = m.top_provider || {};
      const named = typeof m.name === "string" && m.name.includes(": ");
      const provider = named
        ? m.name.split(": ")[0].trim()
        : m.id.includes("/")
        ? m.id.split("/")[0]
        : "OpenRouter";
      const model = named ? m.name.split(": ").slice(1).join(": ") : m.name;

      return {
        id: m.id,
        name: m.name || m.id,
        provider,
        model,
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
        supported_parameters: Array.isArray(m.supported_parameters)
          ? m.supported_parameters.length
          : 0,
        is_router: m.id === "openrouter/free",
        url: `https://openrouter.ai/${m.id}`,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const out = {
    generated_at: new Date().toISOString(),
    source: API,
    total_models: all.length,
    count: models.length,
    models,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${models.length} free models (of ${all.length}) -> ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
