// Catalog linter for PR validation (zero dependencies).
// The schema is intentionally minimal: url + tags (+ optional npm).
// Usage: node scripts/validate.mjs [path/to/plugins.json]
import { readFileSync } from 'node:fs'

const file = process.argv[2] || 'data/plugins.json'
let root
try {
  root = JSON.parse(readFileSync(file, 'utf8'))
} catch (e) {
  console.error('FAIL: invalid JSON in ' + file + ' — ' + e.message)
  process.exit(1)
}

const errors = []
const seenUrls = new Set()

if (!Array.isArray(root.plugins)) errors.push('root.plugins must be an array')

for (const [i, p] of (root.plugins || []).entries()) {
  const at = 'plugins[' + i + ']'
  if (typeof p !== 'object' || p === null) { errors.push(at + ' must be an object'); continue }
  if (typeof p.url !== 'string' || !/^https:\/\/github\.com\/[^/]+\/[^/?#]+/.test(p.url)) {
    errors.push(at + '.url must be a github.com/<owner>/<repo> URL')
  } else if (seenUrls.has(p.url)) {
    errors.push('duplicate url "' + p.url + '"')
  }
  seenUrls.add(p.url)
  if (p.tags !== undefined) {
    if (!Array.isArray(p.tags) || p.tags.length > 5) {
      errors.push(at + '.tags must be an array of at most 5 strings (or omit it)')
    } else {
      for (const tg of p.tags) {
        if (typeof tg !== 'string' || !tg.trim()) errors.push(at + '.tags contains an empty tag')
      }
    }
  }
  if (p.npm !== undefined && p.npm !== null && (typeof p.npm !== 'string' || !p.npm.trim())) {
    errors.push(at + '.npm must be a non-empty string or null')
  }
}

if (errors.length) {
  console.error('FAIL: ' + errors.length + ' problem(s) in ' + file)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log('OK: ' + file + ' — ' + root.plugins.length + ' plugins')
