# Desktop updater

The desktop app uses the official Tauri updater plugin. The app checks Gitee
Releases directly:

```text
https://gitee.com/linsource/linai-desktop-release/releases/download/desktop-latest/latest.json
```

No nginx or backend update endpoint is required. Gitee hosts both the static
`latest.json` manifest and the signed updater package.

## Signing key

The updater public key is committed in `src-tauri/tauri.conf.json`. The private
key must stay secret.

This machine already has a private key at:

```text
~/.tauri/linai-updater.key
```

For CI, store the private key as `TAURI_SIGNING_PRIVATE_KEY`. If the key has a
password, also set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Locally,
`pnpm bundle:macos` reads `TAURI_SIGNING_PRIVATE_KEY_PATH` when
`TAURI_SIGNING_PRIVATE_KEY` is not already set.

## Gitee release flow

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json`.
2. Build signed updater artifacts:

```sh
pnpm bundle:macos
```

3. Upload the updater package and signature to a desktop-specific Gitee Release,
   for example `desktop-v0.1.3`:

```text
src-tauri/target/release/bundle/macos/LinAI.app.tar.gz
src-tauri/target/release/bundle/macos/LinAI.app.tar.gz.sig
```

4. Generate `latest.json`. By default the script uses repo
   `linsource/linai-desktop-release` and tag `desktop-v<version>`:

```sh
pnpm updater:manifest -- --notes "更新说明"
```

If the Gitee repo path is different, pass it explicitly:

```sh
pnpm updater:manifest -- --gitee-repo <owner>/<repo> --notes "更新说明"
```

5. Upload `latest.json` to the fixed Gitee Release tag `desktop-latest`.

The client always reads the fixed manifest URL. The manifest points at the
actual versioned package URL, so every release only needs Gitee:

```text
https://gitee.com/<owner>/<repo>/releases/download/desktop-latest/latest.json
https://gitee.com/<owner>/<repo>/releases/download/desktop-v0.1.3/LinAI.app.tar.gz
```

Backend release tags can continue to follow upstream, such as `v0.1.3`. Desktop
release tags are separate, such as `desktop-v0.1.3`, so the two release streams
do not overwrite or depend on each other.

## Windows updater artifacts

Windows has two different installers:

- `LinAI-<version>-windows-<arch>-setup.exe` is the branded wrapper for first
  installs and manual repair.
- `LinAI-<version>-windows-<arch>-updater.exe` plus its `.sig` is the native
  Tauri NSIS payload used by the in-app updater.

Do not publish the branded wrapper as an updater package. Build signed x64 and
x86 artifacts with:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$HOME\.tauri\linai-updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<private-key-password>"
pnpm bundle:windows:x64
pnpm bundle:windows:x86
```

For an empty private-key password, set the variable explicitly with
`$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""`.

For the complete Windows build, validation, Gitee upload, manifest replacement,
and public download verification flow, also set `GITEE_TOKEN` and run:

```powershell
pnpm release:windows -- --notes "release notes"
```

Use `pnpm release:windows -- --validate-only` to validate the current local and
public artifacts without rebuilding or uploading.

If macOS has not published the same version yet, use
`pnpm release:windows -- --assets-only --notes "release notes"`. This still
builds, signs, uploads, and publicly verifies the Windows assets, but leaves the
shared `desktop-latest/latest.json` unchanged. Run the normal command after the
matching macOS release is available to activate automatic updates.

Each command copies the native signed updater package into `dist-windows/` and
adds its platform to `latest.json`. When `latest.json` already has the same
version, existing macOS and Windows platform entries are preserved.

The Windows NSIS installer stores the selected install directory under
`HKLM\Software\lin\LinAI`. Before downloading an update, the app verifies that
this value resolves to the directory containing the running `LinAI.exe`. The
NSIS update hook checks the value again and forces `$INSTDIR` to it. If the
value is absent or mismatched, the update aborts instead of falling back to
`C:\Program Files\LinAI`; use the branded full installer to repair that case.

## Notes

- The Gitee repository and release assets must be publicly accessible, otherwise
  coworkers' apps cannot download updates.
- The fixed `desktop-latest` release can be reused for every version by replacing
  its `latest.json` asset.
- The versioned desktop release tags, such as `desktop-v0.1.3`, should keep the
  package and `.sig` file for rollback and auditability.

## Android updater

Android uses a separate optional updater flow. Its fixed public manifest is:

```text
https://gitee.com/linsource/linai-desktop-release/releases/download/android-latest/android-latest.json
```

The manifest accepts only `android-aarch64` and APK URLs under the versioned
`android-v<version>` release in that exact public repository. It contains the
semantic version, monotonically increasing version code, release notes,
publication date, exact byte count, lowercase SHA-256, and a minisign signature
over the exact APK bytes.

The client enforces four independent boundaries before opening Android's system
installer:

1. TypeScript rejects malformed manifests, credentials in URLs, other hosts,
   unexpected paths, and non-increasing version codes.
2. Kotlin downloads only to `cache/linai-updates`, keeps incomplete data as
   `.partial`, and never accepts a caller-selected destination.
3. Rust canonicalizes the path inside that cache and streams byte count,
   SHA-256, and minisign verification.
4. Kotlin inspects the archive package, requires a higher version code and the
   same Android signing certificate as the installed app, then grants read-only
   access to that APK through `FileProvider`.

Automatic checks run at most once per successful 24-hour window; failed checks
use a one-hour backoff. Manual checks bypass cadence. Neither path downloads an
APK or blocks login and navigation. Download starts only after explicit consent,
and installation always remains an Android system confirmation.

The Android release keystore and updater minisign private key have different
roles and must both remain recoverable. Release assets are published to
`android-v<version>` and anonymously verified before the fixed
`android-latest` manifest is replaced. See [RELEASE.md](./RELEASE.md) for the
bootstrap and publication runbook.
