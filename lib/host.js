// dsh-plugin-market — host half.
//
// Serves the catalog + install/update machinery behind the web GUI's
// "Plugin Workshop" settings page. One HTTP endpoint (/api/dsh-plugin-market)
// backs every browser interaction:
//
//   list     — the curated catalog (this repo's data/plugins.json, fetched
//              over a raw mirror chain with a bundled snapshot fallback),
//              merged with live repo stats (stars, last push) from a disk
//              cache that a background loop tops up (GitHub API first,
//              shields.io badges when the API is rate-limited). Installed
//              plugins get version/update annotations (npm registry or the
//              repo's package.json), so the UI can show 安装 / 已安装 /
//              更新 states.
//   notice   — the "plugins were auto-updated, restart to apply" record.
//   config   — read/write { githubToken, autoUpdate } persisted under
//              $DSH_HOME/.dsh-plugin-market-config.json.
//   op/kill  — one live install/update/uninstall task (pnpm via the dsh CLI,
//              background, polled by the UI).
//
// Two environment quirks are handled: profiles are pnpm workspace roots, so
// every pnpm call passes -w; and several @deepseek-ai peers carry a broken
// `latest` dist-tag on npmjs (0.0.1-rc.1 depends on the unpublished
// @deepseek-ai/dsh-compact), so installs pin the peer versions already
// present in the profile.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'

export const name = 'dsh-plugin-market'

/** Hard dependency: the HTTP carrier must exist before the route registers. */
export const inject = ['webServer']

// ------------------------------------------------------------------ catalog
// Point CATALOG_REPO at a fork to change the curated list; the bundled
// data/plugins.json is the offline snapshot.
const CATALOG_REPO = 'cyber-moshen/dsh-plugin-market'
const CATALOG_FILE = 'data/plugins.json'

const TASK_TIMEOUT = 180000
const CATALOG_TTL = 10 * 60 * 1000
const VERSION_TTL_NPM = 6 * 60 * 1000
const VERSION_TTL_RAW = 24 * 60 * 60 * 1000
const API_BASE = 'https://api.github.com'
/** Raw-file mirrors, fastest for CN networks first (ghproxy-style proxies
 *  verified; raw.githubusercontent.com is flaky; raw.gitmirror.com is dead). */
const RAW_MIRRORS = [
  (o, r, f) => `https://ghproxy.net/https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
  (o, r, f) => `https://gh-proxy.com/https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
  (o, r, f) => `https://ghfast.top/https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
  (o, r, f) => `https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
  (o, r, f) => `https://github.com/${o}/${r}/raw/HEAD/${f}`,
]
/** Peer packages every web-profile bundle may declare; installs pin these to
 *  the profile's own versions (see the broken-latest-tag quirk above). */
const PEER_KEYS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-slots',
  'react',
]
/** Dependency names that only a full agent-profile app carries. */
const APP_CORE_DEPS = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-default-model',
  '@deepseek-ai/dsh-agent-spine-demo',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-user-approval',
  '@deepseek-ai/dsh-user-questions',
  '@deepseek-ai/dsh-workflow',
  '@deepseek-ai/dsh-subagent',
  '@deepseek-ai/dsh-permission-presets',
]

/** The one task the UI may run at a time (pnpm serializes on the store). */
let liveTask = null
let taskCounter = 0
/** In-memory catalog mirror (TTL-cached, per process — never written to disk). */
let catalogMirror = null
/** Live repo stats, in memory only: repoKey -> { meta, at }. */
const liveStats = new Map()
/** Live latest versions, in memory only: repoKey -> { version, at }. */
const liveVersions = new Map()
/** Live git-source baselines for update detection, in memory only. */
const liveBaselines = new Map()
/** GitHub API rate-limit reset timestamp (module-local). */
let ghLimitedUntil = 0
/** Background stats backfill handle. */
let statsRefreshing = null
/** Whether the boot-time auto-update check has run this process. */
let bootCheckDone = false

function homeDir() {
  return process.env.DSH_HOME || (homedir() + '/.dsh')
}

function configPath() {
  return join(homeDir(), '.dsh-plugin-market-config.json')
}

function profilePath(profile) {
  return homeDir().replace(/[\\/]+$/, '') + '/profiles/' + profile
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function repoOf(url) {
  const u = String(url || '')
  const m = /github\.com\/([^/]+)\/([^/?#]+)/.exec(u)
  if (!m) return {}
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') }
}

function parseInstallLine(s) {
  if (!s) return null
  const m = /^dsh plugin --profile (\S+) (add|remove|update)(?:\s+(\S+))?/.exec(String(s).trim())
  if (!m) return null
  return { profile: m[1], action: m[2], source: m[3] || '' }
}

function readRequestBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

function writeJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

function isSafeProfile(p) {
  return typeof p === 'string' && /^[A-Za-z0-9_-]+$/.test(p)
}

// ------------------------------------------------------------------ config

function loadConfig() {
  try { return JSON.parse(readFileSync(configPath(), 'utf8')) || {} } catch { return {} }
}

function saveConfig(cfg) {
  try { writeFileSync(configPath(), JSON.stringify(cfg)) } catch {}
}

function githubToken() {
  return (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim() || (loadConfig().githubToken || '').trim()
}

// ---------------------------------------------------------------- catalog

async function fetchText(url, timeout = 12000) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeout) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.text()
}

/**
 * Load the catalog live from the repo's data/plugins.json over the mirror
 * chain. No offline snapshot: if the network is unreachable this throws and
 * the UI shows a fetch error instead of stale data. Returns
 * { data, source: 'repo' }.
 */
async function loadCatalog() {
  if (catalogMirror && Date.now() - catalogMirror.at < CATALOG_TTL) return catalogMirror
  const [owner, repo] = CATALOG_REPO.split('/')
  let lastErr = null
  for (const mirror of RAW_MIRRORS) {
    try {
      const text = await fetchText(mirror(owner, repo, CATALOG_FILE), 12000)
      const data = JSON.parse(text)
      catalogMirror = { at: Date.now(), data, source: 'repo' }
      return catalogMirror
    } catch (e) { lastErr = e }
  }
  throw new Error('目录获取失败（网络不可用）: ' + String((lastErr && lastErr.message) || lastErr))
}

// -------------------------------------------------------- dsh CLI location

function classifyBin(bin) {
  const b = String(bin).toLowerCase()
  if (b.endsWith('.js')) return 'js'
  if (b.endsWith('.cmd') || b.endsWith('.bat')) return 'cmd'
  if (b.endsWith('.ps1')) return 'ps1'
  if (b.endsWith('.exe')) return 'exe'
  return 'js'
}

function locateDshCli() {
  const envBin = (process.env.DSH_BIN || '').trim()
  if (envBin) return { bin: envBin, kind: classifyBin(envBin) }
  // 1) The healed profiles/node_modules junction mirrors the deployment's
  //    @deepseek-ai/dsh package (recreated on every boot).
  try {
    const pkgDir = join(homeDir(), 'profiles', 'node_modules', '@deepseek-ai', 'dsh')
    const pkg = join(pkgDir, 'package.json')
    if (existsSync(pkg)) {
      const j = JSON.parse(readFileSync(pkg, 'utf8'))
      const b = (typeof j.bin === 'string' ? j.bin : (j.bin && j.bin.dsh)) || 'lib/bin.js'
      const cand = join(pkgDir, b)
      if (existsSync(cand)) return { bin: cand, kind: 'js' }
    }
  } catch {}
  // 2) PATH (npx shims: dsh.ps1 / dsh.cmd)
  try {
    const which = process.platform === 'win32' ? 'where' : 'which'
    const out = spawnSync(which, ['dsh'], { encoding: 'utf8' })
    if (out.status === 0 && out.stdout) {
      const first = String(out.stdout).split(/\r?\n/)[0].trim()
      if (first) return { bin: first, kind: classifyBin(first) }
    }
  } catch {}
  return null
}

// ---------------------------------------------------------- live repo stats
// Everything here is in-memory only — nothing is written to disk, and stats
// are always re-fetched from the network when stale (LIVE_TTL). Offline means
// empty stats, never stale data.

const LIVE_TTL = 3 * 60 * 1000

/** GitHub API single-repo stats; rate-limit and 404 come back as flags. */
async function fetchRepoStats(owner, repo) {
  const token = githubToken()
  const headers = { 'User-Agent': 'dsh-plugin-market/0.1', 'Accept': 'application/vnd.github+json' }
  if (token) headers.Authorization = 'Bearer ' + token
  try {
    const r = await fetch(`${API_BASE}/repos/${owner}/${repo}`, { headers, signal: AbortSignal.timeout(15000) })
    if (r.status === 403 || r.status === 429) {
      const reset = Number(r.headers.get('x-ratelimit-reset') || 0)
      return { limited: true, resetAt: reset ? reset * 1000 : Date.now() + 3600000 }
    }
    if (r.status === 404) return { missing: true }
    if (!r.ok) return { error: true }
    const j = await r.json()
    return {
      ok: true,
      meta: {
        stars: typeof j.stargazers_count === 'number' ? j.stargazers_count : null,
        pushedAt: typeof j.pushed_at === 'string' ? j.pushed_at : null,
        archived: !!j.archived,
        defaultBranch: typeof j.default_branch === 'string' ? j.default_branch : null,
        src: 'github',
        fetchedAt: Date.now(),
      },
    }
  } catch { return { error: true } }
}

function parseBadgeCount(text) {
  const t = String(text || '')
  const title = /<title>([^<]*)<\/title>/.exec(t)
  const raw = title ? title[1] : (/\b(\d[\d.,]*(?:k|K|m|M)?)\b/.exec(t) || [])[1] || ''
  const n = String(raw).replace(/[^\d.,kmM]/g, '').replace(/,/g, '')
  const m = /^([\d.]+)([km])?$/.exec(n)
  if (!m) return null
  const base = parseFloat(m[1])
  if (Number.isNaN(base)) return null
  return m[2] === 'k' || m[2] === 'K' ? Math.round(base * 1000) : (m[2] === 'm' || m[2] === 'M' ? Math.round(base * 1000000) : Math.round(base))
}

/** Approximate an epoch from shields.io relative-date text ("2 days ago", "on Jan 5, 2026", ...). */
function parseBadgeDate(text) {
  const s = String(text || '').toLowerCase().trim()
  if (!s) return null
  const now = Date.now()
  let m
  if (/^(today|now)$/.test(s)) return now
  if (s === 'yesterday') return now - 86400000
  if ((m = /^(\d+)\s*days?\s*ago$/.exec(s))) return now - Number(m[1]) * 86400000
  if (s === 'last week') return now - 7 * 86400000
  if ((m = /^(\d+)\s*weeks?\s*ago$/.exec(s))) return now - Number(m[1]) * 7 * 86400000
  if (s === 'last month') return now - 30 * 86400000
  if ((m = /^(\d+)\s*months?\s*ago$/.exec(s))) return now - Number(m[1]) * 30 * 86400000
  if ((m = /^(\d+)\s*years?\s*ago$/.exec(s))) return now - Number(m[1]) * 365 * 86400000
  const t = Date.parse(s.replace(/^on\s+/, ''))
  if (!Number.isNaN(t)) return t
  return null
}

async function fetchTextOrBlank(url) {
  try { return await fetchText(url, 12000) } catch { return '' }
}

/** shields.io badge fallback (stars + last commit), no GitHub quota used. */
async function fetchBadgeStats(owner, repo) {
  try {
    const [starsTxt, commitTxt] = await Promise.all([
      fetchTextOrBlank(`https://img.shields.io/github/stars/${owner}/${repo}.svg`),
      fetchTextOrBlank(`https://img.shields.io/github/last-commit/${owner}/${repo}.svg`),
    ])
    const stars = parseBadgeCount(starsTxt)
    const epoch = parseBadgeDate(commitTxt)
    if (stars === null && epoch === null) return null
    return {
      ok: true,
      meta: {
        stars,
        pushedAt: epoch ? new Date(epoch).toISOString() : null,
        pushedRaw: String(commitTxt || '').trim() || null,
        archived: false,
        defaultBranch: null,
        src: 'shields',
        fetchedAt: Date.now(),
      },
    }
  } catch { return null }
}

/** One repo's stats: GitHub API first, shields.io when rate-limited or failing. */
async function fetchRepoMeta(owner, repo) {
  const hasToken = !!githubToken()
  if (Date.now() >= ghLimitedUntil || hasToken) {
    const res = await fetchRepoStats(owner, repo)
    if (res.limited) ghLimitedUntil = res.resetAt
    if (res.ok || res.missing) return res
  }
  return fetchBadgeStats(owner, repo)
}

/** Background stats backfill: walk the catalog, fetch stale/missing entries live. */
async function backfillStats(repos) {
  try {
    const start = Date.now()
    const budget = 100000
    for (const { owner, repo } of repos) {
      if (Date.now() - start > budget) break
      const key = `${owner}/${repo}`
      const existing = liveStats.get(key)
      const stale = !existing || Date.now() - existing.at >= LIVE_TTL
      // shields' last-commit badge is unreliable: retry entries that only have
      // shields data (no push date) whenever the API is available.
      const shieldsMissingPush = !!(existing && existing.meta.src === 'shields' && !existing.meta.pushedAt)
      if (!stale && !shieldsMissingPush) continue
      const res = await fetchRepoMeta(owner, repo)
      if (res && res.ok) liveStats.set(key, { meta: res.meta, at: Date.now() })
      else if (res && res.missing) liveStats.set(key, { meta: { missing: true }, at: Date.now() })
      await delay(250)
    }
  } finally {
    statsRefreshing = null
  }
}

function kickoffBackfill(catalog) {
  if (statsRefreshing) return
  const repos = (catalog.plugins || [])
    .map((p) => repoOf(p.url))
    .filter((r) => r.owner)
  // Drop leftover stats for repos no longer in the catalog (keeps memory tidy).
  const known = new Set(repos.map(({ owner, repo }) => `${owner}/${repo}`))
  for (const key of [...liveStats.keys()]) if (!known.has(key)) liveStats.delete(key)
  const pending = repos.filter(({ owner, repo }) => {
    const e = liveStats.get(`${owner}/${repo}`)
    // Stale entries, and shields-only entries missing a push date (the API —
    // especially with a token — fills pushedAt properly), are worth re-fetching.
    return !e || Date.now() - e.at >= LIVE_TTL || (e.meta.src === 'shields' && !e.meta.pushedAt)
  })
  if (pending.length === 0) return
  statsRefreshing = true
  backfillStats(pending)
}

/** Merge catalog + live stats into the client payload. */
function assembleCatalog(catalog, lang, catalogSource) {
  const plugins = (catalog.plugins || []).map((p) => {
    const { owner, repo } = repoOf(p.url)
    const key = owner ? `${owner}/${repo}` : ''
    const entry = key ? liveStats.get(key) : undefined
    const m = entry && entry.meta ? entry.meta : null
    const valid = !!(m && !m.missing)
    const line = parseInstallLine(p.install)
    const desc = p.description && typeof p.description === 'object'
      ? (p.description[lang] || p.description.en || '')
      : String(p.description || '')
    return {
      ...p,
      owner,
      repo,
      desc,
      profile: line ? line.profile : 'web',
      source: line && line.action === 'add' ? line.source : null,
      stars: valid && m.stars != null ? m.stars : null,
      pushedAt: valid && m.pushedAt != null ? m.pushedAt : null,
      pushedRaw: valid && m.pushedRaw != null ? m.pushedRaw : null,
      archived: valid ? !!m.archived : false,
      defaultBranch: valid && m.defaultBranch != null ? m.defaultBranch : null,
      metaSrc: valid && m.src != null ? m.src : null,
      enriched: valid && (m.stars != null || m.pushedAt != null),
    }
  })
  const done = plugins.filter((p) => p.enriched).length
  return {
    ok: true,
    updated: catalog.updated || null,
    count: catalog.count != null ? catalog.count : plugins.length,
    categories: catalog.categories || {},
    source: catalogSource,
    plugins,
    enriched: {
      done,
      total: plugins.length,
      running: !!statsRefreshing,
    },
    env: environmentInfo(),
  }
}

// ------------------------------------------------------------- version info

function parseInstalledVersion(spec) {
  const s = String(spec || '').trim()
  if (!s) return null
  if (/^(github:|git\+|link:|file:|workspace:|http|\.)/i.test(s)) return null
  const m = /^[^\d]*(\d+(?:\.\d+){1,2}(?:[-+][0-9A-Za-z.-]+)?)/.exec(s)
  return m ? m[1] : null
}

function depFingerprint(depKey, spec) {
  const s = String(spec || '')
  const g = /^github:([^/]+)\/([^/#]+)/.exec(s)
  if (g) return `${g[1]}/${g[2]}`
  return String(depKey).split('/').pop()
}

function newerThan(a, b) {
  const pa = String(a).split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y
  }
  return false
}

/** Dependency maps of every profile the catalog references. */
function loadProfiles(profiles) {
  const out = {}
  for (const p of profiles) {
    const f = profilePath(p) + '/package.json'
    if (!existsSync(f)) { out[p] = { dependencies: {}, bundles: [] }; continue }
    try {
      const j = JSON.parse(readFileSync(f, 'utf8'))
      out[p] = {
        dependencies: j.dependencies || {},
        bundles: (j.dsh && j.dsh.profile && j.dsh.profile.bundles) || [],
      }
    } catch { out[p] = { dependencies: {}, bundles: [] } }
  }
  return out
}

/** Index installed deps by repo key (git deps) and by package basename. */
function indexInstalled(states) {
  const byRepo = new Map()
  const byName = new Map()
  for (const [profile, state] of Object.entries(states)) {
    for (const [depKey, spec] of Object.entries(state.dependencies || {})) {
      const entry = { depKey, spec, version: parseInstalledVersion(spec), profile }
      const fp = depFingerprint(depKey, spec)
      if (fp.includes('/')) byRepo.set(fp, entry)
      else byName.set(fp, entry)
    }
  }
  return { byRepo, byName }
}

/** Latest available version: npm registry for npm-published plugins, else the
 *  repo's package.json. In-memory TTL only — always re-fetched when stale. */
async function queryLatestVersion(plugin) {
  const key = `${plugin.owner}/${plugin.repo}`
  const ttl = plugin.npm ? VERSION_TTL_NPM : VERSION_TTL_RAW
  const v = liveVersions.get(key)
  if (v && Date.now() - v.at < ttl) return v.version
  let version = null
  if (plugin.npm) {
    try {
      const r = await fetch(`https://registry.npmjs.org/${encodeURIComponent(String(plugin.npm).replace(/^\//, ''))}/latest`, { redirect: 'follow', signal: AbortSignal.timeout(8000) })
      if (r.ok) {
        const j = await r.json()
        version = (j && j.version) || null
      }
    } catch {}
  }
  if (version === null) {
    for (const mirror of RAW_MIRRORS) {
      try {
        const j = JSON.parse(await fetchText(mirror(plugin.owner, plugin.repo, 'package.json'), 8000))
        version = (j && j.version) || null
        if (version !== null) break
      } catch {}
    }
  }
  liveVersions.set(key, { version, at: Date.now() })
  return version
}

/**
 * Annotate every catalog plugin with its installed-state: none | installed |
 * update. Only actually-installed plugins trigger version lookups (cheap,
 * cached). Git-source installs have no recorded version, so update detection
 * for them uses a baseline captured on first observation; a higher repo
 * version afterwards flips the card to 更新 (the baseline advances after a
 * successful update).
 */
async function annotateInstalled(plugins) {
  const profiles = [...new Set(plugins.map((p) => p.profile || 'web').concat('web'))]
  const index = indexInstalled(loadProfiles(profiles))
  const out = []
  for (const p of plugins) {
    let entry = null
    if (p.owner && p.repo) entry = index.byRepo.get(`${p.owner}/${p.repo}`)
    if (!entry && p.repo) entry = index.byName.get(p.repo)
    if (!entry && p.name) entry = index.byName.get(p.name)
    if (!entry) { out.push({ ...p, inst: { state: 'none' } }); continue }
    const key = `${p.owner}/${p.repo}`
    const latest = await queryLatestVersion(p)
    let updatable = !!(entry.version && latest && newerThan(latest, entry.version))
    let shownVersion = entry.version
    if (!entry.version && latest) {
      const b = liveBaselines.get(key)
      if (!b || !b.version) {
        liveBaselines.set(key, { version: latest })
      } else if (newerThan(latest, b.version)) {
        updatable = true
        shownVersion = b.version
      }
    }
    out.push({
      ...p,
      inst: {
        state: updatable ? 'update' : 'installed',
        version: shownVersion,
        latest,
        depKey: entry.depKey,
        profile: entry.profile,
      },
    })
  }
  return out
}

/** After a successful update of a git-source dep, advance its baseline so the button settles. */
function advanceBaseline(profile, depKey) {
  try {
    const f = profilePath(profile) + '/package.json'
    const deps = (JSON.parse(readFileSync(f, 'utf8')).dependencies) || {}
    const spec = deps[depKey]
    if (spec === undefined) return
    const fp = depFingerprint(depKey, spec)
    if (!fp.includes('/')) return
    const latest = liveVersions.get(fp)
    if (latest && latest.version) liveBaselines.set(fp, { version: latest.version })
  } catch {}
}

function environmentInfo() {
  const explicit = (process.env.DSH_BIN || '').trim()
  const resolved = locateDshCli()
  return {
    dshHome: homeDir(),
    node: process.execPath || null,
    dshBin: (resolved && resolved.bin) || null,
    binKind: (resolved && resolved.kind) || null,
    binProvided: explicit || null,
    binValid: explicit ? existsSync(explicit) : null,
    githubToken: !!githubToken(),
    ghLimited: Date.now() < ghLimitedUntil,
  }
}

// ------------------------------------------------------------- task runner

function taskView() {
  if (!liveTask) return null
  const { id, kind, profile, target, label, startedAt, status, output, exitCode, bin } = liveTask
  return {
    id, kind, profile, target, label, startedAt,
    status, output: String(output || '').slice(-20000), exitCode,
    elapsedMs: Date.now() - startedAt,
    timeoutMs: TASK_TIMEOUT,
    bin: bin || null,
  }
}

/** Kill a spawned child, taking its whole process tree on Windows. */
function terminateTree(child) {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill()
    }
  } catch {}
}

function spawnChild(binInfo, args, cwd) {
  const common = { cwd, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] }
  if (binInfo.kind === 'cmd') return spawn(binInfo.bin, args, { ...common, shell: true })
  if (binInfo.kind === 'ps1') return spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', binInfo.bin, ...args], common)
  if (binInfo.kind === 'exe') return spawn(binInfo.bin, args, common)
  return spawn(process.execPath, [binInfo.bin, ...args], common)
}

const MAX_LOG = 200000

function appendLog(task, text) {
  task.output = (task.output + String(text)).slice(-MAX_LOG)
}

function finishTask(task, status, exitCode) {
  clearTimeout(task.timer)
  task.status = status
  if (exitCode !== undefined) task.exitCode = exitCode
}

function workspaceArgs() {
  return ['-w']
}

/** Pin the standard peer packages to the profile's own installed versions. */
function peerPins(profile) {
  const p = profilePath(profile) + '/package.json'
  if (!existsSync(p)) return []
  try {
    const deps = (JSON.parse(readFileSync(p, 'utf8')).dependencies) || {}
    const out = []
    for (const key of PEER_KEYS) {
      if (typeof deps[key] === 'string' && deps[key]) out.push(`${key}@${deps[key]}`)
    }
    return out
  } catch { return [] }
}

function pnpmVerb(kind) {
  return kind === 'install' ? 'add' : (kind === 'update' ? 'update' : 'remove')
}

/** Start one install/update/uninstall as a background task. */
function launchTask(kind, profile, target, label, explicitBin) {
  const binInfo = (explicitBin && explicitBin.trim()) ? { bin: explicitBin.trim(), kind: classifyBin(explicitBin.trim()) } : locateDshCli()
  if (!binInfo) return { ok: false, error: 'dsh CLI 未定位（可在面板填写路径）' }
  const task = {
    id: 'op-' + (++taskCounter),
    kind, profile, target, label,
    startedAt: Date.now(),
    status: 'running',
    output: '',
    exitCode: null,
    bin: binInfo.bin,
  }
  const args = ['plugin', '--profile', profile, pnpmVerb(kind), target]
  args.push(...workspaceArgs())
  if (kind === 'install') args.push(...peerPins(profile))
  const child = spawnChild(binInfo, args, profilePath(profile))
  task.child = child
  child.stdout.on('data', (d) => { appendLog(task, d.toString()) })
  child.stderr.on('data', (d) => { appendLog(task, d.toString()) })
  child.on('error', (err) => {
    if (task.status !== 'running') return
    appendLog(task, '\n[error] ' + String((err && err.message) || err))
    finishTask(task, 'failed')
  })
  child.on('close', (code) => {
    if (task.status !== 'running') return
    finishTask(task, code === 0 ? 'done' : 'failed', code)
    if (code === 0 && kind === 'update') advanceBaseline(profile, target)
    if (code !== 0 && kind === 'install') {
      appendLog(task, '\n\n提示：若上面是 peer 依赖 404（ERR_PNPM_FETCH_404 / dsh-compact），是 npm 的 latest tag 指向了损坏版本；'
        + '可手动钉版本重试：dsh plugin --profile ' + profile + ' add ' + target + ' ' + peerPins(profile).join(' '))
    }
  })
  task.timer = setTimeout(() => {
    if (task.status !== 'running') return
    appendLog(task, '\n\n[timeout] 操作超过 ' + Math.round(TASK_TIMEOUT / 1000) + ' 秒未完成，已自动终止（可能是网络不通或 pnpm 卡住，可重试）')
    finishTask(task, 'timeout')
    terminateTree(child)
  }, TASK_TIMEOUT)
  liveTask = task
  return { ok: true, opId: task.id }
}

/** Abort the live task (used by the panel's kill button). */
function cancelTask() {
  const task = liveTask
  if (!task || task.status !== 'running') return { ok: false, error: '没有正在运行的任务' }
  appendLog(task, '\n\n[killed] 已由用户终止')
  finishTask(task, 'killed')
  terminateTree(task.child)
  return { ok: true }
}

/** Run one child to completion without the live-task streaming (auto-update path). */
async function runProcess(binInfo, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawnChild(binInfo, args, cwd)
    let out = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { out += d.toString() })
    const timer = setTimeout(() => { terminateTree(child) }, timeoutMs || TASK_TIMEOUT)
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: 1, output: out + '\n' + String((err && err.message) || err) }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code === null ? 1 : code, output: out }) })
  })
}

/** Boot-time auto-update: if enabled, update installed plugins with newer
 *  versions sequentially, then record the outcome so the UI can show a
 *  "restart to apply" notice on the next page load. */
async function runBootUpdater() {
  try {
    const catalog = await loadCatalog()
    const base = assembleCatalog(catalog.data, 'zh', catalog.source)
    base.plugins = await annotateInstalled(base.plugins)
    const pending = base.plugins.filter((p) => p.inst && p.inst.state === 'update' && p.inst.depKey)
    const updated = []
    for (const p of pending) {
      while (liveTask && liveTask.status === 'running') await delay(2000)
      const binInfo = locateDshCli()
      if (!binInfo) break
      const res = await runProcess(binInfo, ['plugin', '--profile', p.inst.profile, 'update', p.inst.depKey, ...workspaceArgs()], profilePath(p.inst.profile), TASK_TIMEOUT)
      if (res.code === 0) {
        advanceBaseline(p.inst.profile, p.inst.depKey)
        updated.push(p.name)
      }
    }
    if (updated.length > 0) {
      const cfg = loadConfig()
      cfg.lastAutoUpdate = { at: Date.now(), updated }
      saveConfig(cfg)
    }
  } catch (e) {
    console.error('[dsh-plugin-market] boot auto-update failed:', String((e && e.message) || e))
  }
}

/** Once per process: if auto-update is enabled, kick the boot check. */
function scheduleBootUpdater() {
  if (bootCheckDone) return
  bootCheckDone = true
  if (!loadConfig().autoUpdate) return
  setTimeout(runBootUpdater, 15000)
}

// ------------------------------------------------------------- source check

/**
 * Assess a github: source before installing into the web profile. A bundle
 * without a web client half that also depends on agent-core packages is a
 * full application for another profile; mounting it under web duplicates the
 * built-in api-gateway and breaks boot, so it is refused.
 */
async function assessSource(source) {
  const spec = String(source || '')
  const m = /^github:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(spec)
  if (!m) return { known: false }
  const [, owner, repo] = m
  let pkg
  for (const base of RAW_MIRRORS) {
    try {
      const r = await fetch(`${base(owner, repo, 'package.json')}`, { redirect: 'follow', signal: AbortSignal.timeout(10000) })
      if (!r.ok) continue
      pkg = await r.json()
      break
    } catch {}
  }
  if (pkg === undefined || typeof pkg !== 'object') return { known: false, fetchFailed: true }
  const dsh = pkg.dsh && typeof pkg.dsh === 'object' ? pkg.dsh : {}
  const client = dsh.client
  const isWebClient = client !== undefined && client.platform === 'web'
  if (dsh.bundle && !isWebClient) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.peerDependencies || {}) }
    const hits = APP_CORE_DEPS.filter((k) => deps[k] !== undefined)
    if (hits.length > 0) return { known: true, appLike: true, hits }
  }
  return { known: true, appLike: false }
}

// ------------------------------------------------------------------- route

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    console.error('[dsh-plugin-market] webServer service unavailable at apply; route not registered')
    return
  }
  webServer.register({
    kind: 'exact',
    path: '/api/dsh-plugin-market',
    handler: async (req, res) => {
      try {
        const body = await readRequestBody(req)
        const method = String(body.method || '')
        if (method === 'list') {
          const lang = String(body.lang || '') === 'zh' ? 'zh' : (String(body.lang || '') === 'ja' ? 'ja' : 'en')
          let catalog
          try {
            catalog = await loadCatalog()
          } catch (e) {
            return writeJson(res, 502, { ok: false, error: '目录抓取失败：' + String((e && e.message) || e) })
          }
          kickoffBackfill(catalog.data)
          const base = assembleCatalog(catalog.data, lang, catalog.source)
          base.plugins = await annotateInstalled(base.plugins)
          const cfg = loadConfig()
          const tok = githubToken()
          base.config = { tokenSet: !!tok, tokenTail: tok ? tok.slice(-4) : null, autoUpdate: !!cfg.autoUpdate }
          base.lastAutoUpdate = cfg.lastAutoUpdate || null
          return writeJson(res, 200, base)
        }
        if (method === 'notice') {
          const cfg = loadConfig()
          return writeJson(res, 200, { ok: true, lastAutoUpdate: cfg.lastAutoUpdate || null })
        }
        if (method === 'config') {
          const cfg = loadConfig()
          const tokenInput = body.githubToken === undefined ? undefined : String(body.githubToken || '')
          // Only a non-empty input updates the token — saving an empty box
          // must never wipe a stored one; clearing is explicit via clearToken.
          if (tokenInput !== undefined && tokenInput !== '') cfg.githubToken = tokenInput
          if (body.clearToken === true) cfg.githubToken = ''
          if (body.autoUpdate !== undefined) cfg.autoUpdate = !!body.autoUpdate
          if (tokenInput !== undefined || body.clearToken !== undefined || body.autoUpdate !== undefined) saveConfig(cfg)
          const tok = githubToken()
          return writeJson(res, 200, {
            ok: true,
            tokenSet: !!tok,
            tokenTail: tok ? tok.slice(-4) : null,
            autoUpdate: !!cfg.autoUpdate,
          })
        }
        if (method === 'op') {
          const wanted = String(body.opId || '')
          const view = taskView()
          if (view === null) return writeJson(res, 200, { ok: true, op: null })
          if (wanted && view.id !== wanted) return writeJson(res, 200, { ok: true, op: null })
          return writeJson(res, 200, { ok: true, op: view })
        }
        if (method === 'kill') {
          return writeJson(res, 200, cancelTask())
        }
        if (method === 'install' || method === 'update' || method === 'uninstall') {
          const profile = isSafeProfile(body.profile) ? body.profile : 'web'
          const target = String(method === 'install' ? (body.source || '') : (body.pkg || '')).trim()
          if (!target) return writeJson(res, 400, { ok: false, output: '缺少参数' })
          if (liveTask && liveTask.status === 'running') {
            return writeJson(res, 200, { ok: false, busy: true, output: '已有任务进行中：' + liveTask.label })
          }
          if (method === 'install' && profile === 'web' && !body.skipCheck) {
            const check = await assessSource(target)
            if (check.fetchFailed) {
              return writeJson(res, 200, {
                ok: false,
                refused: true,
                output: '无法访问 GitHub 验证插件类型（网络问题），已中止以防破坏 web 启动。请检查网络后重试，'
                  + '或勾选"跳过类型检查"继续安装（风险自负）。',
              })
            }
            if (check.appLike) {
              return writeJson(res, 200, {
                ok: false,
                refused: true,
                output: '该插件是面向其他 profile 的完整应用（非 web 插件），装进 web profile 会与内置应用冲突导致启动失败'
                  + '（重复 api-gateway）。如需使用请安装到对应 profile，例如：dsh plugin --profile tui add ' + target
                  + '（以插件仓库 README 为准）。',
              })
            }
          }
          const label = String(body.label || target)
          const started = launchTask(method, profile, target, label, String(body.binPath || '').trim())
          if (!started.ok) return writeJson(res, 200, started)
          return writeJson(res, 200, { ok: true, opId: started.opId, timeoutMs: TASK_TIMEOUT })
        }
        return writeJson(res, 404, { ok: false, error: 'unknown method ' + method })
      } catch (e) {
        return writeJson(res, 500, { ok: false, error: String((e && e.message) || e) })
      }
    },
  })
  scheduleBootUpdater()
}
