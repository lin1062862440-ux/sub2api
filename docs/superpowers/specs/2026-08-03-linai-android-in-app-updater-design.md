# LinAI Android In-App Updater Design

**Date:** 2026-08-03

**Status:** Direction approved; written specification awaiting review

## Goal

Add a secure, optional Android in-app update flow to the existing LinAI Tauri client. The application checks a public Gitee release manifest, lets the user explicitly download a release APK, verifies the downloaded artifact before installation, and then opens the Android system package installer. Desktop updater behavior and the existing Android product scope remain unchanged.

The first native acceptance run upgrades a manually installed, release-signed `0.1.4` bootstrap APK to `0.1.5` from inside the application.

## Confirmed Product Decisions

- The update flow is available to both personal and administrator workspaces from the avatar menu.
- Android checks for updates after startup at most once per successful 24-hour window. A failed automatic check uses a one-hour retry backoff.
- Manual checks always bypass the automatic-check interval.
- Automatic checks never download an APK and never block login, navigation, administration, or logout.
- Every update is optional. The first release has no minimum-version or forced-update policy.
- APK download happens only after explicit user confirmation.
- Android always shows the operating system package installer; silent installation is neither attempted nor represented as supported.
- The release source is the public Gitee repository `linsource/linai-desktop-release` using Android-specific tags and assets.
- Android release signing uses a new dedicated Android keystore. The existing Tauri/minisign key provides an additional artifact signature and does not replace APK signing.
- Release-keystore passwords, the minisign private key, and the Gitee token remain outside Git. Passwords and the token are read from macOS Keychain during local release operations.

## Non-Goals

The first release does not include:

- Google Play, managed Play, MDM, or enterprise silent installation
- background or unattended APK downloads
- delta or patch updates
- multiple Android ABIs
- iOS updates
- forced updates or minimum-version enforcement
- backend or nginx update endpoints
- release-channel selection, staged rollout, or percentage rollout
- rollback to an older APK
- an Android replacement for the desktop Tauri updater plugin

## Release Topology

The existing public release repository hosts desktop and Android streams without mixing their fixed entry points.

| Purpose | Tag | Assets |
| --- | --- | --- |
| Versioned Android release | `android-v<version>` | release APK and APK minisign signature |
| Fixed Android index | `android-latest` | `android-latest.json` |
| Existing versioned desktop release | `desktop-v<version>` | desktop updater archive and signature |
| Existing fixed desktop index | `desktop-latest` | `latest.json` |

The Android client reads only:

```text
https://gitee.com/linsource/linai-desktop-release/releases/download/android-latest/android-latest.json
```

Publishing always uploads and publicly verifies the versioned APK and signature before replacing `android-latest.json`. A failed versioned upload therefore cannot advertise an unavailable update.

## Manifest Contract

`android-latest.json` has one supported target, `android-aarch64`:

```json
{
  "version": "0.1.5",
  "version_code": 1005,
  "notes": "Update notes as plain text.",
  "pub_date": "2026-08-03T00:00:00.000Z",
  "platforms": {
    "android-aarch64": {
      "url": "https://gitee.com/linsource/linai-desktop-release/releases/download/android-v0.1.5/LinAI_0.1.5_arm64-release.apk",
      "bytes": 180824752,
      "sha256": "lowercase hexadecimal SHA-256",
      "signature": "minisign signature over the exact APK bytes"
    }
  }
}
```

The client rejects the manifest before showing an update when any of these conditions is true:

- the response is not a plain JSON object with the exact required value types
- `version` is not a supported numeric dotted version
- `version_code` is not a positive integer greater than the installed code
- `pub_date` is not a valid timestamp
- `notes` exceeds the bounded plain-text length
- the platform entry is absent
- the URL is not HTTPS, is not hosted by `gitee.com`, or is not under the configured release repository
- `bytes` is not a positive safe integer
- SHA-256 is not 64 lowercase hexadecimal characters
- the minisign signature is empty or malformed

`version_code` is authoritative for Android ordering. `version` is displayed to users and must match the APK version name. A version code is never reused for different bytes.

## Component Boundaries

### TypeScript Update Coordinator

A focused Android updater module owns:

- manifest retrieval through the existing Tauri HTTP plugin
- strict manifest decoding and URL policy
- installed-version comparison
- automatic-check timestamps and one-hour failure backoff
- manual-check behavior
- update state exposed to the mobile shell
- progress-event normalization and user-facing error mapping

The module runs only when the platform is Android. It must not import or initialize the desktop updater plugin. Desktop capabilities and `desktop-updater.ts` remain intact.

### Rust Artifact Verifier

A mobile-only Rust command verifies the completed file without loading it fully into memory:

- exact byte count
- SHA-256 digest
- minisign signature using the already trusted updater public key

The verifier receives validated expectations from the coordinator but treats them as untrusted input. It opens only a path returned by the Android download plugin inside the application's update cache. It returns structured success or a bounded error code and never returns file contents, secrets, or raw cryptographic errors to the UI.

### Android Native Plugin

A small Tauri Android plugin owns OS-specific operations:

- stream the APK into an application-owned update directory
- emit bounded progress events
- cancel a pending download and delete its partial file
- report storage exhaustion distinctly
- inspect archive package metadata before installation
- compare the archive package name with `ai.lin.android`
- require an archive version code greater than the installed version code
- compare the archive signing certificate with the currently installed application's certificate
- open the per-app unknown-source settings screen when permission is missing
- expose a content URI through the existing `FileProvider`
- open the Android package installer with temporary read permission

The plugin never accepts an arbitrary caller-provided destination path. Filenames are generated from the validated version and a fixed suffix. All path containment checks use canonical paths.

## Update Data Flow

1. The mobile layout mounts after authentication and reads the last automatic check record.
2. If the successful-check time is less than 24 hours old, or the failed-check backoff is less than one hour old, no automatic request is sent.
3. Otherwise the coordinator downloads and decodes the small fixed manifest.
4. When no newer code exists, the successful-check timestamp is saved and no interrupting UI appears.
5. When a newer code exists, the coordinator stores only the validated update metadata, marks the avatar entry, and renders a non-blocking notice in the mobile shell.
6. The user opens the update sheet and selects `Download and install`.
7. The native plugin streams the APK to the application update directory and emits progress. No APK bytes pass through the WebView.
8. Rust verifies the byte count, SHA-256, and minisign signature.
9. The native plugin verifies package name, higher version code, and certificate continuity.
10. If unknown-source permission is missing, the plugin opens the LinAI-specific Android settings page and preserves the verified pending path.
11. On return, the user selects install again without another download. The plugin rechecks file presence and metadata before opening the package installer.
12. Android performs the final same-signing-certificate enforcement and asks the user to confirm installation.

Any failed cryptographic or package-identity check deletes the completed APK immediately. A verified APK canceled at the Android installer may be reused for up to 24 hours and is then removed.

## Mobile Interface

The avatar popover gains one Android-only `Check for updates` command for both ordinary and administrator users. It does not appear in desktop account menus.

Automatic discovery does not open a modal. It adds:

- a small state indicator on the avatar/update command
- a non-blocking update notice above the current mobile route content

Selecting the command or notice opens a mobile bottom sheet containing:

- installed version
- available version
- release date
- APK size
- bounded plain-text release notes
- primary `Download and install` command
- secondary `Remind me later` command

The sheet has explicit states:

```text
checking
up-to-date
available
downloading
verifying
permission-required
ready-to-install
error
```

Downloading shows a stable progress bar, downloaded bytes, total bytes, and a cancel command. Verification cannot be canceled after it begins because it is a short local operation. The sheet and mobile shell keep their dimensions stable as labels and progress change.

The optional update never blocks the underlying routes. Hardware Back closes the update sheet before navigating route history, following the existing mobile layer behavior.

## Error And Recovery Policy

- Automatic network or manifest failures remain silent and set a one-hour retry backoff.
- Manual failures show a generic, actionable message and a retry command.
- Raw server responses, URLs containing credentials, local paths, signature material, and exception internals never reach visible text or logs.
- A malformed or untrusted manifest never produces an available-update state.
- A connection failure deletes a partial file unless the native downloader can prove a safe same-release resume record. Resume support is optional for the first release; partial-file reuse is not.
- User cancellation removes the partial file and returns to `available`.
- Storage exhaustion reports the required download size and removes the partial file.
- Byte-count, SHA-256, minisign, package-name, version-code, or certificate failure deletes the file and enters a non-retry-by-install security error. A fresh download is required.
- Unknown-source permission denial keeps a previously verified APK for up to 24 hours and permits retry from the update sheet.
- Canceling the Android package installer keeps the verified APK for up to 24 hours.
- Startup cleanup removes partial files, files for other versions, failed-verification files, and completed APKs older than 24 hours.

## Android Signing

Android package signing and updater artifact signing are separate trust layers.

### APK Release Keystore

A dedicated release keystore is generated once with:

- path `~/.tauri/linai-android-release.jks`
- alias `linai-android-release`
- RSA-4096 key
- SHA-256 signature algorithm
- validity long enough for the supported product lifetime
- file mode `0600`

The keystore path may be configured outside the repository. Store and key passwords are random values saved in macOS Keychain under stable LinAI-specific service/account names. The release build wrapper reads those values at runtime and injects them into Gradle's process environment. It never prints them or places them in command arguments.

The tracked Gradle configuration fails a release build when the path, alias, or either password is absent. It never silently falls back to the debug keystore.

The keystore and its credentials require a separate encrypted offline backup. Losing this keystore permanently prevents future APKs from updating existing installations.

### APK Minisign Signature

The existing Tauri updater private key remains outside Git and signs the exact release APK bytes. Its corresponding public key is already part of the trusted application configuration and is reused by the mobile Rust verifier.

The supplied private-key material is treated as updater-signing material, not as an Android keystore. It is stored only in the configured private-key file with mode `0600` after deriving and confirming that its public key matches the committed updater public key. A mismatch aborts publishing.

### Gitee Token

The publisher reads the Gitee token from macOS Keychain and injects it into the existing publisher process. The token is never embedded in the application or update assets. Because a token was provided through chat, it must be rotated after the initial publication and the replacement saved to Keychain.

## Build And Publish Commands

The desktop package scripts gain Android release commands without changing the existing debug command:

- `pnpm android:release`
  - synchronize launcher resources
  - read signing credentials from Keychain or explicitly supported CI environment variables
  - build the ARM64 release APK
  - verify non-debuggable manifest state, package identity, version, certificate, APK signature, and ZIP alignment
- `pnpm android:manifest -- --notes "..."`
  - locate exactly one verified release APK
  - generate the APK minisign signature
  - compute exact bytes and SHA-256
  - write `android-latest.json`
- `pnpm android:publish`
  - re-run local artifact validation
  - create or update `android-v<version>`
  - replace the versioned APK and `.sig` assets
  - verify both versioned assets without a token
  - create or update `android-latest`
  - replace `android-latest.json` only after versioned verification
  - fetch the final manifest and APK headers anonymously and require public success

Publishing aborts for a debug APK, a debuggable application, an unexpected package name, an unapproved signing certificate, version disagreement, a non-incrementing code, missing signature, asset mismatch, or non-public URL.

The three application versions remain synchronized in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. Android's numeric code follows the existing `major * 1,000,000 + minor * 1,000 + patch` convention represented by `0.1.4 -> 1004` and `0.1.5 -> 1005`.

## Bootstrap And First Update

The current debug APK and the new release APK have different Android certificates and cannot update each other.

The first end-to-end acceptance sequence is therefore:

1. Build the updater-capable source as release-signed `0.1.4` / code `1004` and preserve it as the bootstrap APK.
2. Uninstall the existing debug-signed `ai.lin.android` from the test phone.
3. Manually install the release-signed `0.1.4` bootstrap APK.
4. Bump all tracked application versions to `0.1.5` and code `1005`.
5. Build, sign, manifest, publish, and publicly verify `android-v0.1.5` and `android-latest`.
6. Use the bootstrap application to discover `0.1.5`, download it, verify it, grant unknown-source permission, and open the system installer.
7. Confirm Android performs an in-place update rather than requiring uninstall.
8. Confirm the installed version is `0.1.5`, the session remains available, launcher icons are correct, and personal/administrator navigation still works.

The bootstrap APK is a test and recovery artifact. The fixed public manifest advertises only `0.1.5` after publication.

## Security Requirements

- No secret key, password, token, Keychain output, or private file content is committed, printed, bundled, logged, or returned to the WebView.
- The client accepts only the fixed Gitee release repository over HTTPS.
- Update metadata is decoded before use and never interpolated into an unrestricted path or shell command.
- The APK must pass both minisign verification and Android certificate continuity. SHA-256 and byte count are additional integrity and audit checks, not the sole authenticity control.
- The native plugin exposes only fixed update operations and app-owned paths. It is not a general downloader or arbitrary-file opener.
- The installer intent grants read access only to the selected APK content URI.
- The package name and higher version code are verified before the installer opens.
- The application never requests device-owner privileges, accessibility privileges, root access, or silent-install capabilities.
- Update failures do not alter authentication tokens, API configuration, workspace selection, or business data.

## Testing

### TypeScript

- strict manifest acceptance and rejection cases
- version-name and version-code consistency
- URL repository policy
- 24-hour successful-check interval
- one-hour failure backoff
- manual-check bypass
- automatic failure silence
- state transitions and progress normalization
- user-visible error redaction

### Vue

- Android-only avatar entry in both workspaces
- no updater entry on desktop
- non-blocking automatic-update notice
- bottom-sheet accessibility and hardware Back behavior
- all check, download, verify, permission, install, cancel, retry, and error states
- stable layout for long Chinese notes and progress values
- no regression in personal/admin workspace switching or logout

### Rust

- valid minisign fixture
- invalid signature
- modified APK fixture
- byte-count and SHA mismatch
- path-containment rejection
- structured, non-sensitive errors

Tests use generated test keys and small fixtures. Production private keys never enter the test suite.

### Kotlin And Android

- app-owned destination enforcement
- progress and cancellation cleanup
- storage-exhaustion handling
- package-name mismatch
- non-incrementing version code
- signing-certificate mismatch
- permission-required and permission-granted branches
- `FileProvider` URI and installer intent flags
- stale verified-file cleanup

Pure validation is covered by JVM tests. Permission, package installer, and process-resume behavior require an Android device or emulator and remain explicitly unavailable when neither exists.

### Release Tooling

- consistent versions and numeric code
- Keychain lookup failure without secret output
- no debug-signing fallback
- exactly one ARM64 release artifact
- deterministic manifest fields apart from publication time
- signature and checksum match the exact uploaded APK
- versioned assets publish before the fixed manifest
- public anonymous asset checks
- desktop release scripts and manifest remain unchanged

## Verification Gates

Before publishing:

```text
pnpm test:run
pnpm build
pnpm exec tauri build --debug --no-bundle --ci
./gradlew clean
pnpm android:release
git diff --check
```

The final APK audit records:

- absolute artifact path
- exact bytes and SHA-256
- version name and code
- only `arm64-v8a` native libraries
- `android:debuggable=false`
- release signing certificate SHA-256
- APK signing schemes and signer count
- ZIP alignment result
- manifest package, installer permission, provider, launcher, and round launcher resources
- 15 packaged launcher PNG decode and pixel comparisons
- APK minisign verification
- anonymous Gitee manifest, APK, and signature availability

Rendered browser regression retains the existing 360, 390, and 412 CSS pixel mobile coverage and desktop-isolation coverage. Native acceptance additionally checks cold start, update discovery, progress, cancellation, permission return, system Back, in-place update, session preservation, personal routes, administrator switching/routes, logout, safe areas, IME behavior, and installed launcher appearance.

## Acceptance Criteria

- Android automatically checks no more than once per successful 24-hour window and allows unlimited manual checks.
- Automatic checks never download, interrupt, or block application use.
- Both personal and administrator avatar menus expose the same Android update command.
- A validated newer release displays version, size, date, notes, and an explicit download command.
- APK bytes never pass through WebView memory.
- Download cancellation and every failed security check clean up unsafe files.
- Only an APK from the fixed Gitee repository, signed by the updater key and the current Android release certificate, with package `ai.lin.android` and a higher version code, reaches the system installer.
- Missing unknown-source permission follows the system authorization flow and reuses the verified file on return.
- The Android system installer always requires user confirmation.
- Desktop updater behavior, endpoint, release tags, and UI remain unchanged.
- Release credentials remain outside Git and logs, and release builds never fall back to debug signing.
- The `0.1.4` release-signed bootstrap installs manually and updates in place to public `0.1.5` on a real phone.
- All automated, build, package, public-asset, browser, and available native-device checks pass; unavailable native checks are reported as unavailable rather than inferred.
