// Builds data/models.json for Command Code: the free models on its Provider API.
//
// Source: the public Command Code models endpoint. It reports no prices, so the
// free models are the ones the catalog marks with a `free` id suffix — which is
// exactly the set commandcode.ai/models badges as "Free".
//
// No dependencies — Node 18+ global fetch.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "data/models.json");
const API = "https://api.commandcode.ai/provider/v1/models";
const DEALS = "https://commandcode.ai/docs/resources/pricing-limits";

// Deal notes for the free models, taken from the Command Code catalog page.
// Keyed by model id; an unlisted free model still shows, with a generic note.
const NOTES = {
  "stealth/glyph-cluster:free": { note: "Stealth preview — free while the preview lasts.", anchor: "glyph-cluster-free" },
  "inclusionai/ling-3.1-flash:free": { note: "Free while it lasts.", anchor: "ling-3.1-flash-free" },
  "inclusionai/ling-3.0-flash-sante:free": { note: "Free while it lasts.", anchor: "ling-3.0-flash-sante-free" },
  "poolside/laguna-s-2.1-free": { note: "Free while capacity lasts.", anchor: "laguna-s-2.1-free" },
};

const isFree = (id) => /(^|[-/:])free$/i.test(id);

// Refuse an empty or reshaped response, so a bad 200 never replaces the last good catalog.
function dataOf(body, what) {
  const list = body && body.data;
  if (!Array.isArray(list) || !list.length || !list.every((m) => m && typeof m.id === "string")) {
    throw new Error(`${what}: expected a non-empty data[] of models with string ids`);
  }
  return list;
}

const ENDPOINT_LABEL = {
  "/chat/completions": "Chat Completions",
  "/responses": "Responses",
  "/messages": "Messages",
  "/models": "Models",
};

export function build(body) {
  const all = dataOf(body, "Command Code");  // zero free models is allowed: the list is a small, changing preview

  const models = all
    .filter((m) => isFree(m.id))
    .map((m) => {
      const meta = NOTES[m.id] || {};
      const endpoints = Array.isArray(m.supported_endpoints) ? m.supported_endpoints : [];
      return {
        id: m.id,
        name: m.name || m.id,
        provider: "Command Code",
        note: meta.note || "Free while it lasts.",
        deal_url: meta.anchor ? `${DEALS}#${meta.anchor}` : "https://commandcode.ai/models",
        context_length: m.context_length ?? null,
        created: m.created ?? null,
        endpoints,
        endpoint_labels: endpoints.map((e) => ENDPOINT_LABEL[e] || e),
        url: "https://commandcode.ai/models",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const out = {
    generated_at: new Date().toISOString(),
    source: API,
    catalog: "https://commandcode.ai/models",
    total_models: all.length,
    count: models.length,
    models,
  };
  return out;
}

async function main() {
  const res = await fetch(API, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Command Code API responded ${res.status} ${res.statusText}`);
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
