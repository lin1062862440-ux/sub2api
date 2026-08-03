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

## Notes

- The Gitee repository and release assets must be publicly accessible, otherwise
  coworkers' apps cannot download updates.
- The fixed `desktop-latest` release can be reused for every version by replacing
  its `latest.json` asset.
- The versioned desktop release tags, such as `desktop-v0.1.3`, should keep the
  package and `.sig` file for rollback and auditability.
