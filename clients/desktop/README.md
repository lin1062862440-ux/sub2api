# LinAI Desktop

LinAI's shared Tauri desktop client. The first supported bundle target is macOS; business code remains platform-neutral so Windows support can reuse the same Vue and Rust sources.

## Development

```bash
pnpm install
pnpm dev
```

The API origin is defined once in `src/host.js`.

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
pnpm brand:sync
pnpm tauri build --bundles app,dmg
```
