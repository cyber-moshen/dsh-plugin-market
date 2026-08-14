// Smoke test + enrichment pre-warm for the dsh-plugin-market host half.
// Loads the real module, registers the route against a mock webServer, then
// exercises probe / list. The list call kicks off the background enrichment
// fill (GitHub API → shields.io fallback); this script stays alive until the
// fill's time budget expires so the disk cache gets written.
import { apply } from '../lib/host.js'

let captured = null
const ctx = {
  get: (name) => (name === 'webServer' ? { register: (r) => { captured = r } } : undefined),
}
apply(ctx)
if (!captured) {
  console.error('[smoke] route not registered')
  process.exit(1)
}

function call(method, body) {
  return new Promise((resolve, reject) => {
    let out = ''
    const res = {
      writeHead: (s) => { out = 'status=' + s + ' ' },
      end: (s) => resolve(out + s),
    }
    const payload = Buffer.from(JSON.stringify(Object.assign({ method }, body || {})))
    let sent = false
    const req = {
      on: (ev, cb) => {
        if (ev === 'data') { if (!sent) { sent = true; cb(payload) } }
        else if (ev === 'end') cb()
      },
    }
    captured.handler(req, res).catch(reject)
  })
}

const notice = await call('notice', {})
console.log('[smoke] notice:', notice.slice(0, 200))

const cfg = await call('config', {})
console.log('[smoke] config:', cfg.slice(0, 200))

const listStart = Date.now()
const list = await call('list', { lang: 'zh' })
console.log('[smoke] list in', Date.now() - listStart, 'ms:', list.slice(0, 700))

console.log('[prewarm] fill loop running; waiting for its time budget to expire…')
await new Promise((r) => setTimeout(r, 130000))
console.log('[prewarm] done')
process.exit(0)
