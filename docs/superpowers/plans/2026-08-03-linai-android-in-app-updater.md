# LinAI Android In-App Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a secure, optional ARM64 Android in-app updater that checks a fixed public Gitee manifest, downloads only after consent, verifies APK bytes and identity, and hands installation to Android.

**Architecture:** TypeScript owns strict manifest parsing, cadence, and UI state; Rust owns streaming byte-count, SHA-256, and minisign verification; a narrowly scoped Kotlin Tauri plugin owns app-private downloading, archive inspection, permission, and installer intents. Release tooling creates a release-signed APK, publishes versioned assets first, and updates the fixed manifest only after anonymous verification.

**Tech Stack:** Vue 3, TypeScript, Vitest, Tauri 2, Rust, `sha2`, `minisign-verify`, Kotlin, Android SDK 36, Gradle Kotlin DSL, Node.js release tools, Gitee Releases API.

---

## File Map

- `clients/desktop/src/lib/android-updater-manifest.ts`: pure decoder and fixed-repository URL policy.
- `clients/desktop/src/lib/android-updater.ts`: coordinator, persisted cadence, progress normalization, and redacted errors.
- `clients/desktop/src/lib/android-updater-manifest.spec.ts`: manifest and version-policy tests.
- `clients/desktop/src/lib/android-updater.spec.ts`: coordinator state and cadence tests.
- `clients/desktop/src/mobile/components/MobileUpdateSheet.vue`: all Android update states and commands.
- `clients/desktop/src/mobile/components/MobileUpdateSheet.spec.ts`: rendered state, accessibility, and progress tests.
- `clients/desktop/src/layouts/MobileAppLayout.vue`: Android-only menu entry, notice, sheet, and hardware Back priority.
- `clients/desktop/src/layouts/MobileAppLayout.spec.ts`: shell integration and desktop isolation.
- `clients/desktop/src/lib/platform-capabilities.ts`: explicit `androidUpdater` capability.
- `clients/desktop/src-tauri/src/android_update.rs`: contained-path streaming verifier and structured errors.
- `clients/desktop/src-tauri/src/lib.rs`: mobile command and Android plugin registration.
- `clients/desktop/src-tauri/gen/android/app/src/main/java/ai/lin/android/updater/AndroidUpdaterPlugin.kt`: fixed native update operations.
- `clients/desktop/src-tauri/gen/android/app/src/main/java/ai/lin/android/updater/AndroidUpdatePolicy.kt`: pure package/version/certificate decisions.
- `clients/desktop/src-tauri/gen/android/app/src/test/java/ai/lin/android/updater/AndroidUpdatePolicyTest.kt`: JVM policy tests.
- `clients/desktop/src-tauri/gen/android/app/src/main/AndroidManifest.xml`: package-install permission and provider declaration.
- `clients/desktop/src-tauri/gen/android/app/src/main/res/xml/file_paths.xml`: update-cache-only provider exposure.
- `clients/desktop/src-tauri/gen/android/app/build.gradle.kts`: mandatory release signing and test dependencies.
- `clients/desktop/tools/keychain-secret.swift`: stdin-based Keychain insert/read helper without secret argv values.
- `clients/desktop/tools/android-release.mjs`: signed build and APK audit wrapper.
- `clients/desktop/tools/write-android-updater-manifest.mjs`: exact APK signature/checksum manifest generator.
- `clients/desktop/tools/publish-android-gitee-release.mjs`: ordered publish and anonymous verification.
- `clients/desktop/tools/android-release-tools.spec.ts`: tooling policy and deterministic-manifest tests.
- `clients/desktop/package.json`: Android release, manifest, publish, and test scripts.
- `clients/desktop/RELEASE.md`: bootstrap, release signing, audit, and publication runbook.
- `clients/desktop/UPDATER.md`: Android trust model, manifest contract, and recovery behavior.

### Task 1: Strict Manifest Decoder And Version Policy

**Files:**
- Create: `clients/desktop/src/lib/android-updater-manifest.ts`
- Create: `clients/desktop/src/lib/android-updater-manifest.spec.ts`
- Modify: `clients/desktop/src/lib/platform-capabilities.ts`
- Modify: `clients/desktop/src/lib/platform-capabilities.spec.ts`

- [ ] **Step 1: Write failing decoder and capability tests**

```ts
import { describe, expect, it } from 'vitest'
import { decodeAndroidUpdateManifest } from './android-updater-manifest'

const valid = {
  version: '0.1.5', version_code: 1005, notes: '安全更新',
  pub_date: '2026-08-03T00:00:00.000Z',
  platforms: { 'android-aarch64': {
    url: 'https://gitee.com/linsource/linai-desktop-release/releases/download/android-v0.1.5/LinAI_0.1.5_arm64-release.apk',
    bytes: 1024, sha256: 'a'.repeat(64), signature: 'untrusted comment: signature\nRWQAAAAAAAAA',
  } },
}

describe('decodeAndroidUpdateManifest', () => {
  it('accepts the fixed public repository and a newer code', () => {
    expect(decodeAndroidUpdateManifest(valid, 1004).versionCode).toBe(1005)
  })
  it.each([
    ['wrong host', { ...valid, platforms: { 'android-aarch64': { ...valid.platforms['android-aarch64'], url: 'https://example.com/a.apk' } } }],
    ['credential URL', { ...valid, platforms: { 'android-aarch64': { ...valid.platforms['android-aarch64'], url: 'https://token@gitee.com/linsource/linai-desktop-release/releases/download/android-v0.1.5/a.apk' } } }],
    ['non-incrementing code', { ...valid, version_code: 1004 }],
    ['uppercase digest', { ...valid, platforms: { 'android-aarch64': { ...valid.platforms['android-aarch64'], sha256: 'A'.repeat(64) } } }],
  ])('rejects %s', (_name, value) => expect(() => decodeAndroidUpdateManifest(value, 1004)).toThrow('invalid-update-manifest'))
})
```

Add `androidUpdater: false` to desktop/iOS capability assertions and `androidUpdater: true` only to Android.

- [ ] **Step 2: Run RED tests**

Run: `cd clients/desktop && pnpm vitest run src/lib/android-updater-manifest.spec.ts src/lib/platform-capabilities.spec.ts`

Expected: FAIL because the decoder and `androidUpdater` capability do not exist.

- [ ] **Step 3: Implement the pure decoder**

```ts
export interface AndroidUpdateRelease {
  version: string
  versionCode: number
  notes: string
  publishedAt: string
  url: string
  bytes: number
  sha256: string
  signature: string
}

const VERSION = /^\d+\.\d+\.\d+$/
const SHA256 = /^[a-f0-9]{64}$/
const RELEASE_PATH = /^\/linsource\/linai-desktop-release\/releases\/download\/android-v\d+\.\d+\.\d+\/[A-Za-z0-9._-]+\.apk$/

export function decodeAndroidUpdateManifest(input: unknown, installedCode: number): AndroidUpdateRelease {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error()
    const root = input as Record<string, unknown>
    const platforms = root.platforms as Record<string, unknown>
    const asset = platforms?.['android-aarch64'] as Record<string, unknown>
    const url = new URL(String(asset?.url ?? ''))
    if (!VERSION.test(String(root.version ?? ''))) throw new Error()
    if (!Number.isSafeInteger(root.version_code) || Number(root.version_code) <= installedCode) throw new Error()
    if (typeof root.notes !== 'string' || root.notes.length > 8_000) throw new Error()
    if (typeof root.pub_date !== 'string' || !Number.isFinite(Date.parse(root.pub_date))) throw new Error()
    if (url.protocol !== 'https:' || url.hostname !== 'gitee.com' || url.username || url.password || !RELEASE_PATH.test(url.pathname)) throw new Error()
    if (!Number.isSafeInteger(asset.bytes) || Number(asset.bytes) <= 0) throw new Error()
    if (typeof asset.sha256 !== 'string' || !SHA256.test(asset.sha256)) throw new Error()
    if (typeof asset.signature !== 'string' || asset.signature.length < 16 || asset.signature.length > 4_096) throw new Error()
    return { version: root.version as string, versionCode: root.version_code as number, notes: root.notes, publishedAt: root.pub_date, url: url.toString(), bytes: asset.bytes as number, sha256: asset.sha256, signature: asset.signature }
  } catch {
    throw new Error('invalid-update-manifest')
  }
}
```

Extend `PlatformCapabilities` and set `androidUpdater: target === 'android'` through the existing desktop/mobile objects without changing other flags.

- [ ] **Step 4: Run GREEN tests and commit**

Run: `cd clients/desktop && pnpm vitest run src/lib/android-updater-manifest.spec.ts src/lib/platform-capabilities.spec.ts`

Expected: PASS.

```bash
git add clients/desktop/src/lib/android-updater-manifest.ts clients/desktop/src/lib/android-updater-manifest.spec.ts clients/desktop/src/lib/platform-capabilities.ts clients/desktop/src/lib/platform-capabilities.spec.ts
git commit -m "feat(android): validate update manifests"
```

### Task 2: Persisted Cadence And Update Coordinator

**Files:**
- Create: `clients/desktop/src/lib/android-updater.ts`
- Create: `clients/desktop/src/lib/android-updater.spec.ts`

- [ ] **Step 1: Write failing cadence and transition tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createAndroidUpdater } from './android-updater'

it('suppresses successful automatic checks for 24 hours', async () => {
  const fetchManifest = vi.fn().mockResolvedValue(null)
  const updater = createAndroidUpdater({ now: () => 86_399_000, readCadence: async () => ({ lastSuccessMs: 0 }), writeCadence: vi.fn(), fetchManifest, installed: async () => ({ version: '0.1.4', versionCode: 1004 }) })
  await updater.check({ manual: false })
  expect(fetchManifest).not.toHaveBeenCalled()
})

it('uses one-hour backoff after an automatic failure but manual bypasses it', async () => {
  const fetchManifest = vi.fn().mockRejectedValue(new Error('secret response'))
  const updater = createAndroidUpdater({ now: () => 3_599_000, readCadence: async () => ({ lastFailureMs: 0 }), writeCadence: vi.fn(), fetchManifest, installed: async () => ({ version: '0.1.4', versionCode: 1004 }) })
  await updater.check({ manual: false })
  expect(fetchManifest).not.toHaveBeenCalled()
  await updater.check({ manual: true })
  expect(updater.state.value.error).toBe('暂时无法检查更新，请稍后重试。')
})
```

- [ ] **Step 2: Run RED test**

Run: `cd clients/desktop && pnpm vitest run src/lib/android-updater.spec.ts`

Expected: FAIL because `createAndroidUpdater` does not exist.

- [ ] **Step 3: Implement injected coordinator and public singleton**

Define states exactly as:

```ts
export type AndroidUpdatePhase = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'verifying' | 'permission-required' | 'ready-to-install' | 'error'
export interface AndroidUpdateState { phase: AndroidUpdatePhase; release: AndroidUpdateRelease | null; downloadedBytes: number; totalBytes: number; error: string | null }
```

`check({manual})` must read cadence first, skip automatic requests inside `86_400_000` ms success or `3_600_000` ms failure windows, use `@tauri-apps/plugin-http` only in the production adapter, persist success for valid no-update/update responses, persist failure for automatic errors, and expose only the fixed Chinese error string. `download()`, `cancel()`, and `install()` call the Android plugin through `invoke` and transition through download, Rust verification, native archive validation, permission, and ready states.

- [ ] **Step 4: Add progress and cancellation tests**

```ts
it('clamps progress and removes partial state after cancellation', async () => {
  const updater = createAndroidUpdater({
    now: () => 100_000_000,
    readCadence: async () => ({}),
    writeCadence: vi.fn(),
    installed: async () => ({ version: '0.1.4', versionCode: 1004 }),
    fetchManifest: async () => validManifest,
    download: async (_release, onProgress) => {
      onProgress({ downloaded: 2048, total: 1024 })
      throw { code: 'cancelled' }
    },
  })
  await updater.check({ manual: true })
  await updater.download()
  expect(updater.state.value).toMatchObject({ phase: 'available', downloadedBytes: 0, totalBytes: 1024, error: null })
})
```

Define `validManifest` in the same spec with the exact manifest object from Task 1 so the test has no network or native dependency.

Run: `cd clients/desktop && pnpm vitest run src/lib/android-updater.spec.ts`

Expected: FAIL until progress is clamped to `[0,total]`, cancellation returns to `available`, and raw exceptions are discarded; then PASS.

- [ ] **Step 5: Run focused tests and commit**

```bash
cd clients/desktop && pnpm vitest run src/lib/android-updater.spec.ts src/lib/android-updater-manifest.spec.ts
git add src/lib/android-updater.ts src/lib/android-updater.spec.ts
git commit -m "feat(android): coordinate optional updates"
```

### Task 3: Streaming Rust Artifact Verifier

**Files:**
- Create: `clients/desktop/src-tauri/src/android_update.rs`
- Modify: `clients/desktop/src-tauri/src/lib.rs`
- Modify: `clients/desktop/src-tauri/Cargo.toml`

- [ ] **Step 1: Add failing Rust tests with generated fixture keys**

Create unit tests inside `android_update.rs` for: valid file; exact byte mismatch; SHA mismatch; modified signed bytes; canonical path outside update cache; and error serialization. Use `tempfile`, generate a test `SecretKey`, sign a 32-byte fixture, and never use the production key.

```rust
#[test]
fn rejects_a_path_outside_the_update_cache() {
    let cache = tempfile::tempdir().unwrap();
    let outside = tempfile::NamedTempFile::new().unwrap();
    let secret = minisign_verify::SecretKey::generate_unencrypted_keypair().unwrap();
    let public = secret.public_key().unwrap();
    let signature = secret.sign(b"", None, None).unwrap();
    let result = verify_file(
        cache.path(), outside.path(), 0, &"0".repeat(64),
        &public.to_base64(), &signature.to_string(),
    );
    assert_eq!(result.unwrap_err(), VerifyErrorCode::UnsafePath);
}
```

- [ ] **Step 2: Run RED Rust test**

Run: `cd clients/desktop/src-tauri && cargo test android_update --lib`

Expected: FAIL because the module, verifier, and dependency do not exist.

- [ ] **Step 3: Implement contained streaming verification**

Add `minisign-verify = "0.2.5"` and implement a `#[tauri::command] verify_android_update(path, bytes, sha256, signature, state)` wrapper. Canonicalize both the app update-cache root and file, require `file.starts_with(root)`, stream through a 64 KiB buffer while updating `Sha256`, require exact bytes and lowercase digest, then verify the minisign signature against the public key already stored in `tauri.conf.json`. Return only `unsafe_path`, `missing_file`, `size_mismatch`, `digest_mismatch`, or `signature_mismatch`.

- [ ] **Step 4: Register command only on Android and run GREEN tests**

In mobile `run()`, add Android plugin registration under `#[cfg(target_os = "android")]` and include the verifier in `invoke_handler`. Keep iOS compilation free of Android plugin registration.

Run: `cd clients/desktop/src-tauri && cargo test android_update --lib`

Expected: PASS with no private material in fixtures or output.

- [ ] **Step 5: Commit**

```bash
git add clients/desktop/src-tauri/src/android_update.rs clients/desktop/src-tauri/src/lib.rs clients/desktop/src-tauri/Cargo.toml clients/desktop/src-tauri/Cargo.lock
git commit -m "feat(android): verify downloaded APK bytes"
```

### Task 4: Native Downloader And Cleanup

**Files:**
- Create: `clients/desktop/src-tauri/gen/android/app/src/main/java/ai/lin/android/updater/AndroidUpdaterPlugin.kt`
- Create: `clients/desktop/src-tauri/gen/android/app/src/main/java/ai/lin/android/updater/AndroidUpdatePolicy.kt`
- Create: `clients/desktop/src-tauri/gen/android/app/src/test/java/ai/lin/android/updater/AndroidUpdatePolicyTest.kt`

- [ ] **Step 1: Write failing pure JVM policy tests**

```kotlin
class AndroidUpdatePolicyTest {
  @Test fun generatedFileNameContainsOnlyVersionDigits() {
    assertEquals("linai-update-0.1.5.apk", AndroidUpdatePolicy.fileName("0.1.5"))
    assertFails { AndroidUpdatePolicy.fileName("../0.1.5") }
  }
  @Test fun progressIsBounded() {
    assertEquals(100L, AndroidUpdatePolicy.progress(150L, 100L).downloaded)
  }
  @Test fun staleVerifiedFilesExpireAfterTwentyFourHours() {
    assertTrue(AndroidUpdatePolicy.expired(0L, 86_400_001L))
  }
}
```

- [ ] **Step 2: Run RED JVM tests**

Run: `cd clients/desktop/src-tauri/gen/android && ./gradlew :app:testDebugUnitTest --tests ai.lin.android.updater.AndroidUpdatePolicyTest`

Expected: FAIL because policy classes do not exist.

- [ ] **Step 3: Implement fixed native operations**

Implement `@TauriPlugin` class `AndroidUpdaterPlugin` with commands `installedVersion`, `download`, `cancelDownload`, `validateArchive`, `requestInstallPermission`, `install`, and `cleanup`. Generate the destination under `context.cacheDir/linai-updates`, write to `.partial`, atomically rename only after exact content length, emit channel progress at no more than 10 Hz, close streams and delete partial files on cancellation/network/storage errors, and accept no caller destination.

- [ ] **Step 4: Implement cleanup and run GREEN JVM tests**

`cleanup` deletes `.partial`, APKs not matching the retained version, and verified files older than `86_400_000` ms. It canonicalizes the update root and every child before deletion.

Run: `cd clients/desktop/src-tauri/gen/android && ./gradlew :app:testDebugUnitTest --tests ai.lin.android.updater.AndroidUpdatePolicyTest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add clients/desktop/src-tauri/gen/android/app/src/main/java/ai/lin/android/updater clients/desktop/src-tauri/gen/android/app/src/test/java/ai/lin/android/updater
git commit -m "feat(android): stream updater downloads"
```

### Task 5: APK Identity, Certificate, Permission, And Installer

**Files:**
- Modify: `clients/desktop/src-tauri/gen/android/app/src/main/java/ai/lin/android/updater/AndroidUpdaterPlugin.kt`
- Modify: `clients/desktop/src-tauri/gen/android/app/src/main/java/ai/lin/android/updater/AndroidUpdatePolicy.kt`
- Modify: `clients/desktop/src-tauri/gen/android/app/src/test/java/ai/lin/android/updater/AndroidUpdatePolicyTest.kt`
- Modify: `clients/desktop/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Modify: `clients/desktop/src-tauri/gen/android/app/src/main/res/xml/file_paths.xml`

- [ ] **Step 1: Write failing identity decision tests**

```kotlin
@Test fun requiresLinAiPackageAndHigherCodeAndSameCertificate() {
  assertEquals(SecurityFailure.PackageName, AndroidUpdatePolicy.validate("other.app", 1005, byteArrayOf(1), "ai.lin.android", 1004, byteArrayOf(1)))
  assertEquals(SecurityFailure.VersionCode, AndroidUpdatePolicy.validate("ai.lin.android", 1004, byteArrayOf(1), "ai.lin.android", 1004, byteArrayOf(1)))
  assertEquals(SecurityFailure.Certificate, AndroidUpdatePolicy.validate("ai.lin.android", 1005, byteArrayOf(2), "ai.lin.android", 1004, byteArrayOf(1)))
  assertNull(AndroidUpdatePolicy.validate("ai.lin.android", 1005, byteArrayOf(1), "ai.lin.android", 1004, byteArrayOf(1)))
}
```

- [ ] **Step 2: Run RED JVM test**

Run: `cd clients/desktop/src-tauri/gen/android && ./gradlew :app:testDebugUnitTest --tests ai.lin.android.updater.AndroidUpdatePolicyTest`

Expected: FAIL because archive identity policy is absent.

- [ ] **Step 3: Implement archive inspection and installer flow**

Use `PackageManager.getPackageArchiveInfo` with signing certificates, compare package name to `context.packageName`, require archive long version code greater than installed, compare SHA-256 digests of the sole current signer, and delete on any mismatch. If `canRequestPackageInstalls()` is false, return `permission_required` and open `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` for `package:${context.packageName}` only on explicit request. Otherwise build `FileProvider.getUriForFile`, issue `ACTION_VIEW` with MIME `application/vnd.android.package-archive`, `FLAG_GRANT_READ_URI_PERMISSION`, and no broad URI grants.

- [ ] **Step 4: Tighten manifest/provider and run GREEN tests**

Add:

```xml
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

Replace provider paths with:

```xml
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <cache-path name="linai_updates" path="linai-updates/" />
</paths>
```

Run: `cd clients/desktop/src-tauri/gen/android && ./gradlew :app:testDebugUnitTest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add clients/desktop/src-tauri/gen/android/app/src/main/java/ai/lin/android/updater clients/desktop/src-tauri/gen/android/app/src/test/java/ai/lin/android/updater clients/desktop/src-tauri/gen/android/app/src/main/AndroidManifest.xml clients/desktop/src-tauri/gen/android/app/src/main/res/xml/file_paths.xml
git commit -m "feat(android): enforce APK install identity"
```

### Task 6: Mobile Update Sheet And Shell Integration

**Files:**
- Create: `clients/desktop/src/mobile/components/MobileUpdateSheet.vue`
- Create: `clients/desktop/src/mobile/components/MobileUpdateSheet.spec.ts`
- Modify: `clients/desktop/src/layouts/MobileAppLayout.vue`
- Modify: `clients/desktop/src/layouts/MobileAppLayout.spec.ts`

- [ ] **Step 1: Write failing rendered-state tests**

```ts
it('renders available metadata and explicit consent', () => {
  const wrapper = mount(MobileUpdateSheet, { props: { modelValue: true, state: availableState } })
  expect(wrapper.text()).toContain('0.1.4')
  expect(wrapper.text()).toContain('0.1.5')
  expect(wrapper.get('[data-testid="android-update-download"]').text()).toContain('下载并安装')
})

it('keeps download progress bounded and exposes cancel', () => {
  const wrapper = mount(MobileUpdateSheet, { props: { modelValue: true, state: { ...downloadingState, downloadedBytes: 1024, totalBytes: 2048 } } })
  expect(wrapper.get('progress').attributes()).toMatchObject({ max: '2048', value: '1024' })
  expect(wrapper.get('[data-testid="android-update-cancel"]').exists()).toBe(true)
})
```

- [ ] **Step 2: Run RED component tests**

Run: `cd clients/desktop && pnpm vitest run src/mobile/components/MobileUpdateSheet.spec.ts src/layouts/MobileAppLayout.spec.ts`

Expected: FAIL because the component and menu integration do not exist.

- [ ] **Step 3: Implement the sheet**

Compose `MobileBottomSheet`; render the exact phases from Task 2; format date with `Intl.DateTimeFormat('zh-CN')`; format bytes without changing element dimensions; render notes with `white-space: pre-wrap` and `overflow-wrap: anywhere`; disable closing only during `verifying`; emit `check`, `download`, `cancel`, `request-permission`, `install`, and `close`.

- [ ] **Step 4: Integrate the Android-only menu and notice**

Add a `RefreshCw` menu row with `data-testid="android-update-menu-item"` guarded by `appCapabilities.androidUpdater`, a small dot when a release is available, and a non-blocking `role="status"` notice above `RouterView`. Mount the sheet once. On mount call automatic check after authentication; manual menu checks bypass cadence. Hardware Back closes the update sheet first, then account/more layers, then leaves Tauri navigation unchanged.

- [ ] **Step 5: Add desktop-isolation and Back tests, run GREEN, commit**

Test that macOS has no menu item, Android personal/admin both do, automatic discovery does not open the sheet, and native Back closes the sheet before the account popover.

```bash
cd clients/desktop && pnpm vitest run src/mobile/components/MobileUpdateSheet.spec.ts src/layouts/MobileAppLayout.spec.ts src/lib/platform-capabilities.spec.ts
git add src/mobile/components/MobileUpdateSheet.vue src/mobile/components/MobileUpdateSheet.spec.ts src/layouts/MobileAppLayout.vue src/layouts/MobileAppLayout.spec.ts
git commit -m "feat(android): add mobile update flow"
```

### Task 7: Dedicated Keystore And Release Build Wrapper

**Files:**
- Create: `clients/desktop/tools/keychain-secret.swift`
- Create: `clients/desktop/tools/android-release.mjs`
- Create: `clients/desktop/tools/android-release-tools.spec.ts`
- Modify: `clients/desktop/src-tauri/gen/android/app/build.gradle.kts`
- Modify: `clients/desktop/package.json`

- [ ] **Step 1: Write failing release-policy tests**

Tests parse Gradle and scripts to require release signing values, reject debug fallback, require stdin for Keychain inserts, and verify version code formula `major * 1_000_000 + minor * 1_000 + patch`.

```ts
it('never falls back to the debug keystore for release', () => {
  expect(gradle).toContain('signingConfigs.create("release")')
  expect(gradle).toContain('requireSecret("LINAI_ANDROID_STORE_PASSWORD")')
  expect(gradle).not.toContain('signingConfig = signingConfigs.getByName("debug")')
})
```

- [ ] **Step 2: Run RED tooling test**

Run: `cd clients/desktop && pnpm vitest run tools/android-release-tools.spec.ts`

Expected: FAIL because secure release tooling is absent.

- [ ] **Step 3: Implement secure credential loading**

`keychain-secret.swift` uses Security.framework and reads secret bytes from stdin for `set`; `get` writes only the requested secret to stdout. Stable services/accounts are `ai.lin.android.release/store-password`, `ai.lin.android.release/key-password`, and `ai.lin.release/gitee-token`. Do not invoke `security add-generic-password -w <secret>`.

`android-release.mjs` retrieves Keychain values only when corresponding CI environment variables are absent, injects them into the Gradle child process environment, redacts child errors, and requires `LINAI_ANDROID_KEYSTORE_PATH` (defaulting to the expanded user path outside Git) and alias `linai-android-release`.

- [ ] **Step 4: Configure mandatory Gradle signing and artifact audit**

Create `signingConfigs.release` from `LINAI_ANDROID_KEYSTORE_PATH`, `LINAI_ANDROID_KEY_ALIAS`, `LINAI_ANDROID_STORE_PASSWORD`, and `LINAI_ANDROID_KEY_PASSWORD`; throw `GradleException` when absent; assign only to release. After build, the wrapper requires exactly one ARM64 release APK and runs `apksigner verify --verbose --print-certs`, `zipalign -c -P 16 4`, `apkanalyzer manifest application-id/version-name/version-code/debuggable`, and archive ABI inspection.

- [ ] **Step 5: Add scripts, run GREEN, commit**

Add:

```json
"android:release": "pnpm android:icons && node tools/android-release.mjs",
"android:manifest": "node tools/write-android-updater-manifest.mjs",
"android:publish": "node tools/publish-android-gitee-release.mjs"
```

Run: `cd clients/desktop && pnpm vitest run tools/android-release-tools.spec.ts`

Expected: PASS without accessing real Keychain values.

```bash
git add clients/desktop/tools/keychain-secret.swift clients/desktop/tools/android-release.mjs clients/desktop/tools/android-release-tools.spec.ts clients/desktop/src-tauri/gen/android/app/build.gradle.kts clients/desktop/package.json
git commit -m "build(android): require release signing"
```

### Task 8: Android Manifest Generation And Ordered Gitee Publication

**Files:**
- Create: `clients/desktop/tools/write-android-updater-manifest.mjs`
- Create: `clients/desktop/tools/publish-android-gitee-release.mjs`
- Modify: `clients/desktop/tools/android-release-tools.spec.ts`
- Modify: `clients/desktop/tools/publish-gitee-release.mjs`

- [ ] **Step 1: Write failing manifest and publication-order tests**

```ts
it('publishes versioned assets before the fixed manifest', async () => {
  const calls: string[] = []
  await publishAndroidRelease({ publish: async tag => calls.push(`publish:${tag}`), verifyPublic: async tag => calls.push(`verify:${tag}`) })
  expect(calls).toEqual(['publish:android-v0.1.5', 'verify:android-v0.1.5', 'publish:android-latest', 'verify:android-latest'])
})
```

Manifest tests use a temporary fake APK and injected signer, assert exact bytes/SHA-256, target `android-aarch64`, version/code agreement, fixed URL, and deterministic content when `--pub-date` is supplied.

- [ ] **Step 2: Run RED tooling tests**

Run: `cd clients/desktop && pnpm vitest run tools/android-release-tools.spec.ts`

Expected: FAIL because Android manifest and publisher modules do not exist.

- [ ] **Step 3: Implement manifest generation**

Locate exactly one audited `*-release.apk`; derive version name and code using Android SDK tools; require agreement with `package.json`, `Cargo.toml`, and `tauri.conf.json`; hash exact bytes; sign exact APK bytes with the configured updater private key; verify the generated signature against the committed updater public key; write `android-latest.json` with the contract from the approved specification.

- [ ] **Step 4: Implement ordered publication and redacted API errors**

Refactor the existing publisher to accept token only in Authorization/form transport without query-string logging and export testable operations. Android publisher reads the token from Keychain/CI, replaces APK and `.sig` on `android-v<version>`, anonymously fetches both, then replaces `android-latest.json` on `android-latest` and anonymously fetches final manifest plus APK headers. API errors expose status and operation only, never response bodies or token-bearing URLs.

- [ ] **Step 5: Run GREEN tooling tests and commit**

```bash
cd clients/desktop && pnpm vitest run tools/android-release-tools.spec.ts
git add tools/write-android-updater-manifest.mjs tools/publish-android-gitee-release.mjs tools/android-release-tools.spec.ts tools/publish-gitee-release.mjs
git commit -m "build(android): publish signed update assets"
```

### Task 9: Documentation And Full Automated Verification

**Files:**
- Modify: `clients/desktop/RELEASE.md`
- Modify: `clients/desktop/UPDATER.md`
- Modify: `clients/desktop/README.md`

- [ ] **Step 1: Document exact bootstrap and routine release commands**

Document keystore creation at `~/.tauri/linai-android-release.jks`, alias `linai-android-release`, RSA-4096, file mode `0600`, encrypted offline backup, stdin-based Keychain setup, `0.1.4` bootstrap preservation, three-file version bump, `pnpm android:release`, `pnpm android:manifest`, `pnpm android:publish`, token rotation, and recovery when permission is denied or the installer is canceled. Do not include any credential value.

- [ ] **Step 2: Run secret and placeholder scans**

Run:

```bash
git grep -nE 'a96c3f|dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWdu' -- . ':!docs/superpowers/specs/*' ':!docs/superpowers/plans/*'
rg -n 'T[B]D|T[O]DO|implement l[a]ter|GITEE_TOKEN=' clients/desktop/RELEASE.md clients/desktop/UPDATER.md clients/desktop/tools
```

Expected: no supplied secret fragments, placeholders, or literal token assignment.

- [ ] **Step 3: Run full frontend, Rust, JVM, and build gates**

```bash
cd clients/desktop && pnpm test:run
cd clients/desktop && pnpm build
cd clients/desktop/src-tauri && cargo test --lib
cd clients/desktop/src-tauri/gen/android && ./gradlew :app:testDebugUnitTest
cd clients/desktop && pnpm exec tauri build --debug --no-bundle --ci
git diff --check
```

Expected: all exit 0. Record any pre-existing unrelated failure separately and do not relabel it as updater success.

- [ ] **Step 4: Commit documentation**

```bash
git add clients/desktop/README.md clients/desktop/RELEASE.md clients/desktop/UPDATER.md
git commit -m "docs(android): add updater release runbook"
```

### Task 10: Bootstrap APK, Public 0.1.5, And Real-Phone Acceptance

**Files:**
- Modify: `clients/desktop/package.json`
- Modify: `clients/desktop/src-tauri/Cargo.toml`
- Modify: `clients/desktop/src-tauri/tauri.conf.json`
- Generated outside Git: `clients/desktop/release/android/0.1.4/LinAI_0.1.4_arm64-release.apk`
- Generated outside Git: `clients/desktop/release/android/0.1.5/LinAI_0.1.5_arm64-release.apk`

- [ ] **Step 1: Create and back up the release keystore**

Generate the dedicated keystore interactively without placing passwords in shell history, store passwords through `keychain-secret.swift set` stdin, set `0600`, record only certificate SHA-256, and make an encrypted offline backup before producing an installable APK.

- [ ] **Step 2: Build and audit updater-capable 0.1.4 bootstrap**

Run: `cd clients/desktop && pnpm android:release`

Expected: one release-signed ARM64 APK with package `ai.lin.android`, version `0.1.4`, code `1004`, non-debuggable manifest, approved certificate, valid APK signing schemes, valid ZIP alignment, only `arm64-v8a`, correct launcher/round icons, and `REQUEST_INSTALL_PACKAGES`.

- [ ] **Step 3: Install bootstrap on the phone**

Uninstall only the existing debug-signed `ai.lin.android`, install the preserved `0.1.4` release APK, sign in, and verify personal/admin navigation and installed launcher logo. Do not publish an update manifest yet.

- [ ] **Step 4: Bump exactly three product versions to 0.1.5**

Set `version = 0.1.5` in `package.json`, `Cargo.toml`, and `tauri.conf.json`; Android code becomes `1005` through the existing formula.

Run: `cd clients/desktop && pnpm test:run && pnpm build`

Expected: PASS.

- [ ] **Step 5: Build, manifest, publish, and anonymously verify 0.1.5**

```bash
cd clients/desktop
pnpm android:release
pnpm android:manifest -- --notes "Android 更新功能与稳定性改进"
pnpm android:publish
```

Expected: `android-v0.1.5` publicly serves APK and `.sig`; only afterward `android-latest` publicly serves `android-latest.json`; downloaded public bytes reproduce the recorded SHA-256 and minisign verification.

- [ ] **Step 6: Prove in-place update on the phone**

From installed `0.1.4`, manually check, inspect `0.1.5` metadata, cancel one download and verify cleanup, download again, grant LinAI unknown-source permission, return to the sheet, open Android installer, and confirm the update without uninstalling. Verify installed `0.1.5`, retained session, personal/admin routes, logout, system Back, IME/safe areas, and launcher logo.

- [ ] **Step 7: Record artifact evidence and commit version bump**

Record in the release handoff: absolute APK paths, size, SHA-256, version/code, ABI, debuggable state, certificate SHA-256, signing schemes, signer count, ZIP alignment, package/provider/permission fields, launcher PNG audit, minisign result, anonymous public URLs, and phone acceptance results.

```bash
git add clients/desktop/package.json clients/desktop/src-tauri/Cargo.toml clients/desktop/src-tauri/tauri.conf.json clients/desktop/src-tauri/Cargo.lock
git commit -m "release(android): bump LinAI to 0.1.5"
git push gitee codex/android-in-app-updater
git rev-list --left-right --count HEAD...gitee/codex/android-in-app-updater
```

Expected: push succeeds and comparison prints `0 0`.
