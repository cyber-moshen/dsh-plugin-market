// Catalog linter for PR validation (zero dependencies).
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
const CATEGORIES = new Set(['ui', 'theme', 'session', 'memory', 'tools', 'workflow', 'notify', 'model', 'dev', 'fun'])
const seen = new Set()

if (typeof root.name !== 'string') errors.push('root.name must be a string')
if (typeof root.url !== 'string') errors.push('root.url must be a string')
if (!Array.isArray(root.plugins)) errors.push('root.plugins must be an array')

for (const [i, p] of (root.plugins || []).entries()) {
  const at = 'plugins[' + i + ']'
  if (typeof p !== 'object' || p === null) { errors.push(at + ' must be an object'); continue }
  if (typeof p.name !== 'string' || !p.name) errors.push(at + '.name required')
  if (typeof p.owner !== 'string' || !p.owner) errors.push(at + '.owner required')
  if (typeof p.url !== 'string' || !/^https:\/\/github\.com\/[^/]+\/[^/?#]+/.test(p.url)) {
    errors.push(at + '.url must be a github.com/<owner>/<repo> URL')
  }
  if (typeof p.category !== 'string' || !p.category) errors.push(at + '.category required')
  else if (!CATEGORIES.has(p.category) && !(root.categories && root.categories[p.category])) {
    errors.push(at + '.category "' + p.category + '" not declared in root.categories')
  }
  if (!p.description || typeof p.description.en !== 'string' || typeof p.description.zh !== 'string') {
    errors.push(at + '.description must have both en and zh strings')
  }
  if (typeof p.install !== 'string' || !/^dsh plugin --profile \S+ (add|remove) \S+/.test(p.install)) {
    errors.push(at + '.install must be like "dsh plugin --profile web add <pkg>"')
  }
  if (seen.has(p.name)) errors.push('duplicate name "' + p.name + '"')
  seen.add(p.name)
}

if (root.count !== root.plugins.length) {
  errors.push('root.count (' + root.count + ') does not match plugins length (' + root.plugins.length + ')')
}

if (errors.length) {
  console.error('FAIL: ' + errors.length + ' problem(s) in ' + file)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log('OK: ' + file + ' — ' + root.plugins.length + ' plugins, categories ' + Object.keys(root.categories || {}).join(', '))
