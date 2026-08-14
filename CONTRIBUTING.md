# Contributing a plugin

The market's catalog is a single JSON file: [`data/plugins.json`](data/plugins.json).
Adding your plugin is a plain GitHub pull request — no git CLI needed if you
use the GitHub web editor.

## Steps (web UI)

1. Open [`data/plugins.json`](data/plugins.json) in this repo.
2. Click the pencil (Edit) button.
3. Copy one existing entry, change it to your plugin, and insert it inside the `"plugins": [...]` array.
4. **Commit changes…** → **Propose changes** → **Create pull request**.

A validation workflow runs automatically on the PR and fails if the JSON is
malformed or an entry is missing required fields.

## Entry shape (that's it — keep it simple)

```jsonc
{
  "url": "https://github.com/you/your-plugin",   // your repo URL (required, unique)
  "tags": ["记忆增强", "UI美化"],                  // 0-5 searchable tags (optional)
  "npm": "your-npm-package"                      // required — install/update go through the npm package
}
```

- `url` — the plugin's GitHub repo; the card name, author and stats (stars /
  last commit) are all derived from it automatically.
- `tags` — what users would search for, e.g. `记忆增强`, `UI美化`, `自动化`, `多模型`.
  Cards show every tag and the search box matches them.
- `npm` — **required**: the plugin must be published to npm; installation and
  updates go through the npm package (GitHub installs are not used).

Run the linter locally if you can: `node scripts/validate.mjs data/plugins.json`.
