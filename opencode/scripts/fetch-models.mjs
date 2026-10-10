// Builds data/models.json: the free models available through OpenCode.
//
// Each provider has its OWN live gateway — OpenCode Zen and OpenCode Go are
// different endpoints — so availability is read per provider. Metadata and $0
// pricing come from the models.dev catalog that OpenCode itself uses. A model
// counts as free when its input and output cost are both 0, or (for models the
// catalog has not caught up on) when its id carries the `-free` suffix.
//
// No dependencies — Node 18+ global fetch.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "data/models.json");

const DEV_URL = "https://models.dev/api.json";

const PROVIDERS = [
  { key: "opencode", label: "OpenCode Zen", gateway: "https://opencode.ai/zen/v1/models" },
  { key: "opencode-go", label: "OpenCode Go", gateway: "https://opencode.ai/zen/go/v1/models" },
];

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const isZeroCost = (m) => {
  const c = m.cost || {};
  return num(c.input) === 0 && num(c.output) === 0;
};

// Free-by-name fallback for models not yet in the models.dev catalog. Safe to
// apply here because every gateway listed above is OpenCode's own, and a model
// the catalog has not caught up on is still genuinely served at $0 when it
// carries the `-free` suffix.
const looksFree = (id) => /-free$/.test(id) || id === "big-pickle";

// Hand-supplied metadata for free models the catalog has not caught up on yet
// (sourced from the OpenCode Zen docs).
const OVERRIDES = {
  "jev-1.13-free": {
    name: "Jev 1.13 Free",
    description:
      "Returns structured decisions rather than free-form text, so it is not a replacement for a text-generating coding model.",
  },
};

const titleCase = (id) =>
  id
    .split("-")
    .map((w) => (/^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

function shape(providerKey, m) {
  const limit = m.limit || {};
  const mod = m.modalities || {};
  return {
    id: m.id,
    config_id: `${providerKey}/${m.id}`,
    name: m.name || titleCase(m.id),
    description: (m.description || "").trim(),
    context: limit.context ?? null,
    max_output: limit.output ?? null,
    input_modalities: mod.input || [],
    output_modalities: mod.output || [],
    reasoning: !!m.reasoning,
    tool_call: !!m.tool_call,
    attachment: !!m.attachment,
    open_weights: !!m.open_weights,
    release_date: m.release_date || null,
    last_updated: m.last_updated || null,
    canonical_model_id: m.canonical_model_id || null,
  };
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  return res.json();
}

async function main() {
  const [dev, ...gateways] = await Promise.all([
    getJSON(DEV_URL),
    ...PROVIDERS.map((p) => getJSON(p.gateway)),
  ]);

  const providers = PROVIDERS.map(({ key, label, gateway }, i) => {
    const liveIds = new Set((gateways[i].data || []).map((m) => m.id));
    const meta = dev[key] || {};
    const catalog = meta.models || {};
    const models = [];

    for (const id of liveIds) {
      const m = catalog[id];
      const free = m ? isZeroCost(m) : looksFree(id);
      if (!free) continue;
      models.push(shape(key, { ...(m || { id }), ...(OVERRIDES[id] || {}) }));
    }
    // Any catalog entry the gateway did not report is treated as retired.
    models.sort((a, b) => a.name.localeCompare(b.name));

    return {
      key,
      label,
      gateway,
      doc: meta.doc || "https://opencode.ai/docs/zen",
      catalog_size: Object.keys(catalog).length,
      live_count: liveIds.size,
      count: models.length,
      models,
    };
  });

  const out = {
    generated_at: new Date().toISOString(),
    sources: { availability: PROVIDERS.map((p) => p.gateway), metadata: DEV_URL },
    total_free: providers.reduce((n, p) => n + p.count, 0),
    providers,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `Wrote ${out.total_free} free models across ${providers.length} providers ` +
      `(${providers.map((p) => `${p.label}=${p.count}/${p.live_count}`).join(", ")})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
