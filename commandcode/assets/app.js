"use strict";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtCtx(n) {
  if (!n && n !== 0) return null;
  if (n >= 1e6) return (Math.round((n / 1e6) * 10) / 10).toString().replace(/\.0$/, "") + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

function fmtDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

const CATS = [
  { key: "all", label: "All", test: () => true },
  { key: "chat", label: "Chat Completions", test: (m) => m.endpoints.includes("/chat/completions") },
  { key: "responses", label: "Responses", test: (m) => m.endpoints.includes("/responses") },
];

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  context: (a, b) => (b.context_length || 0) - (a.context_length || 0),
  newest: (a, b) => (b.created || 0) - (a.created || 0),
};

const state = { models: [], filter: "all", q: "", sort: "name" };

function cardHTML(m, i) {
  const tags = [];
  if (m.context_length) tags.push(`<span class="tag">Context <b>${fmtCtx(m.context_length)}</b></span>`);
  for (const label of m.endpoint_labels) tags.push(`<span class="tag">${esc(label)}</span>`);
  const created = fmtDate(m.created ? m.created * 1000 : null);
  if (created) tags.push(`<span class="tag">Added <b>${esc(created)}</b></span>`);

  return `
<article class="card" style="animation-delay:${Math.min(i * 60, 400)}ms">
  <div class="card__top">
    <span class="provider">${esc(m.provider)}</span>
    <span class="free">free</span>
  </div>
  <h2>${esc(m.name)}</h2>
  <div class="id">${esc(m.id)}</div>
  <p class="desc">${esc(m.note)}</p>
  <div class="meta">${tags.join("")}</div>
  <div class="card__actions">
    <button type="button" data-copy="${esc(m.id)}" aria-label="Copy model id ${esc(m.id)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
      Copy id
    </button>
    <a href="${esc(m.deal_url)}" target="_blank" rel="noopener">
      Deal
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
    </a>
  </div>
</article>`;
}

function apply() {
  const cat = CATS.find((c) => c.key === state.filter) || CATS[0];
  const q = state.q.trim().toLowerCase();
  const by = SORTS[state.sort] || SORTS.name;

  let list = state.models.filter(cat.test);
  if (q) list = list.filter((m) => (m.name + " " + m.id + " " + m.note).toLowerCase().includes(q));
  list = [...list].sort(by);

  const total = state.models.length;
  document.getElementById("count").textContent =
    list.length === total && state.filter === "all" && !q
      ? `${total} models available free`
      : `${list.length} of ${total} models matched`;

  // All interpolated values pass through esc(); only our own literal markup is raw.
  document.getElementById("grid").innerHTML = list.map(cardHTML).join("");
  document.getElementById("empty").hidden = list.length > 0;
  wireCopy();
}

function wireCopy() {
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch {}
        ta.remove();
      }
      const node = btn.lastChild;
      const original = node.textContent;
      btn.classList.add("copied");
      node.textContent = " Copied";
      setTimeout(() => {
        btn.classList.remove("copied");
        node.textContent = original;
      }, 1200);
    });
  });
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
