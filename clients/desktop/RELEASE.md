# LinAI Desktop 发包流程

本文档给负责桌面客户端发包的人使用。当前桌面端使用 Tauri updater，
更新文件托管在公开 Gitee 仓库，不依赖后端、不依赖 nginx。

## 当前发布策略

- 源码仓库：`linsource/sub2api`
  - 可以保持私有。
  - 后端 tag 可以继续跟 upstream 走，例如 `v0.1.3`。
- 桌面更新仓库：`linsource/linai-desktop-release`
  - 必须公开，否则同事的客户端无法下载更新。
  - 只放桌面更新包和 `latest.json`，不放源码。
- 桌面版本 tag：`desktop-v<version>`
  - 示例：`desktop-v0.1.3`
  - 放真实更新包和签名文件。
- 桌面固定索引 tag：`desktop-latest`
  - 永远只放 `latest.json`。
  - 客户端每次检查更新都会读取这个固定地址。

客户端当前检查更新地址：

```text
https://gitee.com/linsource/linai-desktop-release/releases/download/desktop-latest/latest.json
```

## 发包前准备

需要本机具备：

- Node.js / pnpm
- Rust / Cargo
- Tauri CLI 依赖
- macOS 打包环境
- Tauri updater 私钥
- Gitee 私人令牌

Tauri updater 私钥默认读取：

```text
~/.tauri/linai-updater.key
```

如果私钥在其他路径，发包前设置：

```sh
export TAURI_SIGNING_PRIVATE_KEY_PATH=/path/to/linai-updater.key
```

Gitee 私人令牌只在当前 shell 里设置，不要写进代码或文档：

```sh
export GITEE_TOKEN=你的_Gitee_私人令牌
```

令牌需要有创建 Release、更新 Release、上传附件、删除附件的权限。

## 1. 修改版本号

假设这次发布 `0.1.4`，需要同时修改这三个文件：

```text
clients/desktop/package.json
clients/desktop/src-tauri/Cargo.toml
clients/desktop/src-tauri/tauri.conf.json
```

都改成同一个版本号：

```text
0.1.4
```

不要只改一个地方。Tauri updater 会用 app 内部版本和 `latest.json` 的版本做比较。

## 2. 本地验证

进入 desktop client 目录：

```sh
cd clients/desktop
```

跑一次关键测试：

```sh
pnpm test:run src/layouts/AppLayout.spec.ts
```

跑前端构建：

```sh
pnpm build
```

## 3. 打 macOS 更新包

```sh
pnpm bundle:macos
```

成功后会生成这些核心产物：

```text
src-tauri/target/release/bundle/macos/LinAI.app.tar.gz
src-tauri/target/release/bundle/macos/LinAI.app.tar.gz.sig
src-tauri/target/release/bundle/dmg/LinAI_<version>_aarch64.dmg
```

其中 updater 真正需要的是：

```text
LinAI.app.tar.gz
LinAI.app.tar.gz.sig
```

`dmg` 是给用户手动安装用的完整安装包。

## 4. 生成 latest.json

```sh
pnpm updater:manifest -- --notes "本次更新说明"
```

默认会生成：

```text
clients/desktop/latest.json
```

默认包地址会指向：

```text
https://gitee.com/linsource/linai-desktop-release/releases/download/desktop-v<version>/LinAI.app.tar.gz
```

检查 `latest.json` 里至少要确认：

- `version` 是本次版本号。
- `platforms.darwin-aarch64.url` 指向 `desktop-v<version>`。
- `signature` 不是空的。

## 5. 上传版本包到 Gitee

上传真实更新包到版本 tag，例如 `desktop-v0.1.4`：

```sh
node tools/publish-gitee-release.mjs \
  --repo linsource/linai-desktop-release \
  --tag desktop-v0.1.4 \
  --name "LinAI Desktop 0.1.4" \
  --body "LinAI Desktop 0.1.4" \
  --file src-tauri/target/release/bundle/macos/LinAI.app.tar.gz \
  --file src-tauri/target/release/bundle/macos/LinAI.app.tar.gz.sig
```

这个脚本会：

- 如果 Release 不存在，就创建。
- 如果 Release 已存在，就更新。
- 如果同名附件已存在，就先删除旧附件再上传新附件。

## 6. 上传 latest.json 到固定 tag

```sh
node tools/publish-gitee-release.mjs \
  --repo linsource/linai-desktop-release \
  --tag desktop-latest \
  --name "LinAI Desktop Latest" \
  --body "Latest LinAI Desktop updater manifest." \
  --file latest.json
```

`desktop-latest` 是客户端固定读取的 tag。每次发新版都覆盖这里的
`latest.json`。

## 7. 公开访问验证

不用 token 验证 `latest.json`：

```sh
curl -fsSL \
  https://gitee.com/linsource/linai-desktop-release/releases/download/desktop-latest/latest.json \
  -o /tmp/linai-latest.json

node -e "const j=require('/tmp/linai-latest.json'); console.log(j.version, j.platforms['darwin-aarch64'].url)"
```

不用 token 验证更新包：

```sh
curl -I -L \
  https://gitee.com/linsource/linai-desktop-release/releases/download/desktop-v0.1.4/LinAI.app.tar.gz
```

不用 token 验证签名文件：

```sh
curl -I -L \
  https://gitee.com/linsource/linai-desktop-release/releases/download/desktop-v0.1.4/LinAI.app.tar.gz.sig
```

最终应该能看到 `200 OK`。如果是 `403 Forbidden`，说明仓库或附件不是公开可访问，
客户端更新会失败。

## 8. 验证客户端更新

安装旧版本客户端后，打开：

```text
设置 -> 检查更新
```

点击检查更新。若旧版本号小于 `latest.json` 的 `version`，应提示发现新版本。

注意：如果某个旧客户端里编进去的还是旧的私有仓库或云服务器地址，它需要先手动安装
一次新的 dmg。安装到新链路版本后，后续才能自动走
`linsource/linai-desktop-release`。

## 常见问题

### 是否需要把源码仓库公开？

不需要。源码仓库 `linsource/sub2api` 可以继续私有。只要公开
`linsource/linai-desktop-release` 这个更新仓库即可。

### 为什么要两个 tag？

`desktop-v<version>` 保存真实版本包，方便回滚和追踪。

`desktop-latest` 是固定入口，客户端不需要知道最新版本 tag 是什么，只读取固定
`latest.json`。

### 为什么发包后没有检测到更新？

常见原因：

- 客户端当前版本已经等于 `latest.json` 里的版本。
- 忘记同时修改三个版本号文件。
- `latest.json` 没上传到 `desktop-latest`。
- `latest.json` 里的包地址还指向旧仓库或旧 tag。
- 更新仓库不是公开访问。

### 可以只上传 dmg 吗？

不可以。Tauri updater 使用的是 `LinAI.app.tar.gz` 和 `.sig`。

`dmg` 只用于用户手动安装。

### 私钥要给所有同事吗？

不需要。普通用户和同事的客户端只需要公钥验证签名，不需要私钥。

只有负责发包、需要生成 `.sig` 的机器或 CI 才需要私钥。

## 发包后建议

- 不要把 `GITEE_TOKEN`、私钥、私钥密码写进仓库。
- 如果令牌曾经发到聊天或截图里，发完后去 Gitee 后台吊销并重建。
- 保留每个 `desktop-v<version>` Release 的包和 `.sig`，不要随意删除历史版本。
