"use strict";

// Enriches the (already navigable) landing cards with live counts and a short
// model preview, read straight from each catalog's own data/models.json —
// same-origin, so no CORS involved. Links work with or without this script.

const SITES = [
  { path: "openrouter", label: "OpenRouter" },
  { path: "opencode", label: "OpenCode" },
  { path: "nous-portal", label: "Nous Portal" },
  { path: "commandcode", label: "Command Code" },
];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const countOf = (d) =>
  Array.isArray(d.providers) ? d.providers.reduce((n, p) => n + (p.count || 0), 0) : d.count ?? d.total_free ?? (d.models || []).length;

const modelsOf = (d) => (Array.isArray(d.providers) ? d.providers.flatMap((p) => p.models || []) : d.models || []);

const clean = (name) => String(name || "").replace(/^[^:]+:\s*/, "").trim();

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

async function loadSite(path) {
  const res = await fetch(`${path}/data/models.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function init() {
  const results = await Promise.allSettled(SITES.map((s) => loadSite(s.path)));

  let total = 0;
  let failed = 0;
  let newest = null;

  results.forEach((r, i) => {
    const { path, label } = SITES[i];
    const card = document.querySelector(`.site-card[data-site="${path}"]`);
    const countEl = card.querySelector("[data-count]");
    const previewEl = card.querySelector("[data-preview]");

    if (r.status !== "fulfilled") {
      failed++;
      countEl.textContent = "—";
      previewEl.innerHTML = `<span class="tag">count unavailable</span>`;
      return;
    }

    const d = r.value;
    const n = countOf(d);
    total += n;

    countEl.textContent = n;
    if (d.generated_at && (!newest || d.generated_at > newest)) newest = d.generated_at;

    const names = modelsOf(d)
      .map((m) => clean(m.model || m.name))
      .filter(Boolean)
      .slice(0, 4);
    previewEl.innerHTML = names.map((nm) => `<span class="tag">${esc(nm)}</span>`).join("");
    card.setAttribute("aria-label", `${label}: ${n} free models`);
  });

  document.querySelector("[data-total]").textContent = total;
  document.querySelector("[data-updated]").textContent = newest ? fmtDate(newest) : "—";

  const line = document.getElementById("count");
  if (failed === 0) {
    line.textContent = `${total} free models across ${SITES.length} catalogs`;
  } else if (failed < SITES.length) {
    line.textContent = `${total} free models — ${failed} catalog${failed === 1 ? "" : "s"} unavailable right now`;
  } else {
    line.textContent = "Live counts unavailable — open a catalog below";
  }
}

init();
