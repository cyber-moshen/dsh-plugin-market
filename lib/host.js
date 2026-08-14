// Host half of dsh-plugin-market — an open-source plugin market for the DSH
// web GUI, driven by the catalog JSON living in THIS repo (data/plugins.json).
//
// One HTTP route (/api/dsh-plugin-market) backs the browser card-grid UI:
//   list      — catalog fetched from this repo's data/plugins.json (via a raw
//               mirror chain), merged with GitHub enrichment (stars, last push,
//               archived, default branch) served from a disk cache while a
//               background fill loop tops it up (GitHub API first, shields.io
//               badges as rate-limit fallback; both cached 24h). If the repo is
//               unreachable, the bundled data/plugins.json snapshot is used.
//   installed / install / uninstall / op / kill — background-op install model:
//               every pnpm call passes -w (profiles are pnpm workspace roots),
//               and installs pin the standard peer packages to the versions
//               already present in the profile (several @deepseek-ai peers
//               carry a broken `latest` dist-tag on npmjs — 0.0.1-rc.1 depends
//               on unpublished @deepseek-ai/dsh-compact).
//   probe     — environment info incl. robust dsh CLI location (DSH_BIN env →
//               the healed $DSH_HOME/profiles/node_modules junction → PATH).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-plugin-market'

/** Hard dependency: the HTTP carrier must exist before the route registers. */
export const inject = ['webServer']

// ------------------------------------------------------------------ catalog
// The catalog lives in this repo. Point CATALOG_REPO at your own fork to use a
// different curated list; data/plugins.json in this package is the snapshot
// fallback when the repo is unreachable.
const CATALOG_REPO = 'cyber-moshen/dsh-plugin-market'
const CATALOG_FILE = 'data/plugins.json'

const DEFAULT_TIMEOUT = 180000
const CATALOG_TTL = 10 * 60 * 1000
const CACHE_TTL = 24 * 60 * 60 * 1000
const GH_API = 'https://api.github.com'
/** Raw mirrors (builders receive owner/repo/file): ghproxy-style proxies are
 *  fastest and most reliable behind CN networks (verified), raw.githubusercontent
 *  is flaky there; raw.gitmirror.com is dead. Order = preference. */
const RAW_MIRRORS = [
  (o, r, f) => `https://ghproxy.net/https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
  (o, r, f) => `https://gh-proxy.com/https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
  (o, r, f) => `https://ghfast.top/https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
  (o, r, f) => `https://raw.githubusercontent.com/${o}/${r}/HEAD/${f}`,
  (o, r, f) => `https://github.com/${o}/${r}/raw/HEAD/${f}`,
]
/** Peer packages every web-profile bundle may declare; installs pin these to the profile's own versions. */
const PEER_KEYS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-slots',
  'react',
]
/** Peer/dependency names only a full agent-profile app carries. */
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

/** The single live background op (one at a time keeps pnpm's store serial). */
let activeOp = null
let opCounter = 0
/** In-memory catalog mirror with TTL. */
let catalogCache = null
/** Enrichment cache: { repos: { 'owner/repo': meta }, ghLimitedUntil } */
let metaCache = null
/** Background fill loop handle. */
let filling = null

function dshHome() {
  return process.env.DSH_HOME || (homedir() + '/.dsh')
}

function cacheFile() {
  return join(dshHome(), '.dsh-market-card-cache.json')
}

function profileDir(profile) {
  return dshHome().replace(/[\\/]+$/, '') + '/profiles/' + profile
}

/** Path of the bundled catalog snapshot (this package's data/plugins.json). */
function snapshotFile() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'plugins.json')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function repoOf(url) {
  const u = String(url || '')
  const m = /github\.com\/([^/]+)\/([^/?#]+)/.exec(u)
  if (!m) return {}
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') }
}

function parseInstallCmd(s) {
  if (!s) return null
  const m = /^dsh plugin --profile (\S+) (add|remove)(?:\s+(\S+))?/.exec(String(s).trim())
  if (!m) return null
  return { profile: m[1], action: m[2], source: m[3] || '' }
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

function validProfile(p) {
  return typeof p === 'string' && /^[A-Za-z0-9_-]+$/.test(p)
}

// ---------------------------------------------------------------- catalog

async function fetchText(url, timeout = 12000) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeout) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.text()
}

/**
 * Load the catalog: this repo's data/plugins.json over the mirror chain, else
 * the bundled snapshot. Returns { data, source } where source is 'repo' or
 * 'snapshot'.
 */
async function getCatalog() {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL) return catalogCache
  const [owner, repo] = CATALOG_REPO.split('/')
  let lastErr = null
  for (const mirror of RAW_MIRRORS) {
    try {
      const text = await fetchText(mirror(owner, repo, CATALOG_FILE), 12000)
      const data = JSON.parse(text)
      const cached = { at: Date.now(), data, source: 'repo' }
      catalogCache = cached
      return cached
    } catch (e) { lastErr = e }
  }
  try {
    const data = JSON.parse(readFileSync(snapshotFile(), 'utf8'))
    const cached = { at: Date.now(), data, source: 'snapshot' }
    catalogCache = cached
    return cached
  } catch (e) {
    throw new Error('catalog unavailable (mirrors: ' + String((lastErr && lastErr.message) || lastErr) + '; snapshot: ' + String((e && e.message) || e) + ')')
  }
}

// -------------------------------------------------------- dsh CLI location

function kindOfBin(bin) {
  const b = String(bin).toLowerCase()
  if (b.endsWith('.js')) return 'js'
  if (b.endsWith('.cmd') || b.endsWith('.bat')) return 'cmd'
  if (b.endsWith('.ps1')) return 'ps1'
  if (b.endsWith('.exe')) return 'exe'
  return 'js'
}

function resolveDshBin() {
  const envBin = (process.env.DSH_BIN || '').trim()
  if (envBin) return { bin: envBin, kind: kindOfBin(envBin) }
  // 1) The healed profiles/node_modules junction mirrors the deployment's
  //    @deepseek-ai/dsh package (created by the profile boot on every start).
  try {
    const pkgDir = join(dshHome(), 'profiles', 'node_modules', '@deepseek-ai', 'dsh')
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
      if (first) return { bin: first, kind: kindOfBin(first) }
    }
  } catch {}
  return null
}

// -------------------------------------------------------- enrichment cache

function loadMeta() {
  if (metaCache) return metaCache
  try {
    metaCache = JSON.parse(readFileSync(cacheFile(), 'utf8'))
    if (!metaCache || typeof metaCache.repos !== 'object') metaCache = { repos: {}, ghLimitedUntil: null }
  } catch {
    metaCache = { repos: {}, ghLimitedUntil: null }
  }
  return metaCache
}

function saveMeta() {
  try { writeFileSync(cacheFile(), JSON.stringify(loadMeta())) } catch {}
}

/** GitHub API single-repo metadata. Rate-limit and 404 come back as flags. */
async function apiRepoMeta(owner, repo) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
  const headers = { 'User-Agent': 'dsh-plugin-market/0.1', 'Accept': 'application/vnd.github+json' }
  if (token) headers.Authorization = 'Bearer ' + token
  try {
    const r = await fetch(`${GH_API}/repos/${owner}/${repo}`, { headers, signal: AbortSignal.timeout(15000) })
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

function parseShieldsStars(text) {
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
function shieldsDateToEpoch(text) {
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

async function fetchTextOrEmpty(url) {
  try { return await fetchText(url, 12000) } catch { return '' }
}

/** shields.io badge fallback for stars + last commit (cached by shields, no GitHub quota). */
async function shieldsRepoMeta(owner, repo) {
  try {
    const [starsTxt, commitTxt] = await Promise.all([
      fetchTextOrEmpty(`https://img.shields.io/github/stars/${owner}/${repo}.svg`),
      fetchTextOrEmpty(`https://img.shields.io/github/last-commit/${owner}/${repo}.svg`),
    ])
    const stars = parseShieldsStars(starsTxt)
    const epoch = shieldsDateToEpoch(commitTxt)
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

/** One repo's metadata: GitHub API first, shields.io when rate-limited or failing. */
async function fetchRepoMeta(owner, repo) {
  const meta = loadMeta()
  const ghLimited = !!meta.ghLimitedUntil && Date.now() < meta.ghLimitedUntil
  const hasToken = !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN)
  if (!ghLimited || hasToken) {
    const res = await apiRepoMeta(owner, repo)
    if (res.limited) {
      meta.ghLimitedUntil = res.resetAt
      saveMeta()
    }
    if (res.ok || res.missing) return res
    // transient error → try shields below
  }
  return shieldsRepoMeta(owner, repo)
}

/** Background fill loop: iterate the catalog, top up stale entries, persist. */
async function runFill(repos) {
  const meta = loadMeta()
  const start = Date.now()
  const budget = 100000
  let done = 0
  for (const { owner, repo } of repos) {
    if (Date.now() - start > budget) break
    const key = `${owner}/${repo}`
    const existing = meta.repos[key]
    if (existing && Date.now() - (existing.fetchedAt || 0) < CACHE_TTL) continue
    const res = await fetchRepoMeta(owner, repo)
    if (res && res.ok) meta.repos[key] = res.meta
    else if (res && res.missing) meta.repos[key] = { missing: true, fetchedAt: Date.now() }
    done++
    if (done % 8 === 0) saveMeta()
    await sleep(250)
  }
  saveMeta()
}

function ensureFill(catalog) {
  if (filling) return
  const meta = loadMeta()
  const repos = (catalog.plugins || [])
    .map((p) => repoOf(p.url))
    .filter((r) => r.owner)
  const pending = repos.filter(({ owner, repo }) => {
    const e = meta.repos[`${owner}/${repo}`]
    return !e || Date.now() - (e.fetchedAt || 0) >= CACHE_TTL
  })
  if (pending.length === 0) return
  filling = { active: true }
  const done = (v) => { filling = null; return v }
  runFill(pending).then(done, done)
}

/** Merge catalog + enrichment into the client payload. */
function enrichList(catalog, lang, catalogSource) {
  const meta = loadMeta()
  const plugins = (catalog.plugins || []).map((p) => {
    const { owner, repo } = repoOf(p.url)
    const key = owner ? `${owner}/${repo}` : ''
    const m = key ? meta.repos[key] : null
    const valid = !!(m && !m.missing)
    const cmd = parseInstallCmd(p.install)
    const desc = p.description && typeof p.description === 'object'
      ? (p.description[lang] || p.description.en || '')
      : String(p.description || '')
    return {
      ...p,
      owner,
      repo,
      desc,
      profile: cmd ? cmd.profile : 'web',
      source: cmd && cmd.action === 'add' ? cmd.source : null,
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
      running: !!(filling && filling.active),
    },
    env: envInfo(),
  }
}

function envInfo() {
  const explicit = (process.env.DSH_BIN || '').trim()
  const resolved = resolveDshBin()
  const meta = loadMeta()
  return {
    dshHome: dshHome(),
    node: process.execPath || null,
    dshBin: (resolved && resolved.bin) || null,
    binKind: (resolved && resolved.kind) || null,
    binProvided: explicit || null,
    binValid: explicit ? existsSync(explicit) : null,
    githubToken: !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    ghLimited: !!(meta.ghLimitedUntil && Date.now() < meta.ghLimitedUntil),
  }
}

// ------------------------------------------------------------- op machinery

function opSnapshot() {
  if (!activeOp) return null
  const { id, kind, profile, target, label, startedAt, status, output, exitCode, bin } = activeOp
  return {
    id, kind, profile, target, label, startedAt,
    status, output: String(output || '').slice(-20000), exitCode,
    elapsedMs: Date.now() - startedAt,
    timeoutMs: DEFAULT_TIMEOUT,
    bin: bin || null,
  }
}

/** Kill a running child, killing its whole process tree on Windows. */
function killChild(child) {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill()
    }
  } catch {}
}

const MAX_OUTPUT = 200000

function appendOutput(op, text) {
  op.output = (op.output + String(text)).slice(-MAX_OUTPUT)
}

function settleOp(op, status, exitCode) {
  clearTimeout(op.timer)
  op.status = status
  if (exitCode !== undefined) op.exitCode = exitCode
}

/** The profile is a pnpm workspace root (pnpm-workspace.yaml), so pnpm needs -w. */
function workspaceFlag() {
  return ['-w']
}

/** Pin the standard peer packages to the profile's own installed versions (they are already present after the base install). */
function peerPins(profile) {
  const p = profileDir(profile) + '/package.json'
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

/** Start one install/uninstall as a background op. Returns { ok, opId? } or { ok, error }. */
function startOp(kind, profile, target, label, explicitBin) {
  const binInfo = (explicitBin && explicitBin.trim()) ? { bin: explicitBin.trim(), kind: kindOfBin(explicitBin.trim()) } : resolveDshBin()
  if (!binInfo) return { ok: false, error: 'dsh CLI 未定位（可在面板填写路径）' }
  const op = {
    id: 'op-' + (++opCounter),
    kind, profile, target, label,
    startedAt: Date.now(),
    status: 'running',
    output: '',
    exitCode: null,
    bin: binInfo.bin,
  }
  const args = ['plugin', '--profile', profile, kind === 'install' ? 'add' : 'remove', target]
  args.push(...workspaceFlag())
  if (kind === 'install') args.push(...peerPins(profile))
  const cwd = profileDir(profile)
  const common = { cwd, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] }
  let child
  if (binInfo.kind === 'cmd') {
    child = spawn(binInfo.bin, args, { ...common, shell: true })
  } else if (binInfo.kind === 'ps1') {
    child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', binInfo.bin, ...args], common)
  } else if (binInfo.kind === 'exe') {
    child = spawn(binInfo.bin, args, common)
  } else {
    child = spawn(process.execPath, [binInfo.bin, ...args], common)
  }
  op.child = child
  child.stdout.on('data', (d) => { appendOutput(op, d.toString()) })
  child.stderr.on('data', (d) => { appendOutput(op, d.toString()) })
  child.on('error', (err) => {
    if (op.status !== 'running') return
    appendOutput(op, '\n[error] ' + String((err && err.message) || err))
    settleOp(op, 'failed')
  })
  child.on('close', (code) => {
    if (op.status !== 'running') return
    settleOp(op, code === 0 ? 'done' : 'failed', code)
    if (code !== 0 && kind === 'install') {
      appendOutput(op, '\n\n提示：若上面是 peer 依赖 404（ERR_PNPM_FETCH_404 / dsh-compact），是 npm 的 latest tag 指向了损坏版本；'
        + '可手动钉版本重试：dsh plugin --profile ' + profile + ' add ' + target + ' ' + peerPins(profile).join(' '))
    }
  })
  op.timer = setTimeout(() => {
    if (op.status !== 'running') return
    appendOutput(op, '\n\n[timeout] 操作超过 ' + Math.round(DEFAULT_TIMEOUT / 1000) + ' 秒未完成，已自动终止（可能是网络不通或 pnpm 卡住，可重试）')
    settleOp(op, 'timeout')
    killChild(child)
  }, DEFAULT_TIMEOUT)
  activeOp = op
  return { ok: true, opId: op.id }
}

/** Abort the live op (used by the panel's kill button). */
function killOp() {
  const op = activeOp
  if (!op || op.status !== 'running') return { ok: false, error: '没有正在运行的任务' }
  appendOutput(op, '\n\n[killed] 已由用户终止')
  settleOp(op, 'killed')
  killChild(op.child)
  return { ok: true }
}

/**
 * Classify a github: source before installing into the web profile. A bundle
 * without a web client half that also depends on agent-core packages is a
 * full application for another profile; mounting it under web duplicates the
 * built-in api-gateway and breaks boot, so it is refused.
 */
async function classifyPlugin(source) {
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
        const body = await readBody(req)
        const method = String(body.method || '')
        if (method === 'list') {
          const lang = String(body.lang || '') === 'zh' ? 'zh' : 'en'
          let catalog
          try {
            catalog = await getCatalog()
          } catch (e) {
            return sendJson(res, 502, { ok: false, error: '目录抓取失败：' + String((e && e.message) || e) })
          }
          ensureFill(catalog.data)
          return sendJson(res, 200, enrichList(catalog.data, lang, catalog.source))
        }
        if (method === 'probe') {
          const explicit = String(body.binPath || '').trim()
          let binValid = null
          if (explicit) {
            try { binValid = existsSync(explicit) } catch { binValid = false }
          }
          return sendJson(res, 200, { ok: true, ...envInfo(), binProvided: explicit || null, binValid })
        }
        if (method === 'installed') {
          const profile = validProfile(body.profile) ? body.profile : 'web'
          const p = profileDir(profile) + '/package.json'
          if (!existsSync(p)) return sendJson(res, 200, { ok: true, profile, bundles: [], dependencies: {} })
          const json = JSON.parse(readFileSync(p, 'utf8'))
          return sendJson(res, 200, {
            ok: true,
            profile,
            bundles: Array.isArray(json.dsh && json.dsh.profile && json.dsh.profile.bundles) ? json.dsh.profile.bundles : [],
            dependencies: json.dependencies || {},
          })
        }
        if (method === 'op') {
          const wanted = String(body.opId || '')
          const op = opSnapshot()
          if (op === null) return sendJson(res, 200, { ok: true, op: null })
          if (wanted && op.id !== wanted) return sendJson(res, 200, { ok: true, op: null })
          return sendJson(res, 200, { ok: true, op })
        }
        if (method === 'kill') {
          return sendJson(res, 200, killOp())
        }
        if (method === 'install' || method === 'uninstall') {
          const profile = validProfile(body.profile) ? body.profile : 'web'
          const target = String(method === 'install' ? (body.source || '') : (body.pkg || '')).trim()
          if (!target) return sendJson(res, 400, { ok: false, output: '缺少参数' })
          if (activeOp && activeOp.status === 'running') {
            return sendJson(res, 200, { ok: false, busy: true, output: '已有任务进行中：' + activeOp.label })
          }
          if (method === 'install' && profile === 'web' && !body.skipCheck) {
            const cls = await classifyPlugin(target)
            if (cls.fetchFailed) {
              return sendJson(res, 200, {
                ok: false,
                refused: true,
                output: '无法访问 GitHub 验证插件类型（网络问题），已中止以防破坏 web 启动。请检查网络后重试，'
                  + '或勾选"跳过类型检查"继续安装（风险自负）。',
              })
            }
            if (cls.appLike) {
              return sendJson(res, 200, {
                ok: false,
                refused: true,
                output: '该插件是面向其他 profile 的完整应用（非 web 插件），装进 web profile 会与内置应用冲突导致启动失败'
                  + '（重复 api-gateway）。如需使用请安装到对应 profile，例如：dsh plugin --profile tui add ' + target
                  + '（以插件仓库 README 为准）。',
              })
            }
          }
          const label = String(body.label || target)
          const started = startOp(method, profile, target, label, String(body.binPath || '').trim())
          if (!started.ok) return sendJson(res, 200, started)
          return sendJson(res, 200, { ok: true, opId: started.opId, timeoutMs: DEFAULT_TIMEOUT })
        }
        return sendJson(res, 404, { ok: false, error: 'unknown method ' + method })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) })
      }
    },
  })
}
