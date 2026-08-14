// Browser half of dsh-plugin-market. Card-grid "Plugin Market" tab under
// Settings → Plugins.
//
// Cards show tags (click a tag to search it), GitHub stars, last-commit
// freshness (colored maintenance signal), and an install/update action:
//   not installed        → [安装]
//   installed, outdated  → "已安装 vX" + [更新 → vY]
//   installed, current   → "已安装 vX" (text only)
// The top-right GitHub icon button jumps to the repo. A settings row stores a
// GitHub token (avoids API rate limits) and toggles auto-update of installed
// plugins. Icons are GitHub's own octicons (MIT) inlined as SVG paths.
// Talks to the Host half over /api/dsh-plugin-market. Loaded by the web plugin
// loader (window.__ModuleLoader__); the factory id MUST equal the package name.
window.__ModuleLoader__.load({ id: 'dsh-plugin-market', factory: (require) => {
  var module = { exports: {} }; var exports = module.exports;

  const React = require('react')
  const { useState, useEffect, useRef } = React
  const h = React.createElement

  function api(method, params) {
    return fetch('/api/dsh-plugin-market', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ method }, params || {})),
    }).then((r) => r.json())
  }

  let LOCALE = 'en'
  try {
    const nl = String(navigator.language || navigator.userLanguage || '')
    if (nl.toLowerCase().startsWith('zh')) LOCALE = 'zh'
  } catch (e) {}

  const STR = {
    zh: {
      search: '搜索插件名 / 描述 / 标签 / 作者…', all: '全部', instFilter: '已安装', close: '关闭',
      loading: '加载插件目录…', noMatch: '没有匹配的插件', fetchFail: '抓取失败',
      install: '安装', update: '更新', uninstall: '卸载', execute: '执行', cancel: '取消',
      min: '最小化到后台', kill: '终止任务', liveChip: '插件任务',
      installOk: '安装成功，重启 Web 服务后生效', updateOk: '更新成功，重启 Web 服务后生效', uninstallOk: '卸载成功，重启 Web 服务后生效', opFailed: '操作失败',
      running: '执行中…（pnpm 可能需要一段时间）', submit: '提交任务…',
      stDone: '完成', stFailed: '失败', stKilled: '已终止', stTimeout: '超时终止',
      stBusy: '已有任务进行中', stRefused: '已拒绝',
      elapsed: '已耗时 {s}s（超过 {t}s 自动终止）',
      enrich: '正在获取星标/提交信息 {d}/{t}…',
      autoRunning: '自动更新中 {d}/{t}：{c}',
      stars: '星标', commit: '最近提交', maintain: '维护',
      notInstalled: '未安装', installed: '已安装', toV: '→ v{v}',
      dshMiss: 'dsh CLI 未定位，请填写路径或检查安装',
      binPlaceholder: 'dsh CLI 路径（自动探测失败时填写）', reprobe: '重新探测',
      token: 'GitHub Token（可选，避免 API 限流）', save: '保存', autoUpdate: '自动更新已安装插件',
      dataSrc: '数据源', ghApi: 'GitHub API', shields: 'shields.io（GitHub 限流降级）',
      site: '目录来源', snapshot: '离线快照', repo: 'GitHub 仓库',
      hint: '安装/更新后需重启 Web 服务生效。',
      skipCheck: '跳过完整应用类型检查（风险自负：可能装坏 web 启动）',
      noCmd: '（无官方安装命令）', maintainNew: '活跃', maintainMid: '较久未更新', maintainOld: '可能已停更',
      unknown: '未知', github: 'GitHub',
    },
    en: {
      search: 'Search name / description / tag / author…', all: 'All', instFilter: 'Installed', close: 'Close',
      loading: 'Loading plugin directory…', noMatch: 'No matching plugins', fetchFail: 'Fetch failed',
      install: 'Install', update: 'Update', uninstall: 'Uninstall', execute: 'Run', cancel: 'Cancel',
      min: 'Minimize', kill: 'Kill', liveChip: 'Plugin task',
      installOk: 'Installed — restart the web server to activate', updateOk: 'Updated — restart the web server to activate', uninstallOk: 'Uninstalled — restart the web server to activate', opFailed: 'Operation failed',
      running: 'Running… (pnpm may take a while)', submit: 'Submitting…',
      stDone: 'Done', stFailed: 'Failed', stKilled: 'Killed', stTimeout: 'Timed out',
      stBusy: 'A task is already running', stRefused: 'Refused',
      elapsed: '{s}s elapsed (auto-kill after {t}s)',
      enrich: 'Fetching stars/commits {d}/{t}…',
      autoRunning: 'Auto-updating {d}/{t}: {c}',
      stars: 'Stars', commit: 'Last commit', maintain: 'Maintenance',
      notInstalled: 'Not installed', installed: 'Installed', toV: '→ v{v}',
      dshMiss: 'dsh CLI not found — fill the path or fix the install',
      binPlaceholder: 'dsh CLI path (fill when auto-detection fails)', reprobe: 'Re-probe',
      token: 'GitHub Token (optional, avoids rate limits)', save: 'Save', autoUpdate: 'Auto-update installed plugins',
      dataSrc: 'Data source', ghApi: 'GitHub API', shields: 'shields.io (GitHub rate-limit fallback)',
      site: 'Catalog', snapshot: 'offline snapshot', repo: 'GitHub repo',
      hint: 'Restart the web server after installs/updates.',
      skipCheck: 'Skip full-app type check (risky: may break web boot)',
      noCmd: '(no official install command)', maintainNew: 'Active', maintainMid: 'Stale', maintainOld: 'Likely unmaintained',
      unknown: 'Unknown', github: 'GitHub',
    },
  }
  const t = (k) => { const m = STR[LOCALE]; return (m && m[k] !== undefined) ? m[k] : (STR.zh[k] !== undefined ? STR.zh[k] : k) }
  const fmt = (k, map) => String(t(k)).replace(/\{(\w+)\}/g, (_, n) => String(map[n] !== undefined ? map[n] : ''))

  // GitHub octicons (MIT) — https://github.com/primer/octicons
  const ICONS = {
    github: 'M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656',
    star: 'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z',
    commit: 'M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z',
    history: 'm.427 1.927 1.215 1.215a8.002 8.002 0 1 1-1.6 5.685.75.75 0 1 1 1.493-.154 6.5 6.5 0 1 0 1.18-4.458l1.358 1.358A.25.25 0 0 1 3.896 6H.25A.25.25 0 0 1 0 5.75V2.104a.25.25 0 0 1 .427-.177ZM7.75 4a.75.75 0 0 1 .75.75v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5A.75.75 0 0 1 7.75 4Z',
  }
  function Octicon({ name, size }) {
    return h('svg', {
      viewBox: '0 0 16 16',
      width: size || 14,
      height: size || 14,
      'aria-hidden': 'true',
      style: { fill: 'currentColor', display: 'inline-block', flex: 'none', verticalAlign: '-0.15em' },
    }, h('path', { d: ICONS[name] }))
  }

  function formatStars(n) {
    if (n === null || n === undefined) return '—'
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm'
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
    return String(n)
  }

  function relTime(iso) {
    if (!iso) return ''
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const diff = then - Date.now()
    const abs = Math.abs(diff)
    const zhU = { year: '年前', month: '个月前', week: '周前', day: '天前', hour: '小时前', minute: '分钟前' }
    const units = [['year', 31536000000], ['month', 2592000000], ['week', 604800000], ['day', 86400000], ['hour', 3600000], ['minute', 60000]]
    for (const [u, ms] of units) {
      if (abs >= ms) {
        const n = Math.round(diff / ms)
        if (LOCALE === 'zh') return Math.abs(n) + ' ' + zhU[u]
        try { return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(n, u) } catch { return Math.abs(n) + ' ' + u + (Math.abs(n) > 1 ? 's' : '') }
      }
    }
    return LOCALE === 'zh' ? '刚刚' : 'just now'
  }

  function maintainOf(pushedAt) {
    if (!pushedAt) return null
    const age = Date.now() - new Date(pushedAt).getTime()
    if (Number.isNaN(age)) return null
    if (age < 90 * 86400000) return 'ok'
    if (age < 365 * 86400000) return 'mid'
    return 'old'
  }

  // ------------------------------------------------------------------- css

  const MARKET_CSS = `
.mkc{font-size:15px;line-height:1.65;color:var(--dsw-alias-label-primary)}
.mkc-env{font-family:ui-monospace,"SF Mono","Cascadia Code",Menlo,monospace;font-size:12px;color:var(--dsw-alias-label-tertiary);margin-bottom:8px;white-space:pre-wrap}
.mkc-env-bad{color:var(--dsw-alias-label-error)}
.mkc-bin-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.mkc-bin-input{flex:1;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);font-family:ui-monospace,monospace;font-size:13px;padding:6px 10px;min-width:0}
.mkc-bin-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.mkc-cfg{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.mkc-cfg .mkc-bin-input{flex:1 1 240px}
.mkc-cfg-label{display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}
.mkc-finder{position:sticky;top:0;z-index:5;background:var(--dsw-alias-bg-layer-2);padding-bottom:8px}
.mkc-row1{display:flex;gap:10px;align-items:center;padding-block:12px}
.mkc-search{flex:1;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;padding:9px 12px;min-width:0}
.mkc-search::placeholder{color:var(--dsw-alias-label-tertiary)}
.mkc-count{font-family:ui-monospace,monospace;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.mkc-filter-row{display:flex;gap:8px;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.mkc-chip{font-size:13px;color:var(--dsw-alias-label-secondary);background:none;white-space:nowrap;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:4px 14px;cursor:pointer}
.mkc-chip small{color:var(--dsw-alias-label-tertiary);font-size:11px}
.mkc-chip:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}
.mkc-chip-on{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.mkc-chip-on small{color:inherit;opacity:.8}
.mkc-enrich{font-size:12.5px;color:var(--dsw-alias-label-tertiary);padding:8px 2px 0}
.mkc-enrich b{color:var(--dsw-static-deepseek-500);font-weight:600}
.mkc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;padding-top:14px}
.mkc-card{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;background:var(--dsw-alias-bg-layer-3)}
.mkc-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.mkc-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.mkc-card-title{font-size:16px;font-weight:600;line-height:1.35;word-break:break-all;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mkc-ghbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);text-decoration:none;transition:border-color .15s,color .15s}
.mkc-ghbtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.mkc-badge{font-size:11px;padding:1px 8px;border-radius:999px;line-height:18px;font-weight:500;white-space:nowrap}
.mkc-badge-arch{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);color:var(--dsw-alias-label-error)}
.mkc-tags{display:flex;flex-wrap:wrap;gap:5px}
.mkc-tag{font-size:11px;padding:1px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-bg-layer-2);white-space:nowrap}
.mkc-tag:hover{border-color:var(--dsw-static-deepseek-500);color:var(--dsw-static-deepseek-500)}
.mkc-card-by{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.mkc-card-desc{margin:0;color:var(--dsw-alias-label-secondary);font-size:13.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:44px}
.mkc-card-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.mkc-stat{flex:1;min-width:90px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:7px 10px;background:var(--dsw-alias-bg-layer-2)}
.mkc-stat-label{font-size:11px;color:var(--dsw-alias-label-tertiary);display:flex;align-items:center;gap:4px}
.mkc-stat-val{font-size:13.5px;font-weight:600;display:block;margin-top:2px;color:var(--dsw-alias-label-primary)}
.mkc-stat-val-ok{color:var(--dsw-alias-state-success-primary)}
.mkc-stat-val-mid{color:var(--dsw-alias-state-warning-primary, #d97706)}
.mkc-stat-val-old{color:var(--dsw-alias-label-error)}
.mkc-stat-val-none{color:var(--dsw-alias-label-tertiary);font-weight:400}
.mkc-card-foot{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:4px;flex-wrap:wrap}
.mkc-state{font-size:11.5px;padding:1px 9px;border-radius:999px;line-height:18px;font-weight:500;white-space:nowrap}
.mkc-state-on{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);color:var(--dsw-alias-state-success-primary)}
.mkc-state-off{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.mkc-btn{appearance:none;background:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font:inherit;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);padding:3px 12px;cursor:pointer;white-space:nowrap}
.mkc-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.mkc-btn-primary{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.mkc-btn-primary:hover:not(:disabled){opacity:.85;color:var(--dsw-alias-bg-layer-3)}
.mkc-btn-danger{color:var(--dsw-alias-label-error)}
.mkc-btn-danger:hover:not(:disabled){border-color:var(--dsw-alias-label-error);color:var(--dsw-alias-label-error)}
.mkc-btn:disabled{opacity:.4;cursor:default}
.mkc-err{color:var(--dsw-alias-label-error);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);border-radius:8px;padding:8px 12px;margin-bottom:10px}
.mkc-hint{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-top:4px}
.mkc-log{background:#1e1e1e;color:#d4d4d4;border-radius:8px;padding:8px 10px;margin-top:6px;white-space:pre-wrap;word-break:break-all;font-size:12px;max-height:240px;overflow:auto}
.mkc-spin{display:inline-block;width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-static-deepseek-500);border-radius:50%;animation:mkc-spin .7s linear infinite;vertical-align:-2px;margin-right:7px}
@keyframes mkc-spin{to{transform:rotate(360deg)}}
.mkc-livechip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--dsw-static-deepseek-500);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:3px 12px;cursor:pointer;white-space:nowrap;background:var(--dsw-alias-bg-layer-3)}
.mkc-livechip-done{color:var(--dsw-alias-state-success-primary)}
.mkc-livechip-err{color:var(--dsw-alias-label-error)}
.mkc-modal-bg{position:fixed;inset:0;z-index:1200;background:color-mix(in srgb, var(--dsw-alias-bg-base) 65%, transparent);display:flex;align-items:flex-start;justify-content:center;padding:7vh 16px 24px;overflow:auto}
.mkc-modal{width:min(760px,100%);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;padding:20px 22px;box-shadow:0 16px 48px rgba(0,0,0,.35)}
.mkc-modal h4{margin:0 0 12px;font-size:17px;font-weight:600}
.mkc-cmdrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
.mkc-skipcheck{display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--dsw-alias-label-secondary);margin-top:10px;cursor:pointer}
.mkc-site{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-bottom:6px}
.mkc-site a{color:var(--dsw-static-deepseek-500);text-decoration:none}
.mkc-site a:hover{text-decoration:underline}
`

  // -------------------------------------------------------------- component

  function MarketCardPanel() {
    const [data, setData] = useState({ phase: 'loading', plugins: [], error: null, enriched: null, config: null, autoUpdate: null })
    const [envInfo, setEnvInfo] = useState(null)
    const [binPath, setBinPath] = useState((() => { try { return localStorage.getItem('mkcBin') || '' } catch (e) { return '' } })())
    const [tokenInput, setTokenInput] = useState('')
    const [autoUpdate, setAutoUpdate] = useState(false)
    const [query, setQuery] = useState('')
    const [showInstalled, setShowInstalled] = useState(false)
    const [op, setOp] = useState(null)
    const pollStop = useRef(false)
    useEffect(() => () => { pollStop.current = true }, [])

    const changeBin = (v) => { setBinPath(v); try { localStorage.setItem('mkcBin', v) } catch (e) {} }

    const probe = () => {
      api('probe', { binPath }).then((r) => setEnvInfo(r)).catch(() => setEnvInfo({ error: 'probe failed' }))
    }

    const saveCfg = () => {
      api('config', { githubToken: tokenInput }).then((r) => {
        if (r && r.ok) setData((d) => ({ ...d, config: { tokenSet: r.tokenSet, autoUpdate: r.autoUpdate } }))
      })
    }

    const toggleAutoUpdate = (v) => {
      setAutoUpdate(v)
      api('config', { autoUpdate: v }).then((r) => {
        if (r && r.ok) setData((d) => ({ ...d, config: { tokenSet: r.tokenSet, autoUpdate: r.autoUpdate } }))
      })
    }

    const loadList = (alive) => {
      api('list', { lang: LOCALE }).then((r) => {
        if (!alive || !r || !r.ok) throw new Error((r && r.error) || 'empty')
        setData((d) => ({
          ...d, phase: 'ready',
          plugins: r.plugins || [],
          source: r.source || 'repo',
          enriched: r.enriched || null,
          autoUpdate: r.autoUpdate || null,
          config: r.config || null,
        }))
        const en = r.enriched || {}
        const au = r.autoUpdate || {}
        if ((en.running || au.active) && alive) setTimeout(() => loadList(alive), 4000)
      }).catch((e) => {
        if (!alive) return
        setData((d) => ({ ...d, phase: 'error', error: t('fetchFail') + ': ' + String((e && e.message) || e) }))
      })
    }

    useEffect(() => { probe() }, [])

    useEffect(() => {
      let alive = true
      setData((d) => ({ ...d, phase: 'loading', error: null }))
      loadList(alive)
      return () => { alive = false }
    }, [])

    useEffect(() => {
      api('op', {}).then((r) => {
        if (!r || !r.ok || !r.op || r.op.status !== 'running') return
        const o = r.op
        setOp({
          kind: o.kind, target: o.target, label: o.label, profile: o.profile,
          phase: 'running', opId: o.id, output: o.output, status: 'running', exitCode: null, minimized: false,
          elapsedMs: o.elapsedMs, timeoutMs: o.timeoutMs,
        })
        pollOp(o.id)
      }).catch(() => {})
    }, [])

    function pollOp(opId) {
      const step = () => {
        if (pollStop.current) return
        api('op', { opId }).then((r) => {
          if (pollStop.current) return
          const o = r && r.ok ? r.op : null
          if (!o) return
          setOp((prev) => {
            if (!prev || prev.opId !== opId) return prev
            if (o.status === 'running') {
              return { ...prev, phase: 'running', output: o.output, elapsedMs: o.elapsedMs, timeoutMs: o.timeoutMs }
            }
            return { ...prev, phase: 'done', output: o.output, status: o.status, exitCode: o.exitCode, ok: o.status === 'done' }
          })
          if (o.status === 'running') setTimeout(step, 2000)
          else loadList(true)
        }).catch(() => { if (!pollStop.current) setTimeout(step, 3000) })
      }
      step()
    }

    const runOp = (kind, target, label, profile) => {
      setOp({ kind, target, label, profile: profile || 'web', phase: 'confirm', minimized: false })
    }

    const executeOp = () => {
      if (!op) return
      setOp({ ...op, phase: 'starting', output: '' })
      const params = op.kind === 'install'
        ? { source: op.target, profile: op.profile, binPath, label: op.label, skipCheck: !!op.skipCheck }
        : { pkg: op.target, profile: op.profile, binPath, label: op.label }
      api(op.kind, params).then((r) => {
        if (!r || !r.ok) {
          setOp({
            ...op, phase: 'done', status: r && r.busy ? 'busy' : (r && r.refused ? 'refused' : 'failed'),
            output: String((r && (r.output || r.error)) || t('opFailed')), ok: false,
          })
          return
        }
        setOp({ ...op, phase: 'running', opId: r.opId, output: '', status: 'running', elapsedMs: 0, timeoutMs: r.timeoutMs })
        pollOp(r.opId)
      }).catch((e) => {
        setOp({ ...op, phase: 'done', status: 'failed', output: String((e && e.message) || e), ok: false })
      })
    }

    const killCurrent = () => {
      api('kill').then((r) => {
        if (r && r.ok) {
          setOp((prev) => prev ? { ...prev, phase: 'done', status: 'killed', ok: false } : prev)
          loadList(true)
        } else {
          setOp((prev) => prev ? { ...prev, phase: 'done', status: 'failed', output: String((r && r.output) || t('opFailed')), ok: false } : prev)
        }
      }).catch(() => {})
    }

    const minimizeOp = () => setOp((prev) => prev ? { ...prev, minimized: true } : prev)
    const restoreOp = () => setOp((prev) => prev ? { ...prev, minimized: false } : prev)
    const closeOp = () => setOp(null)

    const filtered = (data.plugins || []).filter((p) => {
      const inst = p.inst || { state: 'none' }
      if (showInstalled && inst.state === 'none') return false
      const q = query.trim().toLowerCase()
      if (q) {
        const hay = [p.name, p.desc, p.owner, (p.tags || []).join(' ')].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    const installedCount = (data.plugins || []).filter((p) => (p.inst || { state: 'none' }).state !== 'none').length
    const en = data.enriched || {}
    const au = data.autoUpdate || {}
    const cfg = data.config || {}
    const binOk = envInfo && (envInfo.dshBin || (envInfo.binProvided && envInfo.binValid))
    const envReady = envInfo && binOk && envInfo.node && envInfo.dshHome

    const statusText = (s) => ({
      done: t('stDone'), failed: t('stFailed'), killed: t('stKilled'),
      timeout: t('stTimeout'), busy: t('stBusy'), refused: t('stRefused'),
    })[s] || t('opFailed')

    const opTitle = (op) => ({ install: t('install'), update: t('update'), uninstall: t('uninstall') })[op.kind] + ' ' + op.label
    const opVerb = (kind) => ({ install: 'add', update: 'update', uninstall: 'remove' })[kind] || kind

    const opModal = op && !op.minimized ? h('div', { className: 'mkc-modal-bg', onClick: () => { if (op.phase === 'running' || op.phase === 'starting') minimizeOp(); else closeOp() } },
      h('div', { className: 'mkc-modal', onClick: (e) => e.stopPropagation() },
        h('h4', null, opTitle(op)),
        h('div', { style: { fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)', fontFamily: 'ui-monospace,monospace', wordBreak: 'break-all' } },
          'dsh plugin --profile ' + op.profile + ' ' + opVerb(op.kind) + ' ' + op.target),
        op.phase === 'confirm' ? h('div', null,
          h('div', { className: 'mkc-cmdrow' },
            h('button', { className: 'mkc-btn mkc-btn-primary', onClick: executeOp }, t('execute')),
            h('button', { className: 'mkc-btn', onClick: closeOp }, t('cancel')),
          ),
          op.kind === 'install' ? h('label', { className: 'mkc-skipcheck' },
            h('input', { type: 'checkbox', checked: !!op.skipCheck, onChange: (e) => setOp((prev) => prev ? { ...prev, skipCheck: e.target.checked } : prev) }),
            h('span', null, t('skipCheck')),
          ) : null,
        ) : null,
        op.phase === 'starting' ? h('div', { className: 'mkc-cmdrow' },
          h('span', { className: 'mkc-spin' }), h('span', { style: { fontSize: 13 } }, t('submit')),
        ) : null,
        op.phase === 'running' ? h('div', null,
          h('div', { className: 'mkc-cmdrow' },
            h('span', { className: 'mkc-spin' }),
            h('span', { style: { fontSize: 13 } },
              t('running') + ' · ' + fmt('elapsed', { s: Math.round((op.elapsedMs || 0) / 1000), t: op.timeoutMs ? Math.round(op.timeoutMs / 1000) : 180 })),
            h('button', { className: 'mkc-btn', onClick: minimizeOp }, t('min')),
            h('button', { className: 'mkc-btn mkc-btn-danger', onClick: killCurrent }, t('kill')),
          ),
          op.output ? h('div', { className: 'mkc-log' }, op.output) : null,
        ) : null,
        op.phase === 'done' ? h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600, color: op.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-error)' } },
            op.ok
              ? ({ install: t('installOk'), update: t('updateOk'), uninstall: t('uninstallOk') })[op.kind] || t('opFailed')
              : statusText(op.status) + (op.exitCode !== null && op.exitCode !== undefined ? ' (exit ' + op.exitCode + ')' : '')),
          op.output ? h('div', { className: 'mkc-log' }, op.output) : null,
          h('div', { className: 'mkc-cmdrow' }, h('button', { className: 'mkc-btn', onClick: closeOp }, t('close'))),
        ) : null,
      )) : null

    const liveChip = op && op.minimized ? h('button', {
      className: 'mkc-livechip' + (op.phase === 'done' ? (op.ok ? ' mkc-livechip-done' : ' mkc-livechip-err') : ''),
      onClick: restoreOp,
      title: op.label,
    },
      op.phase === 'done' ? (op.ok ? t('stDone') : statusText(op.status)) : t('liveChip'),
      ' · ' + op.label,
    ) : null

    return h('div', { className: 'mkc' },
      envInfo ? h('div', { className: 'mkc-env' + (envReady ? '' : ' mkc-env-bad') },
        'DSH_HOME ' + (envInfo.dshHome ? '✓' : '✗') + ' · node ' + (envInfo.node ? '✓' : '✗') + ' · dsh ' + (binOk ? '✓' : '✗') +
        (binOk && envInfo.binKind ? ' (' + envInfo.binKind + ')' : '') +
        ((!envInfo.dshBin && !(envInfo.binProvided && envInfo.binValid)) ? ' — ' + t('dshMiss') : '') +
        (envInfo.githubToken ? ' · GitHub token ✓' : '') +
        (envInfo.ghLimited ? ' · GitHub API 限流中' : ''),
      ) : null,
      envInfo && !binOk ? h('div', { className: 'mkc-bin-row' },
        h('input', { className: 'mkc-bin-input', placeholder: t('binPlaceholder'), value: binPath, onChange: (e) => changeBin(e.target.value) }),
        h('button', { className: 'mkc-btn', onClick: probe }, t('reprobe')),
      ) : null,
      h('div', { className: 'mkc-cfg' },
        h('input', { className: 'mkc-bin-input', type: 'password', placeholder: t('token') + (cfg.tokenSet ? ' ✓' : ''), value: tokenInput, onChange: (e) => setTokenInput(e.target.value) }),
        h('button', { className: 'mkc-btn', onClick: saveCfg }, t('save')),
        h('label', { className: 'mkc-cfg-label' },
          h('input', { type: 'checkbox', checked: autoUpdate || cfg.autoUpdate, onChange: (e) => toggleAutoUpdate(e.target.checked) }),
          t('autoUpdate'),
        ),
      ),
      h('div', { className: 'mkc-site' },
        t('site') + ': ',
        h('a', { href: 'https://github.com/cyber-moshen/dsh-plugin-market', target: '_blank', rel: 'noopener noreferrer' }, t('repo') + ' ↗'),
        data.source === 'snapshot' ? ' · ' + t('snapshot') : null,
        data.updated ? ' · ' + t('dataSrc') + ': ' + (envInfo && envInfo.ghLimited ? t('shields') : t('ghApi')) : null,
      ),
      opModal,
      h('div', { className: 'mkc-finder' },
        h('div', { className: 'mkc-row1' },
          h('input', { className: 'mkc-search', placeholder: t('search'), value: query, onChange: (e) => setQuery(e.target.value) }),
          liveChip,
          h('span', { className: 'mkc-count' }, filtered.length + ' / ' + (data.plugins || []).length),
        ),
        h('div', { className: 'mkc-filter-row' },
          h('button', {
            className: 'mkc-chip' + (showInstalled ? ' mkc-chip-on' : ''),
            onClick: () => setShowInstalled(!showInstalled),
          }, t('instFilter'), ' ', h('small', null, installedCount)),
        ),
      ),
      data.phase === 'loading' ? h('div', { style: { padding: '20px 2px' } }, t('loading')) : null,
      data.phase === 'error' ? h('div', { className: 'mkc-err' }, data.error) : null,
      data.phase === 'ready' ? h('div', null,
        en.running ? h('div', { className: 'mkc-enrich' },
          h('b', null, '⟳'), ' ' + fmt('enrich', { d: en.done, t: en.total })) : null,
        au.active ? h('div', { className: 'mkc-enrich' },
          h('b', null, '⟳'), ' ' + fmt('autoRunning', { d: au.done, t: au.total, c: au.current || '' })) : null,
        h('div', { className: 'mkc-grid' },
          filtered.map((p) => {
            const inst = p.inst || { state: 'none' }
            const maint = maintainOf(p.pushedAt)
            const mantTxt = maint === 'ok' ? t('maintainNew') : (maint === 'mid' ? t('maintainMid') : (maint === 'old' ? t('maintainOld') : t('unknown')))
            const mantCls = maint === 'ok' ? 'mkc-stat-val-ok' : (maint === 'mid' ? 'mkc-stat-val-mid' : (maint === 'old' ? 'mkc-stat-val-old' : 'mkc-stat-val-none'))
            const tags = Array.isArray(p.tags) ? p.tags : []
            return h('div', { key: p.url, className: 'mkc-card' },
              h('div', { className: 'mkc-card-top' },
                h('div', { className: 'mkc-card-title' },
                  p.name,
                  p.archived ? h('span', { className: 'mkc-badge mkc-badge-arch' }, 'archived') : null,
                ),
                h('a', { className: 'mkc-ghbtn', href: p.url, target: '_blank', rel: 'noopener noreferrer', title: t('github') },
                  h(Octicon, { name: 'github', size: 16 })),
              ),
              h('div', { className: 'mkc-card-by' }, '@' + (p.owner || '')),
              tags.length > 0 ? h('div', { className: 'mkc-tags' },
                tags.map((tag) => h('button', { key: tag, className: 'mkc-tag', title: t('search') + ': ' + tag, onClick: () => setQuery(tag) }, '#' + tag)),
              ) : null,
              p.desc ? h('p', { className: 'mkc-card-desc' }, p.desc) : null,
              h('div', { className: 'mkc-card-meta' },
                h('div', { className: 'mkc-stat' },
                  h('span', { className: 'mkc-stat-label' }, h(Octicon, { name: 'star', size: 12 }), t('stars')),
                  h('span', { className: 'mkc-stat-val' + (p.enriched ? '' : ' mkc-stat-val-none') }, formatStars(p.stars)),
                ),
                h('div', { className: 'mkc-stat' },
                  h('span', { className: 'mkc-stat-label' }, h(Octicon, { name: 'commit', size: 12 }), t('commit')),
                  h('span', { className: 'mkc-stat-val' + (p.pushedAt ? '' : ' mkc-stat-val-none') }, p.pushedAt ? relTime(p.pushedAt) : '—'),
                ),
                h('div', { className: 'mkc-stat' },
                  h('span', { className: 'mkc-stat-label' }, h(Octicon, { name: 'history', size: 12 }), t('maintain')),
                  h('span', { className: 'mkc-stat-val ' + (maint ? mantCls : 'mkc-stat-val-none') }, mantTxt),
                ),
              ),
              h('div', { className: 'mkc-card-foot' },
                inst.state === 'none'
                  ? h('span', { className: 'mkc-state mkc-state-off' }, t('notInstalled'))
                  : h('span', { className: 'mkc-state mkc-state-on' },
                      t('installed') + (inst.version ? ' v' + inst.version : '')),
                h('span', { className: 'mkc-hint', style: { marginLeft: 'auto' } }, t('hint')),
                inst.state === 'none'
                  ? (p.source ? h('button', { className: 'mkc-btn mkc-btn-primary', onClick: () => runOp('install', p.source, p.name, p.profile) }, t('install')) : null)
                  : (inst.state === 'update'
                      ? h('button', { className: 'mkc-btn mkc-btn-primary', onClick: () => runOp('update', inst.depKey, p.name, inst.profile) },
                          t('update') + (inst.latest ? ' ' + fmt('toV', { v: inst.latest }) : ''))
                      : null),
              ),
            )
          }),
        ),
        filtered.length === 0 ? h('div', { className: 'mkc-hint', style: { padding: '16px 2px' } }, t('noMatch')) : null,
      ) : null,
    )
  }

  const inject = ['slots']

  function apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    ctx.effect(() => {
      const id = 'dsh-plugin-market-style'
      if (!document.getElementById(id)) {
        const s = document.createElement('style')
        s.id = id
        s.textContent = MARKET_CSS
        document.head.appendChild(s)
      }
      return () => { const el = document.getElementById(id); if (el) el.remove() }
    }, 'plugin-market-style')
    slots.inject('settings.plugins.tab', () => slots.register(
      { name: 'settings.plugins.tab', id: 'dsh-plugin-market', order: 6, label: () => (LOCALE === 'zh' ? '插件市场' : 'Plugin Market') },
      MarketCardPanel,
    ))
  }

  module.exports = { inject, apply }
  return module.exports;
} })
