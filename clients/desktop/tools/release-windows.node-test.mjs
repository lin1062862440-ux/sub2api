import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { parseArgs, readConsistentVersion, validateManifest } from './release-windows.mjs'

test('parses release options and flags', () => {
  const options = parseArgs(['--notes', 'Windows release', '--validate-only', '--assets-only'])
  assert.equal(options.get('notes'), 'Windows release')
  assert.equal(options.get('validate-only'), 'true')
  assert.equal(options.get('assets-only'), 'true')
})

test('requires every desktop and installer version to match', () => {
  const root = createVersionFixture('0.1.5')
  try {
    assert.equal(readConsistentVersion(root), '0.1.5')
    writeFileSync(join(root, 'src-installer-windows', 'Cargo.toml'), '[package]\nversion = "0.1.4"\n')
    assert.throws(() => readConsistentVersion(root), /do not match/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('validates preserved and generated manifest platforms', () => {
  const manifest = {
    version: '0.1.5',
    platforms: {
      'darwin-aarch64': { url: 'mac', signature: 'mac-signature' },
      'windows-x86_64': { url: 'win', signature: 'win-signature' },
    },
  }
  assert.equal(validateManifest(manifest, {
    version: '0.1.5',
    baselinePlatforms: ['darwin-aarch64'],
    expectedEntries: {
      'windows-x86_64': { url: 'win', signature: 'win-signature' },
    },
  }), manifest)
  assert.throws(() => validateManifest({ version: '0.1.5', platforms: {} }, {
    version: '0.1.5',
    baselinePlatforms: ['darwin-aarch64'],
    expectedEntries: {},
  }), /dropped baseline platform/)
})

function createVersionFixture(version) {
  const root = mkdtempSync(join(tmpdir(), 'linai-release-test-'))
  mkdirSync(join(root, 'src-tauri'), { recursive: true })
  mkdirSync(join(root, 'src-installer-windows'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }))
  writeFileSync(join(root, 'src-tauri', 'tauri.conf.json'), JSON.stringify({ version }))
  writeFileSync(join(root, 'src-tauri', 'Cargo.toml'), `[package]\nversion = "${version}"\n`)
  writeFileSync(join(root, 'src-installer-windows', 'tauri.conf.json'), JSON.stringify({ version }))
  writeFileSync(join(root, 'src-installer-windows', 'Cargo.toml'), `[package]\nversion = "${version}"\n`)
  return root
}
