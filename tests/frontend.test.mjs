// Runs the browser scripts in a vm with a tiny DOM stub. Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const el = () => ({ textContent: "", innerHTML: "", setAttribute() {}, querySelector: () => el(), addEventListener() {} });
const flush = () => new Promise((r) => setImmediate(r));

function run(file, { fetch = () => new Promise(() => {}), query = () => el() } = {}) {
  const els = {};
  const ctx = {
    fetch, console,
    document: {
      querySelector: (s) => (s in els ? els[s] : (els[s] = query(s))),
      querySelectorAll: () => [], getElementById: (id) => (els[`#${id}`] ??= el()),
      createElement: () => el(), addEventListener() {},
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(read(file), ctx);
  return { ctx, els };
}

const APPS = ["openrouter", "opencode", "nous-portal", "commandcode", "stealth"].map((s) => `${s}/assets/app.js`);

test("fmtDate shows a dash, not 'Invalid Date', for bad or missing dates", () => {
  for (const file of [...APPS, "assets/hub.js"]) {
    const { ctx } = run(file);
    assert.equal(ctx.fmtDate("not a date"), "—", file);
    assert.equal(ctx.fmtDate("2026-11-11T13:23:03.607Z"), "Nov 11, 2026", file);
  }
  assert.equal(run("assets/hub.js").ctx.fmtDate(undefined), "—");
});

test("hub: a missing site card does not stop the totals", async () => {
  const data = (path) => JSON.parse(read(path.replace(/^\//, "")));
  const { els } = run("assets/hub.js", {
    fetch: async (url) => ({ ok: true, json: async () => data(url) }),
    query: (s) => (s.includes('data-site="opencode"') ? null : el()),
  });
  await flush();
  const expected = ["openrouter", "nous-portal", "commandcode"]
    .map((s) => data(`${s}/data/models.json`).count).reduce((a, b) => a + b);
  assert.equal(els["[data-total]"].textContent, expected);
  assert.notEqual(els["[data-updated]"].textContent, "");
});

test("hub: index.html has a card for every catalog hub.js reads", () => {
  const html = read("index.html");
  for (const [, path] of read("assets/hub.js").matchAll(/path: "([^"]+)"/g)) {
    assert.ok(html.includes(`data-site="${path}"`), path);
  }
});
