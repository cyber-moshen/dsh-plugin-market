#!/usr/bin/env node
// repair.mjs — recover a dsh profile whose bundle stack no longer composes
// (e.g. `duplicate loader entry id: ...` bricks `dsh web` at boot).
//
// This is the manual safety net for a profile that is ALREADY broken — the
// web GUI cannot start to uninstall anything, but this script runs from a
// plain shell. It repeatedly runs the same composition check the market uses
// (scripts/compose-check.mjs) and, whenever the tree fails to compose,
// removes the last non-base bundle layer (and its dependency entry) until the
// tree composes again or no candidates remain.
//
// Base layers (@deepseek-ai/* plus the shipped profile template) are never
// touched; the profile's own cordis.patch.yml is never touched.
//
// Usage:
//   node scripts/repair.mjs [--home <dshHome>] [--profile <name>] [--yes]
// Defaults: home = $DSH_HOME (or ~/.dsh), profile = web. --yes skips the
// per-removal confirmation prompt.
//
// Exit codes: 0 — profile composes (repaired or already healthy),
//             2 — still broken after removing every removable layer,
//             3 — internal error (cannot run the check).

import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import readline from 'node:readline'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const CHECK_SCRIPT = join(HERE, 'compose-check.mjs')

const args = process.argv.slice(2)
const arg = (key) => {
  const i = args.indexOf(key)
  return i >= 0 ? args[i + 1] : null
}

const home = (arg('--home') || process.env.DSH_HOME || join(homedir(), '.dsh')).replace(/[\\/]+$/, '')
const profile = arg('--profile') || 'web'
const yes = args.includes('--yes')
// The healed installation fallback the compose-check loads its core packages
// from. Normally $HOME/profiles/node_modules; an explicit override is needed
// when --home points at a test/fake DSH home.
const pkgroot = (arg('--pkgroot') || join(home, 'profiles', 'node_modules')).replace(/[\\/]+$/, '')
const profileDir = join(home, 'profiles', profile)
const manifestPath = join(profileDir, 'package.json')

/** The shipped template bundles that must never be removed as repair candidates. */
const PROTECTED = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless'])

function readManifest() {
  try { return JSON.parse(readFileSync(manifestPath, 'utf8')) } catch { return null }
}

function writeManifest(manifest) {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
}

function runCheck() {
  const result = spawnSync(process.execPath, ['--expose-internals', CHECK_SCRIPT, '--home', home, '--profile', profile, '--pkgroot', pkgroot], {
    cwd: profileDir,
    encoding: 'utf8',
    timeout: 20000,
  })
  if (result.error && result.error.code === 'ENOENT') return { ok: false, error: '无法启动 node: ' + String(result.error.message) }
  if (result.status === 3) return { ok: false, error: String(result.stdout || result.stderr || '').trim() || 'compose-check 无法运行' }
  const lines = String(result.stdout || '').split(/\r?\n/).filter((l) => l.trim())
  try {
    const j = JSON.parse(lines[lines.length - 1] || '{}')
    return { ok: !!j.ok, error: j.error || null, rows: j.rows, bundles: j.bundles }
  } catch {
    return { ok: result.status === 0, error: String(result.stdout || result.stderr || '').trim().slice(-2000) || ('compose-check 退出码 ' + result.status) }
  }
}

function bestEffortPnpmRemove(name) {
  try {
    const r = spawnSync('pnpm', ['remove', name, '-w'], { cwd: profileDir, stdio: 'ignore', shell: process.platform === 'win32', timeout: 60000 })
    return r.status === 0
  } catch { return false }
}

// ------------------------------------------------------------------- main

const manifest = readManifest()
if (!manifest) {
  console.error('repair: 找不到 profile 清单 ' + manifestPath)
  process.exit(3)
}

const initial = runCheck()
if (initial.ok) {
  console.log('repair: profile "' + profile + '" 的 bundle 组合校验通过，无需修复。')
  process.exit(0)
}
console.log('repair: 组合校验失败：' + (initial.error || '未知错误'))
console.log('repair: 将逐个移除非基础 bundle 层，直到组合通过。')

let bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? [...manifest.dsh.profile.bundles] : []
const deps = manifest.dependencies || {}
const removed = []
let guard = bundles.length + 1

while (guard-- > 0) {
  const candidateIdx = bundles.map((b, i) => i).reverse().find((i) => !PROTECTED.has(bundles[i]))
  if (candidateIdx === undefined) {
    console.error('repair: 已移除全部可移除的 bundle 层，但组合仍失败：' + (runCheck().error || '未知错误'))
    console.error('repair: 请人工检查 ' + manifestPath + ' 以及 profile 根目录的 cordis.patch.yml。')
    process.exit(2)
  }
  const name = bundles[candidateIdx]
  const isDep = Object.prototype.hasOwnProperty.call(deps, name)
  if (!yes) {
    process.stdout.write('移除 bundle 层 "' + name + '"' + (isDep ? ' 及其依赖声明' : '') + '？[y/N] ')
    const line = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise((resolve) => line.question('', (a) => { line.close(); resolve(a) }))
    if (String(answer).trim().toLowerCase() !== 'y') {
      console.log('repair: 已跳过 "' + name + '"，尝试下一个候选。')
    }
  }
  bundles.splice(candidateIdx, 1)
  if (isDep) delete deps[name]
  manifest.dependencies = deps
  manifest.dsh = { ...(manifest.dsh || {}), profile: { ...(manifest.dsh?.profile || {}), bundles } }
  writeManifest(manifest)
  removed.push(name)
  console.log('repair: 已移除 "' + name + '"（' + bundles.length + ' 个 bundle 层剩余）')
  if (isDep) {
    console.log('repair: 清理已安装依赖（pnpm remove ' + name + ' -w）…')
    bestEffortPnpmRemove(name)
  }
  const check = runCheck()
  if (check.ok) {
    console.log('repair: ✓ 组合校验通过。')
    if (removed.length > 0) console.log('repair: 已移除的 bundle 层：' + removed.join(', '))
    console.log('repair: 现在可以正常启动 dsh。')
    process.exit(0)
  }
  console.log('repair: 组合仍失败：' + (check.error || '未知错误'))
}

console.error('repair: 达到重试上限仍未修复，请人工检查 profile 配置。')
process.exit(2)
