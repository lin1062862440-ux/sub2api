# LinAI Desktop

LinAI's shared Tauri client for macOS and Android. Business code remains platform-neutral so Windows support can reuse the same Vue and Rust sources. Android intentionally omits desktop API-key replacement and floating usage windows.

## Development

```bash
pnpm install
pnpm dev
```

The API origin is defined once in `src/host.js`.

For deterministic login and dashboard screenshots without a backend account:

```bash
pnpm dev:visual
```

The visual fixture runs on `http://localhost:1421`; add `?screen=login#/login` to start signed out.

## Turnstile

When Turnstile is enabled, add `localhost` to the site key's Cloudflare Turnstile Hostname Management list. The packaged Tauri webview uses `tauri://localhost`; without this entry Cloudflare rejects the desktop widget with client error `110200` (domain not authorized).

## Branding

Refresh the bundled fallback logo and application icons from the configured LinAI deployment before packaging:

```bash
pnpm brand:sync
```

The command writes deterministic local assets, so normal builds do not require network access.

## Verification

```bash
pnpm test:run
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

## macOS Package

```bash
pnpm bundle:macos
```

The script refreshes LinAI branding and produces both `.app` and `.dmg` bundles. It defaults to an ad-hoc bundle signature for local distribution. Set `APPLE_SIGNING_IDENTITY` plus the standard Tauri notarization credentials to produce a Developer ID signed and notarized release.

## Android Package

Android release builds are ARM64-only, use a dedicated Android signing keystore, and are audited before being copied to `release/android/<version>/`:

```bash
pnpm android:release
pnpm android:manifest -- --notes "Android 更新功能与稳定性改进"
pnpm android:publish
```

The first in-app update acceptance run must preserve and install release-signed `0.1.4` before publishing `0.1.5`. See [RELEASE.md](./RELEASE.md) for credential setup and exact release order, and [UPDATER.md](./UPDATER.md) for the Android trust model.
