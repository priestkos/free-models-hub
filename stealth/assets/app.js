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
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

const state = { models: [], providers: [], filter: "all", q: "", sort: "name" };

function priceText(m) {
  if (!m.price) return "price not reported";
  const { prompt, completion } = m.price;
  if (prompt === 0 && completion === 0) return "$0 in / $0 out";
  return `$${prompt ?? "?"} in / $${completion ?? "?"} out`;
}

function apply() {
  const q = state.q.trim().toLowerCase();
  let list = state.models.filter((m) => state.filter === "all" || m.provider_key === state.filter);
  if (q) {
    list = list.filter((m) => (m.name + " " + m.id + " " + m.provider + " " + m.description).toLowerCase().includes(q));
  }
  const by = {
    name: (a, b) => a.name.localeCompare(b.name),
    provider: (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
    context: (a, b) => (b.context_length || 0) - (a.context_length || 0),
  };
  list = [...list].sort(by[state.sort] || by.name);
  render(list);
}

function render(list) {
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  const total = state.models.length;
  document.getElementById("count").textContent =
    list.length + (list.length === 1 ? " model" : " models") +
    (state.filter !== "all" || state.q ? " matched" : " being served right now");

  if (list.length === 0) {
    grid.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  // Every interpolated value passes through esc(); the markup itself is our own literal HTML.
  grid.innerHTML = list
    .map((m, i) => {
      const tags = [];
      if (m.context_length) tags.push(`<span class="tag">Context <b>${fmtCtx(m.context_length)}</b></span>`);
      tags.push(`<span class="tag">${esc(priceText(m))}</span>`);
      if (m.reasoning) tags.push(`<span class="tag"><b>reasoning</b></span>`);
      if (m.tool_call) tags.push(`<span class="tag"><b>tools</b></span>`);
      (m.endpoints || []).forEach((e) => tags.push(`<span class="tag">${esc(e)}</span>`));

      return `
<article class="card" style="animation-delay:${Math.min(i * 45, 500)}ms">
  <div class="card__top">
    <span class="provider">${esc(m.provider)}</span>
    <span class="free">live</span>
  </div>
  <h2>${esc(m.name)}</h2>
  <div class="id">${esc(m.id)}</div>
  <p class="desc">${esc(m.description || "No description published by this provider.")}</p>
  <div class="meta">${tags.join("")}</div>
  <a class="use" href="${esc(m.url)}" target="_blank" rel="noopener">
    Open on ${esc(m.provider)}
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
  </a>
</article>`;
    })
    .join("");
}

function renderStats(data) {
  const items = [
    { v: data.count, ember: true, l: "stealth models" },
    { v: `${data.providers.filter((p) => p.count > 0).length} / ${data.providers.length}`, l: "providers serving" },
    { v: fmtDate(data.generated_at), l: "data updated" },
  ];
  document.getElementById("stats").innerHTML = items
    .map((s) => `<div class="stat"><b class="${s.ember ? "ember" : ""}">${esc(s.v)}</b><span>${esc(s.l)}</span></div>`)
    .join("");
}

function renderChips() {
  // Only offer providers that actually have a Stealth model right now.
  const present = state.providers.filter((p) => p.count > 0);
  const chips = [{ key: "all", label: "All" }, ...present.map((p) => ({ key: p.key, label: p.label }))];
  document.getElementById("chips").innerHTML = chips
    .map((c) => `<button class="chip" data-cat="${esc(c.key)}" aria-pressed="${c.key === state.filter}">${esc(c.label)}</button>`)
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
    state.providers = data.providers || [];
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
