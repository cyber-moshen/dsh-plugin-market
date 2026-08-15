#!/usr/bin/env node
// test-compose-check.mjs — integration test for the boot-safety net:
// scripts/compose-check.mjs and scripts/repair.mjs.
//
// Builds an isolated fake DSH home with a fake profile carrying two bundle
// packages, then verifies that:
//   A. two patches inserting the same loader id (the dsh-web-ui crash shape)
//      are detected as a compose failure;
//   B. after de-duplicating the id, the same profile composes cleanly;
//   C. scripts/repair.mjs removes the offending layer and recovers the
//      profile automatically.
//
// The core @deepseek-ai packages are resolved from the machine's healed
// profiles/node_modules fallback; when they are absent (plain CI checkout),
// the test prints SKIP and exits 0.
//
// Run with: node scripts/test-compose-check.mjs

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const HOME = (process.env.DSH_HOME || join(homedir(), '.dsh')).replace(/[\\/]+$/, '')
const PKGROOT = join(HOME, 'profiles', 'node_modules')
const CORE = join(PKGROOT, '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js')

let failures = 0
const assert = (cond, msg) => {
  if (cond) { console.log('  PASS  ' + msg) } else { failures += 1; console.log('  FAIL  ' + msg) }
}

if (!existsSync(CORE)) {
  console.log('SKIP: healed profiles/node_modules not found (' + CORE + ') — compose-check test needs a real DSH install.')
  process.exit(0)
}

const fakeHome = join(process.env.TEMP || '.', 'dsh-market-compose-test-' + process.pid)
const profileDir = join(fakeHome, 'profiles', 'test-p')
const nmDir = join(profileDir, 'node_modules')

const fakePackage = (name, patchId) => {
  const dir = join(nmDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name, version: '1.0.0', type: 'module', main: 'index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
  }, null, 2))
  writeFileSync(join(dir, 'index.js'), 'export const name = ' + JSON.stringify(name) + '\nexport function apply() {}\n')
  writeFileSync(join(dir, 'cordis.patch.yml'),
    '- insert:\n    - id: ' + patchId + '\n      name: ' + JSON.stringify(name) + '\n')
}

const writeProfile = (bundles) => {
  // bundles: array of [packageName, loaderRowId] pairs.
  rmSync(profileDir, { recursive: true, force: true })
  mkdirSync(profileDir, { recursive: true })
  const deps = {}
  const names = []
  for (const [name] of bundles) { deps[name] = '1.0.0'; names.push(name) }
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-test-p', private: true,
    dependencies: deps,
    dsh: { profile: { bundles: names } },
  }, null, 2))
  writeFileSync(join(profileDir, 'cordis.yml'), '[]\n')
  for (const [name, id] of bundles) fakePackage(name, id)
}

const runCheck = () => {
  const r = spawnSync(process.execPath, [
    '--expose-internals', join(HERE, 'compose-check.mjs'),
    '--home', fakeHome, '--profile', 'test-p', '--pkgroot', PKGROOT,
  ], { encoding: 'utf8', timeout: 20000 })
  if (process.env.CC_TEST_DEBUG) {
    console.log('  [debug] status=' + r.status + ' stdout=' + JSON.stringify(String(r.stdout || '').slice(0, 800)) + ' stderr=' + JSON.stringify(String(r.stderr || '').slice(0, 400)))
  }
  const lines = String(r.stdout || '').split(/\r?\n/).filter((l) => l.trim())
  try { return JSON.parse(lines[lines.length - 1] || '{}') } catch { return { ok: false, error: String(r.stderr || r.stdout || '').slice(-2000) } }
}

const runRepair = () => {
  const r = spawnSync(process.execPath, [
    join(HERE, 'repair.mjs'), '--home', fakeHome, '--profile', 'test-p', '--pkgroot', PKGROOT, '--yes',
  ], { encoding: 'utf8', timeout: 30000 })
  return { code: r.status, out: String(r.stdout || ''), err: String(r.stderr || '') }
}

try {
  console.log('== A: duplicate loader id must be detected ==')
  writeProfile([['fake-a', 'ui-skin-center'], ['fake-b', 'ui-skin-center']])
  const a = runCheck()
  assert(a.ok === false, 'compose-check rejects the duplicate-id profile (got ok=' + String(a.ok) + ')')
  assert(/(duplicate loader entry id|重复 loader 条目|duplicate)/i.test(String(a.error || '')), 'error names the duplicate (' + String(a.error || '').slice(0, 120) + ')')

  console.log('== B: de-duplicated profile must compose ==')
  writeProfile([['fake-a', 'ui-skin-center'], ['fake-b', 'ui-other']])
  const b = runCheck()
  assert(b.ok === true, 'compose-check accepts the fixed profile')
  assert(Array.isArray(b.bundles) && b.bundles.length === 2, 'check reports the bundle stack (' + JSON.stringify(b.bundles) + ')')

  console.log('== C: repair.mjs recovers the broken profile ==')
  writeProfile([['fake-a', 'ui-skin-center'], ['fake-b', 'ui-skin-center']])
  const c = runRepair()
  const finalCheck = runCheck()
  assert(c.code === 0, 'repair exits 0 (got ' + c.code + ')')
  assert(finalCheck.ok === true, 'profile composes after repair')
  const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  assert(Array.isArray(manifest.dsh.profile.bundles) && manifest.dsh.profile.bundles.length === 1
    && manifest.dsh.profile.bundles[0] === 'fake-a', 'repair removed the offending layer (bundles=' + JSON.stringify(manifest.dsh.profile.bundles) + ')')
} finally {
  rmSync(fakeHome, { recursive: true, force: true })
}

console.log('')
if (failures === 0) console.log('ALL COMPOSE-CHECK TESTS PASSED')
else console.log(failures + ' TEST(S) FAILED')
process.exit(failures === 0 ? 0 : 1)
