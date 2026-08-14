// dsh-plugin-market — browser half.
//
// The "Plugin Workshop" page lives under Settings (settings.section). The
// search row has a settings button; below it sits an always-visible filter
// bar (installed state, sort by stars/commit, maintenance state). Cards show
// tags (click-to-search), GitHub stars, last-commit freshness, and an
// install/update action. The settings modal stores a GitHub token and toggles
// startup auto-update. The whole UI follows the app's own language preference
// (Settings → General → Language; zh/en). A frame-wide overlay shows a
// "plugins auto-updated — restart to apply" popup on any page after a
// boot-time auto-update. Icons are GitHub's octicons (MIT), inlined as SVG.
// Talks to the host over /api/dsh-plugin-market; loaded via the web plugin
// loader (window.__ModuleLoader__), factory id MUST equal the package name.
window.__ModuleLoader__.load({ id: 'dsh-plugin-market', factory: (require) => {
  var module = { exports: {} }; var exports = module.exports;

  const React = require('react')
  const { useState, useEffect, useRef } = React
  const h = React.createElement

  // The whole workshop follows the app's own language preference
  // (Settings → General → Language; the client ships zh and en only).
  function detectLocale(svc) {
    if (svc !== undefined && typeof svc.getLocale === 'function') {
      try {
        const snap = svc.getLocale()
        if (snap && (snap.active === 'zh' || snap.active === 'en')) return snap.active
      } catch (e) {}
    }
    try { return String(navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en' } catch (e) { return 'en' }
  }
  let LOCALE = 'en'
  const localeSubs = new Set()
  function applyLocale(svc) {
    LOCALE = detectLocale(svc)
    for (const fn of [...localeSubs]) fn()
  }
  /** Subscribe a component to locale changes (forces re-render so t() picks it up). */
  function useLocale() {
    const [, bump] = useState(0)
    useEffect(() => {
      const fn = () => bump((v) => v + 1)
      localeSubs.add(fn)
      return () => { localeSubs.delete(fn) }
    }, [])
    return LOCALE
  }

  const STR = {
    zh: {
      search: '搜索插件名 / 描述 / 标签 / 作者…', cfgBtn: '设置', close: '关闭',
      loading: '加载插件目录…', noMatch: '没有匹配的插件', fetchFail: '抓取失败', badResponse: '服务未正常响应（若提示 not found，请强制刷新浏览器并重启 Web 服务后重试）',
      install: '安装', update: '更新', uninstall: '卸载', execute: '执行', cancel: '取消',
      min: '最小化到后台', kill: '终止任务', liveChip: '插件任务',
      installOk: '安装成功，重启 Web 服务后生效', updateOk: '更新成功，重启 Web 服务后生效', uninstallOk: '卸载成功，重启 Web 服务后生效', opFailed: '操作失败',
      running: '执行中…（pnpm 可能需要一段时间）', submit: '提交任务…',
      stDone: '完成', stFailed: '失败', stKilled: '已终止', stTimeout: '超时终止',
      stBusy: '已有任务进行中', stRefused: '已拒绝',
      elapsed: '已耗时 {s}s（超过 {t}s 自动终止）',
      enrich: '正在获取星标/提交信息 {d}/{t}…',
      stars: '星标', commit: '最近提交', maintain: '维护',
      notInstalled: '未安装', installed: '已安装', toV: '→ v{v}',
      instLabel: '安装状态', instAll: '全部', instInstalled: '已安装', instNot: '未安装',
      sortLabel: '排序', sortStarsAsc: '星标升序', sortStarsDesc: '星标降序', sortCommitAsc: '提交升序', sortCommitDesc: '提交降序',
      maintLabel: '维护', maintAll: '全部', maintActive: '活跃', maintStale: '较久未更新', maintDead: '可能停更', maintUnknown: '未知',
      hint: '安装/更新后需重启 Web 服务生效。',
      skipCheck: '跳过完整应用类型检查（风险自负：可能装坏 web 启动）',
      noCmd: '（无官方安装命令）', maintainNew: '活跃', maintainMid: '较久未更新', maintainOld: '可能已停更',
      unknown: '未知', github: 'GitHub', ok: '知道了',
      settingsTitle: '插件工坊设置', token: 'GitHub Token（可选，避免 API 限流）', save: '保存', clear: '清除', tokenSaved: 'Token 已保存', autoUpdate: '启动时自动更新已安装插件',
      autoUpdateHint: '开启后，每次启动 Web 服务会检测已安装插件，有新版本会自动更新；更新完成后会在首页弹窗提示重启生效。',
      noticeTitle: '已自动更新插件', noticeText: '已自动更新 {n} 个插件：{list}。请重启 Web 服务生效。',
    },
    en: {
      search: 'Search name / description / tag / author…', cfgBtn: 'Settings', close: 'Close',
      loading: 'Loading plugin directory…', noMatch: 'No matching plugins', fetchFail: 'Fetch failed', badResponse: 'Unexpected service response (if "not found", hard-refresh the browser and restart the web server)',
      install: 'Install', update: 'Update', uninstall: 'Uninstall', execute: 'Run', cancel: 'Cancel',
      min: 'Minimize', kill: 'Kill', liveChip: 'Plugin task',
      installOk: 'Installed — restart the web server to activate', updateOk: 'Updated — restart the web server to activate', uninstallOk: 'Uninstalled — restart the web server to activate', opFailed: 'Operation failed',
      running: 'Running… (pnpm may take a while)', submit: 'Submitting…',
      stDone: 'Done', stFailed: 'Failed', stKilled: 'Killed', stTimeout: 'Timed out',
      stBusy: 'A task is already running', stRefused: 'Refused',
      elapsed: '{s}s elapsed (auto-kill after {t}s)',
      enrich: 'Fetching stars/commits {d}/{t}…',
      stars: 'Stars', commit: 'Last commit', maintain: 'Maintenance',
      notInstalled: 'Not installed', installed: 'Installed', toV: '→ v{v}',
      instLabel: 'Installed', instAll: 'All', instInstalled: 'Installed', instNot: 'Not installed',
      sortLabel: 'Sort', sortStarsAsc: 'Stars ↑', sortStarsDesc: 'Stars ↓', sortCommitAsc: 'Commit ↑', sortCommitDesc: 'Commit ↓',
      maintLabel: 'Maintenance', maintAll: 'All', maintActive: 'Active', maintStale: 'Stale', maintDead: 'Unmaintained', maintUnknown: 'Unknown',
      hint: 'Restart the web server after installs/updates.',
      skipCheck: 'Skip full-app type check (risky: may break web boot)',
      noCmd: '(no official install command)', maintainNew: 'Active', maintainMid: 'Stale', maintainOld: 'Likely unmaintained',
      unknown: 'Unknown', github: 'GitHub', ok: 'Got it',
      settingsTitle: 'Plugin Workshop settings', token: 'GitHub Token (optional, avoids rate limits)', save: 'Save', clear: 'Clear', tokenSaved: 'Token saved', autoUpdate: 'Auto-update installed plugins on startup',
      autoUpdateHint: 'When enabled, the web server checks installed plugins on startup and updates them automatically; a popup on the home page asks you to restart once done.',
      noticeTitle: 'Plugins auto-updated', noticeText: '{n} plugin(s) auto-updated: {list}. Restart the web server to apply.',
    },
  }
  const t = (k) => { const m = STR[LOCALE]; return (m && m[k] !== undefined) ? m[k] : (STR.zh[k] !== undefined ? STR.zh[k] : k) }
  const fmt = (k, map) => String(t(k)).replace(/\{(\w+)\}/g, (_, n) => String(map[n] !== undefined ? map[n] : ''))

  /** POST to the host route; non-JSON responses surface as readable errors. */
  function rpc(method, params) {
    return fetch('/api/dsh-plugin-market', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ method }, params || {})),
    }).then(async (r) => {
      const text = await r.text()
      let data = null
      try { data = JSON.parse(text) } catch (e) {
        const snippet = String(text || '').trim().slice(0, 60)
        throw new Error(t('badResponse') + (snippet ? ' (' + snippet + ')' : ''))
      }
      return data
    })
  }

  // GitHub octicons (MIT) — https://github.com/primer/octicons
  const GLYPHS = {
    github: 'M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656',
    star: 'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z',
    commit: 'M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z',
    history: 'm.427 1.927 1.215 1.215a8.002 8.002 0 1 1-1.6 5.685.75.75 0 1 1 1.493-.154 6.5 6.5 0 1 0 1.18-4.458l1.358 1.358A.25.25 0 0 1 3.896 6H.25A.25.25 0 0 1 0 5.75V2.104a.25.25 0 0 1 .427-.177ZM7.75 4a.75.75 0 0 1 .75.75v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5A.75.75 0 0 1 7.75 4Z',
    // Hand-drawn jigsaw piece (octicons has no puzzle icon).
    puzzle: 'M3.5 1.5 H9.5 A2 2 0 0 1 11.5 3.5 V5.5 A2 2 0 0 1 13.5 7.5 A2 2 0 0 1 11.5 9.5 V13.5 A2 2 0 0 0 9.5 15.5 H7.5 A2 2 0 0 0 5.5 13.5 A2 2 0 0 0 3.5 15.5 A2 2 0 0 1 1.5 13.5 V3.5 A2 2 0 0 1 3.5 1.5 Z',
  }
  function Glyph({ name, size }) {
    return h('svg', {
      viewBox: '0 0 16 16',
      width: size || 14,
      height: size || 14,
      'aria-hidden': 'true',
      style: { fill: 'currentColor', display: 'inline-block', flex: 'none', verticalAlign: '-0.15em' },
    }, h('path', { d: GLYPHS[name] }))
  }

  function prettyStars(n) {
    if (n === null || n === undefined) return '—'
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm'
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
    return String(n)
  }

  function relativeTime(iso) {
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

  function freshnessOf(pushedAt) {
    if (!pushedAt) return null
    const age = Date.now() - new Date(pushedAt).getTime()
    if (Number.isNaN(age)) return null
    if (age < 90 * 86400000) return 'ok'
    if (age < 365 * 86400000) return 'mid'
    return 'old'
  }

  // ------------------------------------------------------------------- css

  const STYLE_SHEET = `
.wsp{font-size:15px;line-height:1.65;color:var(--dsw-alias-label-primary)}
.wsp-header{display:flex;align-items:center;gap:8px;padding:14px 2px 4px}
.wsp-header-icon{display:inline-flex;color:var(--dsw-static-deepseek-500)}
.wsp-header-title{font-size:18px;font-weight:700;color:var(--dsw-alias-label-primary)}
.wsp-finder{position:sticky;top:0;z-index:5;background:var(--dsw-alias-bg-layer-2);padding-bottom:8px}
.wsp-row1{display:flex;gap:8px;align-items:center;padding-block:12px}
.wsp-search{flex:1;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;padding:9px 12px;min-width:0;height:40px;box-sizing:border-box}
.wsp-search::placeholder{color:var(--dsw-alias-label-tertiary)}
.wsp-row1 .wsp-btn{height:40px;padding:0 16px;display:inline-flex;align-items:center}
.wsp-filterbar{display:flex;flex-direction:column;gap:8px;padding:10px 0 12px;border-bottom:1px solid var(--dsw-alias-border-l2);margin-bottom:2px}
.wsp-fsec{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wsp-flabel{font-size:12px;color:var(--dsw-alias-label-tertiary);min-width:56px}
.wsp-chip{font-size:12.5px;color:var(--dsw-alias-label-secondary);background:none;white-space:nowrap;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:3px 12px;cursor:pointer}
.wsp-chip:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}
.wsp-chip-on{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.wsp-enrich{font-size:12.5px;color:var(--dsw-alias-label-tertiary);padding:4px 2px 0}
.wsp-enrich b{color:var(--dsw-static-deepseek-500);font-weight:600}
.wsp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;padding-top:14px}
.wsp-card{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;background:var(--dsw-alias-bg-layer-3)}
.wsp-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.wsp-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.wsp-card-title{font-size:16px;font-weight:600;line-height:1.35;word-break:break-all;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wsp-ghbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);text-decoration:none;transition:border-color .15s,color .15s}
.wsp-ghbtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.wsp-badge{font-size:11px;padding:1px 8px;border-radius:999px;line-height:18px;font-weight:500;white-space:nowrap}
.wsp-badge-arch{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);color:var(--dsw-alias-label-error)}
.wsp-tags{display:flex;flex-wrap:wrap;gap:5px}
.wsp-tag{font-size:11px;padding:1px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-bg-layer-2);white-space:nowrap}
.wsp-tag:hover{border-color:var(--dsw-static-deepseek-500);color:var(--dsw-static-deepseek-500)}
.wsp-owner{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.wsp-desc{margin:0;color:var(--dsw-alias-label-secondary);font-size:13.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:44px}
.wsp-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.wsp-stat{flex:1;min-width:90px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:7px 10px;background:var(--dsw-alias-bg-layer-2)}
.wsp-stat-label{font-size:11px;color:var(--dsw-alias-label-tertiary);display:flex;align-items:center;gap:4px}
.wsp-stat-val{font-size:13.5px;font-weight:600;display:block;margin-top:2px;color:var(--dsw-alias-label-primary)}
.wsp-stat-ok{color:var(--dsw-alias-state-success-primary)}
.wsp-stat-mid{color:var(--dsw-alias-state-warning-primary, #d97706)}
.wsp-stat-old{color:var(--dsw-alias-label-error)}
.wsp-stat-none{color:var(--dsw-alias-label-tertiary);font-weight:400}
.wsp-foot{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:4px;flex-wrap:wrap}
.wsp-state{font-size:11.5px;padding:1px 9px;border-radius:999px;line-height:18px;font-weight:500;white-space:nowrap}
.wsp-state-on{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);color:var(--dsw-alias-state-success-primary)}
.wsp-state-off{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.wsp-btn{appearance:none;background:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font:inherit;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);padding:3px 12px;cursor:pointer;white-space:nowrap}
.wsp-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.wsp-btn-primary{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.wsp-btn-primary:hover:not(:disabled){opacity:.85;color:var(--dsw-alias-bg-layer-3)}
.wsp-btn-danger{color:var(--dsw-alias-label-error)}
.wsp-btn-danger:hover:not(:disabled){border-color:var(--dsw-alias-label-error);color:var(--dsw-alias-label-error)}
.wsp-btn:disabled{opacity:.4;cursor:default}
.wsp-err{color:var(--dsw-alias-label-error);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);border-radius:8px;padding:8px 12px;margin-bottom:10px}
.wsp-hint{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-top:4px}
.wsp-log{background:#1e1e1e;color:#d4d4d4;border-radius:8px;padding:8px 10px;margin-top:6px;white-space:pre-wrap;word-break:break-all;font-size:12px;max-height:240px;overflow:auto}
.wsp-spin{display:inline-block;width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-static-deepseek-500);border-radius:50%;animation:wsp-spin .7s linear infinite;vertical-align:-2px;margin-right:7px}
@keyframes wsp-spin{to{transform:rotate(360deg)}}
.wsp-livechip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--dsw-static-deepseek-500);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:3px 12px;cursor:pointer;white-space:nowrap;background:var(--dsw-alias-bg-layer-3)}
.wsp-livechip-done{color:var(--dsw-alias-state-success-primary)}
.wsp-livechip-err{color:var(--dsw-alias-label-error)}
.wsp-modal-bg{position:fixed;inset:0;z-index:1200;background:color-mix(in srgb, var(--dsw-alias-bg-base) 65%, transparent);display:flex;align-items:flex-start;justify-content:center;padding:7vh 16px 24px;overflow:auto}
.wsp-modal{width:min(760px,100%);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;padding:20px 22px;box-shadow:0 16px 48px rgba(0,0,0,.35)}
.wsp-modal h4{margin:0 0 12px;font-size:17px;font-weight:600}
.wsp-cmdrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
.wsp-skipcheck{display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--dsw-alias-label-secondary);margin-top:10px;cursor:pointer}
.wsp-cfgrow{display:flex;gap:8px;align-items:center;margin-bottom:10px}
.wsp-input{flex:1;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);font-family:ui-monospace,monospace;font-size:13px;padding:6px 10px;min-width:0}
.wsp-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.wsp-toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:1300;display:flex;align-items:center;gap:14px;max-width:min(640px,92vw);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px 16px;box-shadow:0 12px 36px rgba(0,0,0,.28)}
.wsp-toast-title{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary)}
.wsp-toast-text{font-size:12.5px;color:var(--dsw-alias-label-secondary);margin-top:2px;overflow-wrap:break-word}
`

  // ------------------------------------------------------------ restart toast

  function UpdateToast() {
    const [notice, setNotice] = useState(null)
    useLocale()
    useEffect(() => {
      let alive = true
      rpc('notice').then((r) => {
        if (!alive || !r || !r.ok || !r.lastAutoUpdate) return
        const la = r.lastAutoUpdate
        if (!Array.isArray(la.updated) || la.updated.length === 0) return
        let seen = ''
        try { seen = localStorage.getItem('wspNoticeDismissed') || '' } catch (e) {}
        if (seen === String(la.at)) return
        setNotice({ at: la.at, updated: la.updated })
      }).catch(() => {})
      return () => { alive = false }
    }, [])
    if (!notice) return null
    const dismiss = () => {
      try { localStorage.setItem('wspNoticeDismissed', String(notice.at)) } catch (e) {}
      setNotice(null)
    }
    return h('div', { className: 'wsp-toast' },
      h('div', null,
        h('div', { className: 'wsp-toast-title' }, t('noticeTitle')),
        h('div', { className: 'wsp-toast-text' }, fmt('noticeText', { n: notice.updated.length, list: notice.updated.join('、') })),
      ),
      h('button', { className: 'wsp-btn wsp-btn-primary', onClick: dismiss }, t('ok')),
    )
  }

  // -------------------------------------------------------------- component

  function WorkshopPanel() {
    const [data, setData] = useState({ phase: 'loading', plugins: [], error: null, enriched: null, config: null })
    const [tokenInput, setTokenInput] = useState('')
    const [autoUpdate, setAutoUpdate] = useState(false)
    const [query, setQuery] = useState('')
    const [instFilter, setInstFilter] = useState('all')
    const [maintFilter, setMaintFilter] = useState('all')
    const [sortBy, setSortBy] = useState('stars-desc')
    const [cfgOpen, setCfgOpen] = useState(false)
    const [task, setTask] = useState(null)
    useLocale()
    const pollStop = useRef(false)
    useEffect(() => () => { pollStop.current = true }, [])

    const persistConfig = () => {
      const value = tokenInput.trim()
      // An empty input never touches the stored token — it must not wipe it.
      if (!value) return
      rpc('config', { githubToken: value }).then((r) => {
        if (r && r.ok) {
          setTokenInput('')
          setData((d) => ({ ...d, config: { tokenSet: r.tokenSet, tokenTail: r.tokenTail || null, autoUpdate: r.autoUpdate } }))
        }
      })
    }

    const clearToken = () => {
      rpc('config', { clearToken: true }).then((r) => {
        if (r && r.ok) setData((d) => ({ ...d, config: { tokenSet: r.tokenSet, tokenTail: r.tokenTail || null, autoUpdate: r.autoUpdate } }))
      })
    }

    const flipAutoUpdate = (v) => {
      setAutoUpdate(v)
      rpc('config', { autoUpdate: v }).then((r) => {
        if (r && r.ok) setData((d) => ({ ...d, config: { tokenSet: r.tokenSet, tokenTail: r.tokenTail || null, autoUpdate: r.autoUpdate } }))
      })
    }

    const refreshCatalog = (alive) => {
      rpc('list', { lang: LOCALE }).then((r) => {
        if (!alive || !r || !r.ok) throw new Error((r && r.error) || 'empty')
        setData((d) => ({
          ...d, phase: 'ready',
          plugins: r.plugins || [],
          enriched: r.enriched || null,
          config: r.config || null,
        }))
        const en = r.enriched || {}
        if (en.running && alive) setTimeout(() => refreshCatalog(alive), 4000)
      }).catch((e) => {
        if (!alive) return
        setData((d) => ({ ...d, phase: 'error', error: t('fetchFail') + ': ' + String((e && e.message) || e) }))
      })
    }

    useEffect(() => {
      let alive = true
      setData((d) => ({ ...d, phase: 'loading', error: null }))
      refreshCatalog(alive)
      return () => { alive = false }
    }, [])

    useEffect(() => {
      rpc('op', {}).then((r) => {
        if (!r || !r.ok || !r.op || r.op.status !== 'running') return
        const o = r.op
        setTask({
          kind: o.kind, target: o.target, label: o.label, profile: o.profile,
          phase: 'running', opId: o.id, output: o.output, status: 'running', exitCode: null, minimized: false,
          elapsedMs: o.elapsedMs, timeoutMs: o.timeoutMs,
        })
        watchTask(o.id)
      }).catch(() => {})
    }, [])

    function watchTask(opId) {
      const step = () => {
        if (pollStop.current) return
        rpc('op', { opId }).then((r) => {
          if (pollStop.current) return
          const o = r && r.ok ? r.op : null
          if (!o) return
          setTask((prev) => {
            if (!prev || prev.opId !== opId) return prev
            if (o.status === 'running') {
              return { ...prev, phase: 'running', output: o.output, elapsedMs: o.elapsedMs, timeoutMs: o.timeoutMs }
            }
            return { ...prev, phase: 'done', output: o.output, status: o.status, exitCode: o.exitCode, ok: o.status === 'done' }
          })
          if (o.status === 'running') setTimeout(step, 2000)
          else refreshCatalog(true)
        }).catch(() => { if (!pollStop.current) setTimeout(step, 3000) })
      }
      step()
    }

    const askOperation = (kind, target, label, profile) => {
      setTask({ kind, target, label, profile: profile || 'web', phase: 'confirm', minimized: false })
    }

    const runOperation = () => {
      if (!task) return
      setTask({ ...task, phase: 'starting', output: '' })
      const params = task.kind === 'install'
        ? { source: task.target, profile: task.profile, binPath: '', label: task.label, skipCheck: !!task.skipCheck }
        : { pkg: task.target, profile: task.profile, binPath: '', label: task.label }
      rpc(task.kind, params).then((r) => {
        if (!r || !r.ok) {
          setTask({
            ...task, phase: 'done', status: r && r.busy ? 'busy' : (r && r.refused ? 'refused' : 'failed'),
            output: String((r && (r.output || r.error)) || t('opFailed')), ok: false,
          })
          return
        }
        setTask({ ...task, phase: 'running', opId: r.opId, output: '', status: 'running', elapsedMs: 0, timeoutMs: r.timeoutMs })
        watchTask(r.opId)
      }).catch((e) => {
        setTask({ ...task, phase: 'done', status: 'failed', output: String((e && e.message) || e), ok: false })
      })
    }

    const cancelTask = () => {
      rpc('kill').then((r) => {
        if (r && r.ok) {
          setTask((prev) => prev ? { ...prev, phase: 'done', status: 'killed', ok: false } : prev)
          refreshCatalog(true)
        } else {
          setTask((prev) => prev ? { ...prev, phase: 'done', status: 'failed', output: String((r && r.output) || t('opFailed')), ok: false } : prev)
        }
      }).catch(() => {})
    }

    const collapseTask = () => setTask((prev) => prev ? { ...prev, minimized: true } : prev)
    const expandTask = () => setTask((prev) => prev ? { ...prev, minimized: false } : prev)
    const dismissTask = () => setTask(null)

    const freshnessOfP = (p) => freshnessOf(p.pushedAt) || 'unknown'
    const filtered = (data.plugins || []).filter((p) => {
      const inst = p.inst || { state: 'none' }
      if (instFilter === 'installed' && inst.state === 'none') return false
      if (instFilter === 'not' && inst.state !== 'none') return false
      if (maintFilter !== 'all' && freshnessOfP(p) !== maintFilter) return false
      const q = query.trim().toLowerCase()
      if (q) {
        const hay = [p.name, p.desc, p.owner, (p.tags || []).join(' ')].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const sorted = [...filtered]
    if (sortBy === 'stars-asc') sorted.sort((a, b) => (a.stars || 0) - (b.stars || 0))
    else if (sortBy === 'stars-desc') sorted.sort((a, b) => (b.stars || 0) - (a.stars || 0))
    else if (sortBy === 'commit-asc') sorted.sort((a, b) => new Date(a.pushedAt || 0).getTime() - new Date(b.pushedAt || 0).getTime())
    else if (sortBy === 'commit-desc') sorted.sort((a, b) => new Date(b.pushedAt || 0).getTime() - new Date(a.pushedAt || 0).getTime())

    const en = data.enriched || {}
    const cfg = data.config || {}

    const taskStatusLabel = (s) => ({
      done: t('stDone'), failed: t('stFailed'), killed: t('stKilled'),
      timeout: t('stTimeout'), busy: t('stBusy'), refused: t('stRefused'),
    })[s] || t('opFailed')

    const taskTitle = (tk) => ({ install: t('install'), update: t('update'), uninstall: t('uninstall') })[tk.kind] + ' ' + tk.label
    const pnpmVerb = (kind) => ({ install: 'add', update: 'update', uninstall: 'remove' })[kind] || kind

    const taskModal = task && !task.minimized ? h('div', { className: 'wsp-modal-bg', onClick: () => { if (task.phase === 'running' || task.phase === 'starting') collapseTask(); else dismissTask() } },
      h('div', { className: 'wsp-modal', onClick: (e) => e.stopPropagation() },
        h('h4', null, taskTitle(task)),
        h('div', { style: { fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)', fontFamily: 'ui-monospace,monospace', wordBreak: 'break-all' } },
          'dsh plugin --profile ' + task.profile + ' ' + pnpmVerb(task.kind) + ' ' + task.target),
        task.phase === 'confirm' ? h('div', null,
          h('div', { className: 'wsp-cmdrow' },
            h('button', { className: 'wsp-btn wsp-btn-primary', onClick: runOperation }, t('execute')),
            h('button', { className: 'wsp-btn', onClick: dismissTask }, t('cancel')),
          ),
          task.kind === 'install' ? h('label', { className: 'wsp-skipcheck' },
            h('input', { type: 'checkbox', checked: !!task.skipCheck, onChange: (e) => setTask((prev) => prev ? { ...prev, skipCheck: e.target.checked } : prev) }),
            h('span', null, t('skipCheck')),
          ) : null,
        ) : null,
        task.phase === 'starting' ? h('div', { className: 'wsp-cmdrow' },
          h('span', { className: 'wsp-spin' }), h('span', { style: { fontSize: 13 } }, t('submit')),
        ) : null,
        task.phase === 'running' ? h('div', null,
          h('div', { className: 'wsp-cmdrow' },
            h('span', { className: 'wsp-spin' }),
            h('span', { style: { fontSize: 13 } },
              t('running') + ' · ' + fmt('elapsed', { s: Math.round((task.elapsedMs || 0) / 1000), t: task.timeoutMs ? Math.round(task.timeoutMs / 1000) : 180 })),
            h('button', { className: 'wsp-btn', onClick: collapseTask }, t('min')),
            h('button', { className: 'wsp-btn wsp-btn-danger', onClick: cancelTask }, t('kill')),
          ),
          task.output ? h('div', { className: 'wsp-log' }, task.output) : null,
        ) : null,
        task.phase === 'done' ? h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600, color: task.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-error)' } },
            task.ok
              ? ({ install: t('installOk'), update: t('updateOk'), uninstall: t('uninstallOk') })[task.kind] || t('opFailed')
              : taskStatusLabel(task.status) + (task.exitCode !== null && task.exitCode !== undefined ? ' (exit ' + task.exitCode + ')' : '')),
          task.output ? h('div', { className: 'wsp-log' }, task.output) : null,
          h('div', { className: 'wsp-cmdrow' }, h('button', { className: 'wsp-btn', onClick: dismissTask }, t('close'))),
        ) : null,
      )) : null

    const liveChip = task && task.minimized ? h('button', {
      className: 'wsp-livechip' + (task.phase === 'done' ? (task.ok ? ' wsp-livechip-done' : ' wsp-livechip-err') : ''),
      onClick: expandTask,
      title: task.label,
    },
      task.phase === 'done' ? (task.ok ? t('stDone') : taskStatusLabel(task.status)) : t('liveChip'),
      ' · ' + task.label,
    ) : null

    const cfgModal = cfgOpen ? h('div', { className: 'wsp-modal-bg', onClick: () => setCfgOpen(false) },
      h('div', { className: 'wsp-modal', onClick: (e) => e.stopPropagation() },
        h('h4', null, t('settingsTitle')),
        h('div', { className: 'wsp-cfgrow' },
          h('input', { className: 'wsp-input', type: 'password', placeholder: t('token'), value: tokenInput, onChange: (e) => setTokenInput(e.target.value) }),
          h('button', { className: 'wsp-btn wsp-btn-primary', onClick: persistConfig }, t('save')),
        ),
        cfg.tokenSet ? h('div', { className: 'wsp-cfgrow' },
          h('span', { className: 'wsp-hint', style: { margin: 0 } },
            '✓ ' + t('tokenSaved') + (cfg.tokenTail ? '（···' + cfg.tokenTail + '）' : '')),
          h('button', { className: 'wsp-btn wsp-btn-danger', onClick: clearToken }, t('clear')),
        ) : null,
        h('label', { className: 'wsp-skipcheck', style: { marginTop: 0 } },
          h('input', { type: 'checkbox', checked: autoUpdate || cfg.autoUpdate, onChange: (e) => flipAutoUpdate(e.target.checked) }),
          h('span', null, t('autoUpdate')),
        ),
        h('div', { className: 'wsp-hint' }, t('autoUpdateHint')),
        h('div', { className: 'wsp-cmdrow' }, h('button', { className: 'wsp-btn', onClick: () => setCfgOpen(false) }, t('close'))),
      )) : null

    return h('div', { className: 'wsp' },
      taskModal,
      cfgModal,
      h('div', { className: 'wsp-header' },
        h('span', { className: 'wsp-header-icon' }, h(Glyph, { name: 'puzzle', size: 18 })),
        h('span', { className: 'wsp-header-title' }, LOCALE === 'zh' ? '插件工坊' : 'Plugin Workshop'),
      ),
      h('div', { className: 'wsp-finder' },
        h('div', { className: 'wsp-row1' },
          h('input', { className: 'wsp-search', placeholder: t('search'), value: query, onChange: (e) => setQuery(e.target.value) }),
          h('button', { className: 'wsp-btn', onClick: () => setCfgOpen(true) }, t('cfgBtn')),
          liveChip,
        ),
        h('div', { className: 'wsp-filterbar' },
          h('div', { className: 'wsp-fsec' },
            h('span', { className: 'wsp-flabel' }, t('instLabel')),
            [['all', t('instAll')], ['installed', t('instInstalled')], ['not', t('instNot')]].map(([v, label]) =>
              h('button', { key: v, className: 'wsp-chip' + (instFilter === v ? ' wsp-chip-on' : ''), onClick: () => setInstFilter(v) }, label)),
          ),
          h('div', { className: 'wsp-fsec' },
            h('span', { className: 'wsp-flabel' }, t('sortLabel')),
            [['stars-asc', t('sortStarsAsc')], ['stars-desc', t('sortStarsDesc')], ['commit-asc', t('sortCommitAsc')], ['commit-desc', t('sortCommitDesc')]].map(([v, label]) =>
              h('button', { key: v, className: 'wsp-chip' + (sortBy === v ? ' wsp-chip-on' : ''), onClick: () => setSortBy(v) }, label)),
          ),
          h('div', { className: 'wsp-fsec' },
            h('span', { className: 'wsp-flabel' }, t('maintLabel')),
            [['all', t('maintAll')], ['ok', t('maintActive')], ['mid', t('maintStale')], ['old', t('maintDead')], ['unknown', t('maintUnknown')]].map(([v, label]) =>
              h('button', { key: v, className: 'wsp-chip' + (maintFilter === v ? ' wsp-chip-on' : ''), onClick: () => setMaintFilter(v) }, label)),
          ),
        ),
      ),
      data.phase === 'loading' ? h('div', { style: { padding: '20px 2px' } }, t('loading')) : null,
      data.phase === 'error' ? h('div', { className: 'wsp-err' }, data.error) : null,
      data.phase === 'ready' ? h('div', null,
        en.running ? h('div', { className: 'wsp-enrich' },
          h('b', null, '⟳'), ' ' + fmt('enrich', { d: en.done, t: en.total })) : null,
        h('div', { className: 'wsp-grid' },
          sorted.map((p) => {
            const inst = p.inst || { state: 'none' }
            const fresh = freshnessOf(p.pushedAt)
            const freshTxt = fresh === 'ok' ? t('maintainNew') : (fresh === 'mid' ? t('maintainMid') : (fresh === 'old' ? t('maintainOld') : t('unknown')))
            const freshCls = fresh === 'ok' ? 'wsp-stat-ok' : (fresh === 'mid' ? 'wsp-stat-mid' : (fresh === 'old' ? 'wsp-stat-old' : 'wsp-stat-none'))
            const tags = Array.isArray(p.tags) ? p.tags : []
            return h('div', { key: p.url, className: 'wsp-card' },
              h('div', { className: 'wsp-card-top' },
                h('div', { className: 'wsp-card-title' },
                  p.name,
                  p.archived ? h('span', { className: 'wsp-badge wsp-badge-arch' }, 'archived') : null,
                ),
                h('a', { className: 'wsp-ghbtn', href: p.url, target: '_blank', rel: 'noopener noreferrer', title: t('github') },
                  h(Glyph, { name: 'github', size: 16 })),
              ),
              h('div', { className: 'wsp-owner' }, '@' + (p.owner || '')),
              tags.length > 0 ? h('div', { className: 'wsp-tags' },
                tags.map((tag) => h('button', { key: tag, className: 'wsp-tag', title: t('search') + ': ' + tag, onClick: () => setQuery(tag) }, '#' + tag)),
              ) : null,
              p.desc ? h('p', { className: 'wsp-desc' }, p.desc) : null,
              h('div', { className: 'wsp-meta' },
                h('div', { className: 'wsp-stat' },
                  h('span', { className: 'wsp-stat-label' }, h(Glyph, { name: 'star', size: 12 }), t('stars')),
                  h('span', { className: 'wsp-stat-val' + (p.enriched ? '' : ' wsp-stat-none') }, prettyStars(p.stars)),
                ),
                h('div', { className: 'wsp-stat' },
                  h('span', { className: 'wsp-stat-label' }, h(Glyph, { name: 'commit', size: 12 }), t('commit')),
                  h('span', { className: 'wsp-stat-val' + (p.pushedAt ? '' : ' wsp-stat-none') }, p.pushedAt ? relativeTime(p.pushedAt) : '—'),
                ),
                h('div', { className: 'wsp-stat' },
                  h('span', { className: 'wsp-stat-label' }, h(Glyph, { name: 'history', size: 12 }), t('maintain')),
                  h('span', { className: 'wsp-stat-val ' + (fresh ? freshCls : 'wsp-stat-none') }, freshTxt),
                ),
              ),
              h('div', { className: 'wsp-foot' },
                inst.state === 'none'
                  ? h('span', { className: 'wsp-state wsp-state-off' }, t('notInstalled'))
                  : h('span', { className: 'wsp-state wsp-state-on' },
                      t('installed') + (inst.version ? ' v' + inst.version : '')),
                h('span', { className: 'wsp-hint', style: { marginLeft: 'auto' } }, t('hint')),
                inst.state === 'none'
                  ? (p.source ? h('button', { className: 'wsp-btn wsp-btn-primary', onClick: () => askOperation('install', p.source, p.name, p.profile) }, t('install')) : null)
                  : (inst.state === 'update'
                      ? h('button', { className: 'wsp-btn wsp-btn-primary', onClick: () => askOperation('update', inst.depKey, p.name, inst.profile) },
                          t('update') + (inst.latest ? ' ' + fmt('toV', { v: inst.latest }) : ''))
                      : null),
              ),
            )
          }),
        ),
        sorted.length === 0 ? h('div', { className: 'wsp-hint', style: { padding: '16px 2px' } }, t('noMatch')) : null,
      ) : null,
    )
  }

  const inject = ['slots']

  function apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const localeSvc = ctx.get('locale')
    applyLocale(localeSvc)
    if (localeSvc !== undefined && typeof localeSvc.subscribe === 'function') {
      ctx.effect(() => localeSvc.subscribe(() => applyLocale(localeSvc)))
    }
    ctx.effect(() => {
      const id = 'dsh-plugin-market-style'
      if (!document.getElementById(id)) {
        const s = document.createElement('style')
        s.id = id
        s.textContent = STYLE_SHEET
        document.head.appendChild(s)
      }
      return () => { const el = document.getElementById(id); if (el) el.remove() }
    }, 'plugin-market-style')
    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'dsh-plugin-market', order: 60, label: () => ({ zh: '插件工坊', en: 'Plugin Workshop' }[LOCALE] || 'Plugin Workshop') },
      WorkshopPanel,
    ))
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'dsh-plugin-market-notice', order: 100 },
      UpdateToast,
    ))
  }

  module.exports = { inject, apply }
  return module.exports;
} })
