"use strict";

const MOD_ICON = { text: "Aa", image: "◧", audio: "♪", video: "▶", file: "⎘" };

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtCtx(n) {
  if (!n && n !== 0) return null;
  if (n >= 1e6) return (Math.round((n / 1e6) * 10) / 10).toString().replace(/\.0$/, "") + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

const CATS = [
  { key: "all", label: "All", test: () => true },
  { key: "text", label: "Text", test: (m) => m.input_modalities.includes("text") },
  { key: "image", label: "Vision", test: (m) => m.input_modalities.includes("image") },
  { key: "audio", label: "Audio", test: (m) => m.input_modalities.includes("audio") || m.output_modalities.includes("audio") },
  { key: "video", label: "Video", test: (m) => m.input_modalities.includes("video") },
  { key: "router", label: "Router", test: (m) => m.is_router },
];

const state = { models: [], filter: "all", q: "", sort: "name" };

function modalityText(m) {
  const io = [...m.input_modalities, ...m.output_modalities.filter((o) => !m.input_modalities.includes(o))];
  if (io.length === 0) return m.modality || "—";
  return io.map((x) => (MOD_ICON[x] ? MOD_ICON[x] + " " + x : x)).join("  ·  ");
}

function apply() {
  const cat = CATS.find((c) => c.key === state.filter) || CATS[0];
  const q = state.q.trim().toLowerCase();
  let list = state.models.filter(cat.test);
  if (q) {
    list = list.filter((m) =>
      (m.name + " " + m.id + " " + m.provider + " " + m.description).toLowerCase().includes(q)
    );
  }
  const by = {
    name: (a, b) => a.name.localeCompare(b.name),
    provider: (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
    context: (a, b) => (b.context_length || 0) - (a.context_length || 0),
    newest: (a, b) => (b.created || 0) - (a.created || 0),
  };
  list = [...list].sort(by[state.sort] || by.name);
  render(list);
}

function render(list) {
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  document.getElementById("count").textContent =
    list.length + (list.length === 1 ? " model" : " models") +
    (state.filter !== "all" || state.q ? " matched" : " available free");

  if (list.length === 0) {
    grid.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  // All interpolated values below pass through esc(); the only raw HTML is our own
  // literal markup, so innerHTML here carries no untrusted-HTML risk.
  grid.innerHTML = list
    .map((m, i) => {
      const tags = [];
      if (m.context_length) tags.push(`<span class="tag">Context <b>${fmtCtx(m.context_length)}</b></span>`);
      if (m.max_completion_tokens) tags.push(`<span class="tag">Max out <b>${fmtCtx(m.max_completion_tokens)}</b></span>`);
      tags.push(`<span class="tag">${esc(modalityText(m))}</span>`);
      if (m.knowledge_cutoff) tags.push(`<span class="tag">Cutoff <b>${esc(m.knowledge_cutoff)}</b></span>`);
      if (m.supported_parameters) tags.push(`<span class="tag"><b>${m.supported_parameters}</b> params</span>`);
      if (m.expiration_date) tags.push(`<span class="tag warn">Expires ${esc(fmtDate(m.expiration_date))}</span>`);

      return `
<article class="card${m.is_router ? " router" : ""}" style="animation-delay:${Math.min(i * 45, 500)}ms">
  <div class="card__top">
    <span class="provider">${esc(m.provider)}</span>
    <span class="free">free</span>
  </div>
  <h2 class="${m.is_router ? "router-name" : ""}">${esc(m.model || m.name)}</h2>
  <div class="id">${esc(m.id)}</div>
  <p class="desc">${esc(m.description)}</p>
  <div class="meta">${tags.join("")}</div>
  <a class="use" href="${esc(m.url)}" target="_blank" rel="noopener">
    Use on OpenRouter
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
  </a>
</article>`;
    })
    .join("");
}

function renderStats(data) {
  const biggest = data.models.reduce((a, m) => Math.max(a, m.context_length || 0), 0);
  const items = [
    { v: data.count, ember: true, l: "free models" },
    { v: data.total_models, l: "in catalog" },
    { v: fmtCtx(biggest), l: "largest context" },
    { v: fmtDate(data.generated_at), l: "data updated" },
  ];
  document.getElementById("stats").innerHTML = items
    .map((s) => `<div class="stat"><b class="${s.ember ? "ember" : ""}">${esc(s.v)}</b><span>${esc(s.l)}</span></div>`)
    .join("");
}

function renderChips() {
  const present = CATS.filter((c) => c.key === "all" || state.models.some(c.test));
  document.getElementById("chips").innerHTML = present
    .map((c) => `<button class="chip" data-cat="${c.key}" aria-pressed="${c.key === state.filter}">${c.label}</button>`)
    .join("");
  document.querySelectorAll(".chip").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.cat;
      document.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === state.filter)));
      apply();
    })
  );
}

async function init() {
  try {
    const res = await fetch("data/models.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    state.models = data.models || [];
    renderStats(data);
    renderChips();
    document.getElementById("q").addEventListener("input", (e) => {
      state.q = e.target.value;
      apply();
    });
    document.getElementById("sort").addEventListener("change", (e) => {
      state.sort = e.target.value;
      apply();
    });
    apply();
  } catch (err) {
    document.getElementById("count").textContent = "";
    document.getElementById("grid").innerHTML =
      `<p class="empty">Could not load the model data (<code>data/models.json</code>). ` +
      `If you opened this file directly, serve it over HTTP instead.</p>`;
  }
}

init();
