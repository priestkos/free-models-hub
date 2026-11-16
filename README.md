# Free Models Hub

One landing page plus four free-model catalogs and a Stealth catalog, served from a single repository:

| Path | Catalog |
| --- | --- |
| `/` | Landing page. Live counts for the four catalogs, and a separate Stealth banner. |
| `/openrouter/` | Free models on OpenRouter |
| `/opencode/` | Free models on OpenCode (Zen + Go) |
| `/nous-portal/` | Free models on the Nous Portal |
| `/commandcode/` | Free models on Command Code |
| `/stealth/` | Every `stealth/` model being served across the four providers, from their live APIs |

**Live:** https://priestkos.github.io/free-models-hub/

The four standalone sites remain published separately — this repo is the collected copy, so the
site files live in one place instead of five.

## How it works

| Piece | Role |
| --- | --- |
| `index.html`, `assets/hub.css`, `assets/hub.js` | The landing page. Counts are read from each catalog's `data/models.json`. The Stealth banner is loaded on its own and stays out of the four-catalog total. |
| `<site>/index.html`, `<site>/assets/` | Each catalog's page (vanilla HTML/CSS/JS, no build step). |
| `<site>/scripts/fetch-models.mjs` | That catalog's generator. Exports `build()` for tests. Run as a script, it pulls the live API and writes `data/models.json`. No dependencies. Node 18+. |
| `<site>/data/models.json` | Generated snapshot the page loads. |
| `tests/` | Fixture tests for every `build()` and for the page scripts. No network. |
| `.github/workflows/deploy.yml` | Tests, refreshes all five generators, commits the data back, assembles `_site/`, publishes to GitHub Pages. Runs on push to `main`, daily at 06:00 UTC, and on demand. |

Paths are relative, so every catalog works both under `https://…/free-models-hub/<site>/` and in its
own standalone repository without modification.

**Auto-updates run on GitHub Actions only** — nothing is scheduled on any local machine. Each run
also commits the refreshed data back to `main` (as `github-actions[bot]`), which keeps the snapshot
current and keeps the schedule from being auto-disabled after 60 days of inactivity.

## What counts as free

Each generator filters the live API itself.

| Catalog | Kept when | Zero matches |
| --- | --- | --- |
| OpenRouter | `pricing.prompt` and `pricing.completion` are both numeric `0`. The id `openrouter/free` is kept and flagged `is_router`. | The script throws and leaves the previous file. |
| Nous Portal | Same `$0` / `$0` pricing rule. | The script throws and leaves the previous file. |
| OpenCode | Live ids come from the Zen gateway (`https://opencode.ai/zen/v1/models`) and the Go gateway (`https://opencode.ai/zen/go/v1/models`). Price and metadata come from `https://models.dev/api.json`. A listed id is free when `cost.input` and `cost.output` are both `0`. An id missing from that catalog is free when it ends in `-free`, and `big-pickle` is free on the same fallback. Catalog entries the gateway omitted are dropped. | Throws when both providers have no free models. One provider at zero is fine. |
| Command Code | The API reports no prices. An id is free when it ends in `free` at the start of the id or after `-`, `/`, or `:` (`:free`, `-free`). `freebie` and `freedom` stay out. | Writes `count: 0`. This list is a small preview and can be empty. |
| Stealth | The id starts with `stealth/` (any case), or the display name starts with the word `Stealth`. Five live lists are read: OpenRouter, OpenCode Zen, OpenCode Go, Nous, Command Code. | A provider may contribute zero Stealth models. The file is still written when every response was a non-empty `data[]` of models with string ids. |

`generated_at` is stamped on every successful write, so a refresh changes `data/models.json` even when the model list is the same. The daily commit is expected.

### Stealth reasoning flag

A boolean `reasoning` is stored as-is. An object is `true` only when `default_enabled` or `mandatory` is set. A missing flag is stored as `false`.

## Refresh and publish

`.github/workflows/deploy.yml` runs on `ubuntu-latest` with Node 20. Concurrency group `pages` waits; an in-progress deploy is left running.

1. **Test.** `node --test tests/` against fixtures. A failure stops the job before any catalog is refreshed.
2. **Refresh.** `openrouter`, `opencode`, `nous-portal`, `commandcode`, and `stealth` each run on their own. A non-zero exit writes nothing for that catalog, logs a warning, and the last good `data/models.json` is what gets published. One provider being down leaves the others, and the deploy, running.
3. **Commit.** When any `*/data/models.json` changed, the job commits only those files as `github-actions[bot]`:

   ```
   chore: refresh free-model catalogs and Stealth [skip ci]
   ```

   `[skip ci]` keeps that commit from starting another deploy.
4. **Push.** The data commit is rebased onto `origin/main` and pushed, so a queued run still lands on a `main` that moved during the job. If that rebase or push fails, the rebase is aborted and this run's site is deployed anyway. The refreshed files are in that Pages deploy. `main` keeps the previous snapshot.
5. **Assemble.** `_site/` receives `index.html`, `assets/`, and each catalog's `index.html`, `assets/`, and `data/`. Generators and tests stay in the repo.

A generator throws, and therefore skips the write, when:

- The HTTP status is not OK.
- The body is missing `data`, `data` is empty, or an entry lacks a string `id`. OpenCode also throws when `models.dev` has no `opencode` or `opencode-go` model map.
- OpenRouter, Nous, or OpenCode would publish zero free models. That empty result is treated as a pricing or filter change. Command Code may publish zero. Stealth may publish zero Stealth models. One bad provider body fails the whole Stealth script, so a partial Stealth list is never written.

Trigger a run from the Actions tab, or:

```bash
gh workflow run "Deploy to GitHub Pages"
```

## Local preview

```bash
for s in openrouter opencode nous-portal commandcode stealth; do node "$s/scripts/fetch-models.mjs"; done
python -m http.server 8000          # then open http://localhost:8000
```

The pages must be served over HTTP. Opening them from disk blocks the JSON fetches.

A failed script leaves that catalog's previous `data/models.json` in place. Re-run the one that failed.

## Tests

```bash
node --test tests/*.mjs
```

CI runs `node --test tests/` on Node 20. On Node 22.23 that directory form tries to load `tests` as a module (`Cannot find module …/tests`). Pass the files. Both forms cover the same 12 tests when the runner accepts the directory.

`tests/fetch-models.test.mjs` imports each `build()` and feeds `tests/fixtures/`. `tests/frontend.test.mjs` runs `assets/hub.js` and each catalog's `assets/app.js` in a `vm` with a stub DOM.

## Landing page

`assets/hub.js` fetches the four catalog snapshots with `cache: "no-store"`. Each catalog card already contains a link to its page, so the catalogs open with the script unloaded.

- OpenCode's count is the sum of `providers[].count`. When `providers` is present, `total_free` is ignored. A flat catalog uses `count`, then `total_free`, then `models.length`.
- Previews show up to four model names. OpenCode names are read from each provider's `models`.
- The Stealth banner reads `stealth/data/models.json` (`count`, otherwise `models.length`). Those models already sit inside the provider catalogs, so the banner is kept out of `[data-total]`.
- A missing `.site-card[data-site="…"]` is skipped. The other catalogs still total. `index.html` is expected to have a card for every path in `SITES`.
- A failed fetch shows `—` and `count unavailable` on that card. The headline names how many catalogs failed. When all four fail it reads `Live counts unavailable — open a catalog below`.
- A missing or unparseable `generated_at` renders as `—` (an em dash). The same `fmtDate` is on every catalog page. A valid stamp renders like `Nov 11, 2026`.

## Pitfalls

- Editing `data/models.json` on `main` by hand gets overwritten on the next successful refresh, including `generated_at`.
- An empty Command Code or Stealth page can be a real empty result. An empty OpenRouter, Nous, or OpenCode file on disk is the previous good snapshot: those generators refuse to write zero free models.
- Stealth is fail-closed across providers. One empty or reshaped API response keeps the previous Stealth file, including providers that would have succeeded.
- OpenCode's `-free` suffix applies to ids missing from `models.dev`. An id that is in the catalog is kept or dropped by its cost fields.
- A data commit on `main` with `[skip ci]` updates the snapshot and does not redeploy by itself. The workflow that created the commit is the one that publishes.
