# Contributing a plugin

The market's catalog is a single JSON file: [`data/plugins.json`](data/plugins.json).
Adding your plugin is a plain GitHub pull request — no git CLI needed if you
use the GitHub web editor.

## Steps (web UI)

1. Open [`data/plugins.json`](data/plugins.json) in this repo.
2. Click the pencil (Edit) button.
3. Copy one existing entry (the shape below), change it to your plugin, and
   insert it under the right `category` inside the `"plugins": [...]` array.
4. **Commit changes…** → **Propose changes** → **Create pull request**.

A validation workflow runs automatically on the PR and fails if the JSON is
malformed or an entry is missing required fields.

## Entry shape

```jsonc
{
  "name": "your-plugin-name",                      // display name
  "owner": "your-github-username",                 // repo owner
  "url": "https://github.com/you/your-plugin",     // repo URL (github.com)
  "category": "tools",                             // one of: ui | theme | session | memory | tools | workflow | notify | model | dev | fun
  "description": {
    "en": "One-line English description.",
    "zh": "一句话中文描述。"
  },
  "npm": null,                                     // npm package name if published, else null
  "install": "dsh plugin --profile web add github:you/your-plugin",   // the install command
  "added": "2026-01-01"                            // date added (YYYY-MM-DD)
}
```

## Rules

- `name` must be unique in the file.
- `url` must be a valid `https://github.com/<owner>/<repo>` (the plugin card's GitHub button and star lookup use it).
- `install` should be the official install command, `--profile <name>` included.
- Keep `count` (root field) equal to the number of entries in `plugins`.
- Run the linter locally if you can: `node scripts/validate.mjs data/plugins.json`.

## Categories

| id | meaning |
|---|---|
| `ui` | UI Enhancements |
| `theme` | Themes & Appearance |
| `session` | Sessions & Messages |
| `memory` | Memory |
| `tools` | Tools & Capabilities |
| `workflow` | Workflow & Automation |
| `notify` | Notifications & Integrations |
| `model` | Models & Providers |
| `dev` | Development & Runtime |
| `fun` | Just for Fun |

Missing a category? Add it to the `categories` map at the top of the JSON and
use its id — the UI builds filter chips from whatever categories exist.
