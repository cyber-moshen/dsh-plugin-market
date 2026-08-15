#!/usr/bin/env node
// compose-check.mjs — validate that a dsh profile's persisted bundle stack
// actually composes into a bootable loader tree, WITHOUT starting the app.
//
// The real dsh boot dies hard ("plugin tree failed to load") when the composed
// tree is invalid — most famously `duplicate loader entry id: <id>`, which
// happens when two profile layers (e.g. an aggregate package AND one of its
// own dependencies, both declaring `dsh.bundle`) insert the same loader row.
// dsh-plugin-market runs this check in a throwaway subprocess after every
// install/update and automatically rolls the profile back when it fails, so a
// broken plugin can never leave the profile unbootable.
//
// This script replicates the exact composition the boot performs:
//   1. resolve every `dsh.profile.bundles` entry to its patch layer
//      (loadProfile — same two-anchor resolution as boot),
//   2. stack bundle layers + the profile's own cordis.patch.yml + the
//      home-level $DSH_HOME/cordis.patch.yml (same order as boot),
//   3. mount the root `cordis:include` exactly like `mountRootInclude` —
//      the loader throws duplicate-id / invalid-config / parse errors here,
//      before any service activation,
//   4. statically resolve every non-disabled row's package name from the
//      profile directory (the check boot's assertEntriesLoaded performs for
//      "Cannot find package" failures).
//
// No service activation happens, so nothing starts and nothing is mutated
// except a missing profile root cordis.yml (which the real boot always
// creates/rewrites anyway).
//
// Usage:
//   node --expose-internals compose-check.mjs --home <dshHome> --profile <name> --pkgroot <profiles/node_modules>
// Prints one JSON line to stdout. Exit codes:
//   0 — tree composes cleanly
//   2 — composition or resolution failure (JSON has ok:false + error)
//   3 — internal error (missing args / unable to load core packages)

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const arg = (key) => {
  const i = args.indexOf(key)
  return i >= 0 ? args[i + 1] : null
}

const home = arg('--home')
const profile = arg('--profile')
const pkgroot = arg('--pkgroot')

const fail = (code, obj) => {
  const line = JSON.stringify(obj)
  process.stdout.write(line + '\n')
  setTimeout(() => process.exit(code), 50)
}

if (!home || !profile || !pkgroot) {
  fail(3, { ok: false, error: 'missing required args (--home --profile --pkgroot)' })
}

/** Resolve a core @deepseek-ai package entry from the healed fallback dir. */
const core = (pkg, file) => join(pkgroot, '@deepseek-ai', pkg, file)

let Context, Loader, boot, dshHomePath
try {
  ;({ Context } = await import(pathToFileURL(core('cordis', 'lib/index.js')).href))
  ;({ default: Loader } = await import(pathToFileURL(core('cordis-plugin-loader', 'lib/index.js')).href))
  boot = await import(pathToFileURL(core('dsh-app-boot', 'lib/index.js')).href)
  ;({ dshHomePath } = await import(pathToFileURL(core('dsh-home-paths', 'lib/index.js')).href))
} catch (e) {
  fail(3, { ok: false, error: 'core packages unavailable from ' + pkgroot + ': ' + String((e && e.message) || e) })
}

const {
  composeEntries, loadOptionalPatches, loadProfile, mountRootInclude,
  PROFILE_PATCH_FILENAME, resolveProfileDir,
} = boot

try {
  const dir = resolveProfileDir(profile, home)
  if (!existsSync(join(dir, 'package.json'))) {
    fail(2, { ok: false, error: 'profile ' + JSON.stringify(profile) + ' has no package.json at ' + dir })
  }

  // Same anchor the real CLI uses: the dsh installation's own package.json
  // (the healed profiles/node_modules/@deepseek-ai/dsh is that package).
  const installAnchor = join(pkgroot, '@deepseek-ai', 'dsh', 'package.json')
  const loaded = loadProfile('dsh', profile, installAnchor, home)

  const bundlePatches = loaded.layers.flatMap((layer) => layer.patches)
  const homePatches = loadOptionalPatches('dsh', join(home, PROFILE_PATCH_FILENAME)) ?? []
  const patches = [...bundlePatches, ...loaded.patches, ...homePatches]

  // The real boot rewrites the profile root config on every start; create it
  // when missing so the include has its anchor, then never touch it again.
  const rootConfig = join(dir, 'cordis.yml')
  if (!existsSync(rootConfig)) writeFileSync(rootConfig, '# dsh profile root — composed from bundle patches\n[]\n')

  // 3. Mount the same root include the boot mounts. Duplicate ids, invalid
  //    config, and unparseable patch files throw here. Note: mountRootInclude
  //    (like boot) expects a plain filesystem path, not a file URL. The
  //    dshHomePath service is provided exactly like boot so `!!js` config
  //    expressions in the base bundles can evaluate.
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  ctx.provide('dshHomePath', dshHomePath)
  await ctx.plugin(Loader)
  await mountRootInclude(ctx, rootConfig, patches)

  // 4. Static row-resolution check (the boot-time "Cannot find package" class).
  const rows = composeEntries([bundlePatches, loaded.patches, homePatches])
  const requireFromProfile = createRequire(join(dir, 'package.json'))
  const missing = []
  for (const row of rows) {
    if (!row || row.disabled === true) continue
    const name = row.name
    if (typeof name !== 'string' || name === '') continue
    if (name.startsWith('cordis:') || /^[a-z][a-z0-9+.-]*:/i.test(name) || isAbsolute(name)) continue
    try { requireFromProfile.resolve(name) } catch { missing.push(name) }
  }
  if (missing.length > 0) {
    fail(2, { ok: false, error: '插件行引用的包未安装: ' + missing.join(', ') + '（启动时会报 Cannot find package）' })
  }

  fail(0, {
    ok: true,
    profile,
    rows: rows.length,
    bundles: loaded.layers.map((layer) => layer.packageName),
  })
} catch (e) {
  const parts = []
  const collect = (err) => {
    if (err instanceof AggregateError && Array.isArray(err.errors)) {
      for (const sub of err.errors) collect(sub)
      return
    }
    if (err instanceof Error) parts.push(String(err.message))
    else if (err !== undefined && err !== null) parts.push(String(err))
    if (err instanceof Error && err.cause !== undefined && err.cause !== err) collect(err.cause)
  }
  collect(e)
  if (process.env.CC_TEST_DEBUG) process.stderr.write('[cc-debug] ' + ((e && e.stack) || String(e)) + '\n' + ((e && e.cause && e.cause.stack) || '') + '\n')
  fail(2, { ok: false, error: parts.filter((p, i) => parts.indexOf(p) === i).join('\n') || 'unknown failure' })
}
