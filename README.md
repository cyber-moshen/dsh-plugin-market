# dsh-plugin-market

Open-source plugin market for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI.

A card-grid **Plugin Market** tab under **Settings → Plugins**:

- one card per plugin with **GitHub stars**, **last-commit freshness** (colored maintenance signal), and one-click **install / uninstall** (runs the real `dsh plugin` CLI with all the quirks of this setup handled);
- the **GitHub icon button** on each card jumps straight to the repo — no in-app README viewer;
- icons are GitHub's own [octicons](https://github.com/primer/octicons) (MIT), inlined as SVG.

**The catalog is this repo's own `data/plugins.json`** — the plugin fetches it from here at runtime (raw mirror chain), with the bundled copy as an offline snapshot. Anyone can add a plugin: edit `data/plugins.json` and open a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Install

```sh
# from a directory containing this repo checkout:
dsh plugin --profile web add ./dsh-plugin-market -w
# restart the web server, then open Settings → Plugins → Plugin Market
```

## Data

| What | Where |
|---|---|
| Catalog (list of plugins) | this repo's `data/plugins.json` — fetched at runtime, bundled snapshot as fallback |
| Stars / last commit | GitHub API (`GITHUB_TOKEN`/`GH_TOKEN` honored), shields.io badge fallback on rate-limit, disk-cached 24h (`$DSH_HOME/.dsh-market-card-cache.json`), background top-up |

Point the plugin at your own fork by editing `CATALOG_REPO` in `lib/host.js`.

## Why these install flags?

Profiles are pnpm workspace roots, so every pnpm call passes `-w`; several
`@deepseek-ai` peer packages carry a broken `latest` dist-tag on npmjs
(0.0.1-rc.1 → unpublished `@deepseek-ai/dsh-compact`), so installs pin the
standard peers (`@deepseek-ai/cordis`, `dsh-client-runtime`,
`dsh-client-ui-slots`, `react`) to the versions already in the profile.
Full-app plugins (TUI clients etc.) are refused for the web profile
(api-gateway conflict guard).

## Layout

- `lib/host.js` — Cordis host plugin: `/api/dsh-plugin-market` route, catalog + enrichment, install/uninstall ops, dsh CLI resolution.
- `lib/client.js` — browser client: card grid, op modal, octicon icons.
- `data/plugins.json` — the catalog (edit me to curate).
- `scripts/seed.mjs` — bootstrap: rebuild `data/plugins.json` from the upstream awesome list, top-N per category by stars.
- `scripts/validate.mjs` — catalog lint used by the PR workflow.
- `cordis.patch.yml` — bundle patch inserting the `dsh-plugin-market` row.

## License

MIT · installing a plugin downloads and runs third-party code — review the source and install at your own risk.
