# Free Models Hub

One landing page plus four free-model catalogs and a Stealth catalog, served from a single repository:

| Path | Catalog |
| --- | --- |
| `/` | Landing page (live counts for all four) |
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
| `index.html`, `assets/hub.css`, `assets/hub.js` | The landing page. Counts are read live from each catalog's `data/models.json`, including the Stealth banner. |
| `<site>/index.html`, `<site>/assets/` | Each catalog's page (vanilla HTML/CSS/JS, no build step). |
| `<site>/scripts/fetch-models.mjs` | Each catalog's own generator — pulls its provider's live API and keeps the free models. No dependencies. |
| `<site>/data/models.json` | Generated snapshot each catalog page loads. |
| `.github/workflows/deploy.yml` | Runs all four generators, commits the refreshed data back, assembles `_site/`, publishes to GitHub Pages. Runs on push, daily at 06:00 UTC, and on demand. |

Paths are relative, so every catalog works both under `https://…/free-models-hub/<site>/` and in its
own standalone repository without modification.

**Auto-updates run on GitHub Actions only** — nothing is scheduled on any local machine. Each run
also commits the refreshed data back to `main` (as `github-actions[bot]`), which keeps the snapshot
current and keeps the schedule from being auto-disabled after 60 days of inactivity.

## Local preview

```bash
for s in openrouter opencode nous-portal commandcode stealth; do node "$s/scripts/fetch-models.mjs"; done
python -m http.server 8000          # then open http://localhost:8000
```

(The pages must be served over HTTP — opening them from disk blocks the JSON fetches.)
