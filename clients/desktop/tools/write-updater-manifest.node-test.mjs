import assert from 'node:assert/strict'
import test from 'node:test'

import { inferUpdaterPlatform, mergeManifest, parseArgs } from './write-updater-manifest.mjs'

test('infers Windows updater platform names', () => {
  assert.equal(inferUpdaterPlatform('LinAI-updater.exe', 'win32', 'x64'), 'windows-x86_64')
  assert.equal(inferUpdaterPlatform('LinAI-updater.exe', 'win32', 'ia32'), 'windows-i686')
})

test('parses an explicit Windows package and platform', () => {
  const args = parseArgs([
    '--package', 'dist-windows/LinAI-updater.exe',
    '--platform', 'windows-x86_64',
  ])
  assert.equal(args.get('package'), 'dist-windows/LinAI-updater.exe')
  assert.equal(args.get('platform'), 'windows-x86_64')
})

test('keeps other platforms when adding the same release version', () => {
  const manifest = mergeManifest({
    version: '0.1.4',
    notes: 'release notes',
    platforms: {
      'darwin-aarch64': { signature: 'mac-signature', url: 'mac-url' },
    },
  }, {
    version: '0.1.4',
    target: 'windows-x86_64',
    signature: 'windows-signature',
    url: 'windows-url',
    pubDate: '2026-08-03T00:00:00.000Z',
  })

  assert.equal(manifest.notes, 'release notes')
  assert.equal(manifest.platforms['darwin-aarch64'].url, 'mac-url')
  assert.equal(manifest.platforms['windows-x86_64'].url, 'windows-url')
})

test('drops stale platforms when the release version changes', () => {
  const manifest = mergeManifest({
    version: '0.1.3',
    platforms: { 'darwin-aarch64': { signature: 'old', url: 'old' } },
  }, {
    version: '0.1.4',
    target: 'windows-x86_64',
    signature: 'new',
    url: 'new',
    pubDate: '2026-08-03T00:00:00.000Z',
  })

  assert.deepEqual(Object.keys(manifest.platforms), ['windows-x86_64'])
})
