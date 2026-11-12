// Fixture tests for the catalog generators. Run: node --test tests/
// No network: each script's build() is fed the canned API bodies in tests/fixtures/.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { build as openrouter } from "../openrouter/scripts/fetch-models.mjs";
import { build as nous } from "../nous-portal/scripts/fetch-models.mjs";
import { build as commandcode } from "../commandcode/scripts/fetch-models.mjs";
import { build as opencode } from "../opencode/scripts/fetch-models.mjs";
import { build as stealth } from "../stealth/scripts/fetch-models.mjs";

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const ids = (out) => out.models.map((m) => m.id).sort();
const stealthBodies = () => [fx("openrouter"), fx("opencode-zen"), fx("opencode-go"), fx("nous"), fx("commandcode")];

test("openrouter keeps only $0/$0 models", () => {
  const out = openrouter(fx("openrouter"));
  assert.deepEqual(ids(out), ["a/free-one:free", "openrouter/free", "stealth/ghost"]);
  assert.equal(out.total_models, 5);
  assert.equal(out.models.find((m) => m.id === "openrouter/free").is_router, true);
});

test("nous keeps only $0/$0 models", () => {
  const out = nous(fx("nous"));
  assert.deepEqual(ids(out), ["nous/hermes-free"]);
  assert.equal(out.models[0].reasoning, true);
  assert.equal(out.models[0].tool_call, true);
});

test("commandcode isFree matches :free and -free suffixes, not freebie or freedom", () => {
  assert.deepEqual(ids(commandcode(fx("commandcode"))),
    ["poolside/laguna-s-2.1-free", "stealth/glyph-cluster:free", "x/a:free"]);
});

test("opencode: $0 catalog models plus -free ids the catalog lacks", () => {
  const out = opencode(fx("modelsdev"), [fx("opencode-zen"), fx("opencode-go")]);
  const [zen, go] = out.providers;
  assert.deepEqual(zen.models.map((m) => m.id).sort(), ["jev-1.13-free", "new-thing-free", "zero"]);
  assert.deepEqual(go.models.map((m) => m.id), ["big-pickle"]);
  assert.equal(out.total_free, 4);
});

test("stealth collects stealth/ models from every provider", () => {
  const out = stealth(stealthBodies());
  assert.deepEqual(ids(out), ["stealth/ghost", "stealth/glyph-cluster:free", "stealth/go-ghost"]);
  assert.deepEqual(out.providers.map((p) => p.count), [1, 0, 1, 0, 1]);
});

const BAD = { "no data": {}, "empty data": { data: [] }, "renamed key": { models: [{ id: "a" }] },
  "items without id": { data: [{ name: "a" }] } };

test("empty or shape-changed responses throw instead of writing", () => {
  for (const [why, body] of Object.entries(BAD)) {
    assert.throws(() => openrouter(body), /non-empty data/, `openrouter: ${why}`);
    assert.throws(() => nous(body), /non-empty data/, `nous: ${why}`);
    assert.throws(() => commandcode(body), /non-empty data/, `commandcode: ${why}`);
    assert.throws(() => opencode(fx("modelsdev"), [body, fx("opencode-go")]), /non-empty data/, `opencode: ${why}`);
    const bodies = stealthBodies();
    bodies[2] = body;
    assert.throws(() => stealth(bodies), /non-empty data/, `stealth: ${why}`);
  }
  assert.throws(() => opencode({}, [fx("opencode-zen"), fx("opencode-go")]), /models\.dev/);
});

test("a catalog with no free models left is refused where that means a pricing change", () => {
  const paid = { data: [{ id: "p/x", pricing: { prompt: "1", completion: "1" } }] };
  assert.throws(() => openrouter(paid), /no free models/);
  assert.throws(() => nous(paid), /no free models/);
  const dev = { opencode: { models: { x: { id: "x", cost: { input: 1, output: 1 } } } }, "opencode-go": { models: { x: { id: "x", cost: { input: 1, output: 1 } } } } };
  assert.throws(() => opencode(dev, [{ data: [{ id: "x" }] }, { data: [{ id: "x" }] }]), /no free models/);
  // Command Code and Stealth lists are small previews that can legitimately run dry.
  assert.equal(commandcode({ data: [{ id: "p/x" }] }).count, 0);
});
