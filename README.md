# @cyber-moshen/dsh-plugin-market

**Plugin Workshop** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI — a curated plugin catalog that lives in this very repo.

[中文](README.zh.md) · [日本語](README.ja.md)

## What it is

A **Settings → Plugin Workshop (插件工坊)** page with:

- a **card grid** of community plugins — each card shows **tags** (click a tag to search it), **GitHub stars**, **last-commit freshness** with a colored maintenance signal, and the **installed version / update state**;
- **search across names, authors and tags**, plus an always-visible filter bar (installed state, sort by stars/commit, maintenance state);
- **one-click install / update** (runs the real `dsh plugin` CLI in the background);
- a **GitHub icon button** on every card jumping straight to the repo;
- a **settings modal** with a **GitHub Token** field (lifts API rate limits) and a **startup auto-update** toggle;
- the **whole workshop follows the app's own language** (Settings → General → Language: 中文 / English);
- a frame-wide toast after a boot-time auto-update — pure-JS plugins hot-reload in place, plugins with native modules ask for a restart.
- **hot reload** — installing/updating/uninstalling a pure-JS plugin applies it to the running process immediately and refreshes the page; no restart needed. Plugins shipping native modules (`.node`) are detected and prompt for a restart instead.

**The catalog is this repo's own `data/plugins.json`** — anyone can add a plugin by opening a pull request (see [Submitting a PR](#submitting-a-pr-to-add-your-plugin)). The plugin fetches it live at runtime; there is no offline cache or snapshot.

## Install

One command from anywhere (once published to npm):

```sh
dsh plugin --profile web add @cyber-moshen/dsh-plugin-market
```

From a local checkout:

```sh
dsh plugin --profile web add ./dsh-plugin-market -w
```

Restart the web server, then open **Settings → Plugin Workshop**. After that, installing/updating pure-JS plugins needs no restart.

## Usage

### The workshop page

1. Open **Settings → Plugin Workshop**.
2. **Search** — matches plugin name, author **and tags**. Click a `#tag` on a card to search that tag.
3. **Filter bar** (always visible under the search box):
   - Installed — All / Installed / Not installed
   - Sort — Stars ↑ · Stars ↓ · Commit ↑ · Commit ↓
   - Maintenance — All / Active / Stale / Unmaintained / Unknown
4. **Card actions**:
   - ⭐ Stars and 🕓 last commit are fetched live from the GitHub API; the maintenance tile is colored: green = pushed within 3 months, amber = within a year, red = older / archived.
   - **Not installed** → `Install` button (installs via the npm package).
   - **Installed, newer version available** → `Installed vX` + `Update → vY`.
   - **Installed, current** → just `Installed vX`.
   - Installed plugins also get an **Uninstall** button next to `Update`.
   - The GitHub icon (top-right) opens the repo page.

### Settings modal (the `Settings` button next to the search box)

- **GitHub Token (optional)** — paste a token to raise the API rate limit from 60 requests/hour to 5000/hour. See [How to get a token](#how-to-get-a-github-token). The `GITHUB_TOKEN` / `GH_TOKEN` environment variables take precedence. Saving an empty box never clears a stored token; use the `Clear` button to remove it.
- **Auto-update installed plugins on startup** — when enabled, the web server checks installed plugins after boot and updates any with newer versions; pure-JS plugins hot-reload in place, native ones show a restart toast.

## How to get a GitHub Token

1. Go to <https://github.com/settings/tokens> (Settings → Developer settings → Personal access tokens).
2. Click **Generate new token (classic)**.
3. Give it a name (e.g. `dsh-plugin-market`), set an expiry.
4. Tick the **`repo`** scope (that is all this plugin needs).
5. Click **Generate token** and **copy it now** (it is shown only once).
6. Paste it into the workshop **Settings** modal and press **Save**. A `✓ Token saved (···xxxx)` line appears once a token is stored.

> Keep the token private — it grants write access to your repositories.

## Submitting a PR to add your plugin

The catalog is a single JSON file: [`data/plugins.json`](data/plugins.json).

1. Open `data/plugins.json` in this repo on GitHub.
2. Click the pencil (**Edit**) button.
3. Copy an existing entry, change it to your plugin, insert it inside `"plugins": [...]`.
4. **Commit changes… → Propose changes → Create pull request.**

A validation workflow runs on every PR and fails on malformed JSON or missing fields (run it locally with `node scripts/validate.mjs data/plugins.json`).

Entry shape (keep it simple — everything else is derived from the URL):

```jsonc
{
  "url": "https://github.com/you/your-plugin",  // your repo URL (required, unique)
  "tags": ["记忆增强", "UI美化"],                 // 0-5 searchable tags (optional)
  "npm": "your-npm-package"                     // required — install/update go through the npm package
}
```

The card name, author and stats are all derived from `url`; **`npm` is required** — installation and updates go through the npm package (GitHub installs are not used).

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
