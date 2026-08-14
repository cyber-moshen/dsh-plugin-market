# dsh-plugin-market

**Plugin Workshop** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI — a curated plugin catalog that lives in this very repo.

[中文](README.zh.md) · [日本語](README.ja.md)

## What it is

A **Settings → Plugin Workshop (插件工坊)** page with:

- a **card grid** of community plugins — each card shows **tags** (click a tag to search it), **GitHub stars**, **last-commit freshness** with a colored maintenance signal, and the **installed version / update state**;
- **search across names, descriptions, authors and tags**, plus an always-visible filter bar (installed state, sort by stars/commit, maintenance state);
- **one-click install / update** (runs the real `dsh plugin` CLI in the background, with all environment quirks handled — see below);
- a **GitHub icon button** on every card jumping straight to the repo;
- a **settings modal** with a **GitHub Token** field (lifts API rate limits) and a **startup auto-update** toggle;
- the **whole workshop follows the app's own language** (Settings → General → Language: 中文 / English);
- a frame-wide **"plugins auto-updated — restart to apply"** toast after a boot-time auto-update.

**The catalog is this repo's own `data/plugins.json`** — anyone can add a plugin by opening a pull request (see [Contributing](#submitting-a-pr-to-add-your-plugin)). The plugin fetches it from here at runtime (mirror chain), with the bundled copy as an offline snapshot.

## Install

```sh
# from a directory containing this repo checkout:
dsh plugin --profile web add ./dsh-plugin-market -w
# restart the web server, then open Settings → Plugin Workshop
```

## Usage

### The workshop page

1. Open **Settings → Plugin Workshop**.
2. **Search** — type anything; it matches plugin name, description, author **and tags**. Click a `#tag` on a card to search that tag.
3. **Filter bar** (always visible under the search box):
   - **Installed** — All / Installed / Not installed
   - **Sort** — Stars ↑ · Stars ↓ · Commit ↑ · Commit ↓
   - **Maintenance** — All / Active / Stale / Unmaintained / Unknown
4. **Card actions**:
   - ⭐ Stars and 🕓 last commit come from the GitHub API (see [data sources](#data-and-rate-limits)); the maintenance tile is colored: green = pushed within 3 months, amber = within a year, red = older / archived.
   - **Not installed** → `Install` button.
   - **Installed, newer version available** → `Installed vX` + `Update → vY` button.
   - **Installed, current** → just `Installed vX` (no button). (Uninstall is available from the native plugin list / CLI.)
   - The GitHub icon (top-right) opens the repo page.

### Settings modal (the `Settings` button next to the search box)

- **Language** — the workshop follows the app's own setting (Settings → General → Language; 中文 / English). No separate switch needed.
- **GitHub Token (optional)** — paste a token to raise the API rate limit from 60 requests/hour to 5000/hour. See [How to get a token](#how-to-get-a-github-token). The `GITHUB_TOKEN` / `GH_TOKEN` environment variables take precedence.
- **Auto-update installed plugins on startup** — when enabled, the web server checks installed plugins after boot and updates any with newer versions; once done, a toast on the home page asks you to restart the web server to apply.

## How to get a GitHub Token

1. Go to <https://github.com/settings/tokens> (Settings → Developer settings → Personal access tokens).
2. Click **Generate new token (classic)**.
3. Give it a name (e.g. `dsh-plugin-market`), set an expiry.
4. Tick the **`repo`** scope (that is all this plugin needs).
5. Click **Generate token** and **copy it now** (it is shown only once).
6. Paste it into the workshop **Settings** modal and press **Save**. A ✓ appears once a token is stored.

> Keep the token private — it grants write access to your repositories.

## Submitting a PR to add your plugin

The catalog is a single JSON file: [`data/plugins.json`](data/plugins.json).

1. Open `data/plugins.json` in this repo on GitHub.
2. Click the pencil (**Edit**) button.
3. Copy an existing entry, change it to your plugin, insert it under the right `category` inside `"plugins": [...]`, and keep `"count"` in sync.
4. **Commit changes… → Propose changes → Create pull request.**

A validation workflow runs on every PR and fails on malformed JSON or missing fields (you can run it locally with `node scripts/validate.mjs data/plugins.json`).

Entry shape:

```jsonc
{
  "name": "your-plugin-name",                 // display name (unique)
  "owner": "your-github-username",
  "url": "https://github.com/you/your-plugin",// github.com URL
  "category": "tools",                        // ui | theme | session | memory | tools | skill | workflow | notify | model | dev | fun
  "tags": ["工具增强", "自动化"],               // 0-5 searchable tags (e.g. 记忆增强 / UI美化)
  "description": { "en": "...", "zh": "..." },// one line each
  "npm": null,                                // npm package name if published, else null
  "install": "dsh plugin --profile web add github:you/your-plugin",
  "added": "2026-01-01"
}
```

Missing a category? Add it to the `categories` map at the top of the file — the UI builds its filters from whatever is there.

## Data and rate limits

- **Catalog** — this repo's `data/plugins.json`, fetched at runtime over a mirror chain (ghproxy → gh-proxy → ghfast → raw.githubusercontent → github.com/raw). If the repo is unreachable, the bundled snapshot is used.
- **Stars / last commit** — the GitHub API, cached on disk for 24h (`$DSH_HOME/.dsh-plugin-market-cache.json`) and topped up in the background. Without a token the anonymous limit is **60 requests/hour**; when exhausted, shields.io badges are used as a fallback (stars usually work; the last-commit badge is unreliable, so some cards may show `—` until the API quota resets or a token is configured). Entries with shields-only data are automatically re-fetched from the API when available.
- **Versions** — npm registry for npm-published plugins, the repo's `package.json` otherwise (no API quota involved).

## Why the odd install flags?

Profiles are pnpm workspace roots, so every pnpm call passes `-w`. Several `@deepseek-ai` peer packages carry a broken `latest` dist-tag on npmjs (0.0.1-rc.1 depends on the unpublished `@deepseek-ai/dsh-compact`), so installs pin the standard peers (`@deepseek-ai/cordis`, `dsh-client-runtime`, `dsh-client-ui-slots`, `react`) to the versions already in the profile. Full-app plugins (TUI clients etc.) are refused for the web profile (api-gateway conflict guard).

## Troubleshooting

- **"not found is not valid JSON"** — the browser is running a stale page from before the plugin was updated. Hard-refresh (`Ctrl+Shift+R`) or open a new tab after restarting the web server.
- **`—` stars / Unknown maintenance** — GitHub API rate limit; configure a token (above) or wait for the hourly reset (the background loop fills in automatically).
- **Network to GitHub failing** — the plugin uses public mirrors; if you have a local proxy (e.g. Clash), set `HTTPS_PROXY`/`HTTP_PROXY`, and for git/gh: `git config --global http.https://github.com.proxy http://127.0.0.1:7890`.

## Development

- `lib/host.js` — Cordis host: the `/api/dsh-plugin-market` route, catalog + stats, install/update tasks, dsh CLI resolution.
- `lib/client.js` — browser client: the workshop UI, filter bar, settings modal, restart toast.
- `data/plugins.json` — the catalog (edit me to curate).
- `scripts/seed.mjs` — rebuild the catalog from the upstream awesome list, top-N per category by stars (`node scripts/seed.mjs --top 10`).
- `scripts/validate.mjs` — catalog linter (used by the PR workflow).
- `scripts/prewarm.mjs` — smoke test + stats cache pre-fill.

## License

MIT · installing a plugin downloads and runs third-party code — review the source and install at your own risk.
