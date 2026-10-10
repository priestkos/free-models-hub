"use strict";

const MOD_ICON = { text: "Aa", image: "◧", audio: "♪", video: "▶", pdf: "⎘" };

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
  { key: "text", label: "Text", test: (m) => m.input_modalities.includes("text") },
  { key: "image", label: "Vision", test: (m) => m.input_modalities.includes("image") },
  { key: "audio", label: "Audio", test: (m) => m.input_modalities.includes("audio") || m.output_modalities.includes("audio") },
  { key: "video", label: "Video", test: (m) => m.input_modalities.includes("video") },
  { key: "reasoning", label: "Reasoning", test: (m) => m.reasoning },
  { key: "tools", label: "Tools", test: (m) => m.tool_call },
];

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  context: (a, b) => (b.context || 0) - (a.context || 0),
  newest: (a, b) => String(b.release_date || "").localeCompare(String(a.release_date || "")),
};

const state = { providers: [], filter: "all", q: "", sort: "name" };

const allModels = () => state.providers.flatMap((p) => p.models);

function modalityText(m) {
  const io = [...m.input_modalities, ...m.output_modalities.filter((o) => !m.input_modalities.includes(o))];
  if (io.length === 0) return "text";
  return io.map((x) => (MOD_ICON[x] ? MOD_ICON[x] + " " + x : x)).join("  ·  ");
}

function cardHTML(m, providerLabel, i) {
  const tags = [];
  if (m.context) tags.push(`<span class="tag">Context <b>${fmtCtx(m.context)}</b></span>`);
  if (m.max_output) tags.push(`<span class="tag">Max out <b>${fmtCtx(m.max_output)}</b></span>`);
  tags.push(`<span class="tag">${esc(modalityText(m))}</span>`);
  if (m.reasoning) tags.push(`<span class="tag">Reasoning</span>`);
  if (m.tool_call) tags.push(`<span class="tag">Tools</span>`);
  if (m.open_weights) tags.push(`<span class="tag">Open weights</span>`);
  const rel = fmtDate(m.release_date);
  if (rel) tags.push(`<span class="tag">Released <b>${esc(rel)}</b></span>`);

  return `
<article class="card" style="animation-delay:${Math.min(i * 45, 500)}ms">
  <div class="card__top">
    <span class="provider">${esc(providerLabel)}</span>
    <span class="free">free</span>
  </div>
  <h2>${esc(m.name)}</h2>
  <div class="id">${esc(m.config_id)}</div>
  <p class="desc">${esc(m.description)}</p>
  <div class="meta">${tags.join("")}</div>
  <div class="card__actions">
    <button type="button" data-copy="${esc(m.config_id)}" aria-label="Copy model id ${esc(m.config_id)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
      Copy id
    </button>
  </div>
</article>`;
}

function sectionHTML(p, list) {
  return `
<section class="section" data-provider="${esc(p.key)}">
  <div class="section__head">
    <h2 class="section__title">${esc(p.label)}</h2>
    <div class="section__meta">${list.length} free of ${p.live_count} on the gateway · <a href="${esc(p.doc)}" target="_blank" rel="noopener">docs ↗</a></div>
  </div>
  <div class="grid">${list.map((m, i) => cardHTML(m, p.label, i)).join("")}</div>
</section>`;
}

function apply() {
  const cat = CATS.find((c) => c.key === state.filter) || CATS[0];
  const q = state.q.trim().toLowerCase();
  const by = SORTS[state.sort] || SORTS.name;

  const sections = [];
  let shown = 0;
  for (const p of state.providers) {
    let list = p.models.filter(cat.test);
    if (q) {
      list = list.filter((m) =>
        (m.name + " " + m.id + " " + m.config_id + " " + m.description).toLowerCase().includes(q)
      );
    }
    list = [...list].sort(by);
    if (list.length === 0) continue;
    shown += list.length;
    sections.push(sectionHTML(p, list));
  }

  const total = allModels().length;
  document.getElementById("count").textContent =
    shown === total && state.filter === "all" && !q
      ? `${total} models available free`
      : `${shown} of ${total} models matched`;

  // Every interpolated value passes through esc(); only our own literal markup is
  // raw, so setting innerHTML here carries no untrusted-HTML risk.
  document.getElementById("sections").innerHTML = sections.join("");
  document.getElementById("empty").hidden = shown > 0;
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
      const original = btn.lastChild.textContent;
      btn.classList.add("copied");
      btn.lastChild.textContent = " Copied";
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.lastChild.textContent = original;
      }, 1200);
    });
  });
}

function renderStats(data) {
  const items = [{ v: data.total_free, ember: true, l: "free models" }];
  for (const p of data.providers) items.push({ v: p.count, l: p.label });
  items.push({ v: fmtDate(data.generated_at), l: "data updated" });

  document.getElementById("stats").innerHTML = items
    .map((s) => `<div class="stat"><b class="${s.ember ? "ember" : ""}">${esc(s.v)}</b><span>${esc(s.l)}</span></div>`)
    .join("");
}

function renderChips() {
  const models = allModels();
  const present = CATS.filter((c) => c.key === "all" || models.some(c.test));
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
    document.getElementById("sections").innerHTML =
      `<p class="empty">Could not load the model data (<code>data/models.json</code>). ` +
      `If you opened this file directly, serve it over HTTP instead.</p>`;
  }
}

init();
