// Bootstrap / maintenance script: rebuild data/plugins.json from the upstream
// awesome-dsh-plugin registry, keeping the top N plugins per category by GitHub
// stars (stars read from the local dsh-market-card enrichment cache; entries
// without cached stars rank last). One-time bootstrap for a fresh repo; re-run
// whenever you want to re-sync your curated subset.
//
// Usage: node scripts/seed.mjs [--out data/plugins.json] [--top 10]
//        --source <url-or-file>   upstream catalog (default: awesome repo docs/plugins.json)
//        --cache <path>           enrichment cache (default: $DSH_HOME/.dsh-market-card-cache.json)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const pick = (flag, fallback) => {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const out = pick('--out', join(here, '..', 'data', 'plugins.json'))
const top = Number(pick('--top', '10'))
const source = pick('--source', 'https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/HEAD/docs/plugins.json')
const cachePath = pick('--cache', join(process.env.DSH_HOME || (homedir() + '/.dsh'), '.dsh-market-card-cache.json'))

const MIRRORS = [
  (o, r, f) => `https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
  (o, r, f) => `https://github.com/${o}/${r}/raw/HEAD/${f}`,
  (o, r, f) => `https://ghproxy.net/https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
  (o, r, f) => `https://gh-proxy.com/https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
  (o, r, f) => `https://ghfast.top/https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
]

async function fetchText(url) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url)
  return r.text()
}

async function loadUpstream(spec) {
  if (/^https?:\/\//.test(spec)) {
    let lastErr = null
    for (const mirror of MIRRORS) {
      try { return JSON.parse(await fetchText(mirror('awesome-dsh-plugin', 'awesome-dsh-plugin', 'docs/plugins.json'))) } catch (e) { lastErr = e }
    }
    throw lastErr
  }
  return JSON.parse(readFileSync(spec, 'utf8'))
}

let cache = { repos: {} }
try { cache = JSON.parse(readFileSync(cachePath, 'utf8')) } catch {}
const starsOf = (owner, repo) => {
  const m = cache.repos && cache.repos[`${owner}/${repo}`]
  return m && typeof m.stars === 'number' ? m.stars : 0
}

const upstream = await loadUpstream(source)
const plugins = upstream.plugins || []
const categories = upstream.categories || {}

/** Seed tags derived from the plugin category (the repo owner curates more). */
const CATEGORY_TAGS = {
  ui: ['UI增强'],
  theme: ['主题外观'],
  session: ['会话'],
  memory: ['记忆增强'],
  tools: ['工具增强'],
  workflow: ['工作流'],
  notify: ['通知集成'],
  model: ['模型接入'],
  dev: ['开发工具'],
  fun: ['娱乐'],
}

const groups = new Map()
for (const p of plugins) {
  const cat = p.category || 'other'
  if (!groups.has(cat)) groups.set(cat, [])
  groups.get(cat).push(p)
}
const kept = []
for (const [cat, list] of groups) {
  const ranked = [...list]
    .map((p) => ({ p, stars: starsOf(p.owner, p.url ? p.url.split('/').slice(-2).join('/').replace(/\.git$/, '') : '') }))
    .sort((a, b) => b.stars - a.stars || String(a.p.name).localeCompare(String(b.p.name)))
  for (const { p } of ranked.slice(0, top)) {
    const entry = { ...p }
    // Normalize names: some upstream entries are "owner/name" — strip the owner prefix.
    if (typeof entry.name === 'string' && entry.name.includes('/')) {
      const slash = entry.name.indexOf('/')
      if (entry.name.slice(0, slash) === entry.owner) entry.name = entry.name.slice(slash + 1)
    }
    entry.tags = CATEGORY_TAGS[p.category] ? [...CATEGORY_TAGS[p.category]] : []
    kept.push(entry)
  }
}
// stable category order: upstream order, then unknown categories alphabetically
const catOrder = [...Object.keys(categories), ...[...groups.keys()].filter((c) => !(c in categories))].filter((c, i, a) => a.indexOf(c) === i)
const ordered = []
for (const cat of catOrder) ordered.push(...kept.filter((p) => (p.category || 'other') === cat))

// Disambiguate duplicate names (two different repos can share a name, e.g. dsh-memory).
const used = new Set()
for (const e of ordered) {
  if (used.has(e.name)) e.name = `${e.name} (${e.owner})`
  used.add(e.name)
}

const result = {
  name: 'dsh-plugin-market',
  url: 'https://github.com/cyber-moshen/dsh-plugin-market',
  source: 'https://github.com/cyber-moshen/dsh-plugin-market',
  updated: new Date().toISOString().slice(0, 10),
  count: ordered.length,
  categories,
  plugins: ordered,
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
console.log(`wrote ${ordered.length} plugins (top ${top} per category) to ${out}`)
const perCat = {}
for (const p of ordered) perCat[p.category] = (perCat[p.category] || 0) + 1
console.log('per category:', JSON.stringify(perCat))
