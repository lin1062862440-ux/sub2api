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

Gitee 私人令牌通过 stdin 写入 Keychain，不要写进代码、文档或命令参数：

```sh
read -rs LINAI_GITEE_SECRET
printf %s "$LINAI_GITEE_SECRET" | swift tools/keychain-secret.swift set ai.lin.release gitee-token
unset LINAI_GITEE_SECRET
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

## Windows 自动更新发包

Windows 发包会生成两类文件，不能混用：

- `LinAI-<version>-windows-<arch>-setup.exe`：带安装界面的完整安装包，用于首次安装或修复。
- `LinAI-<version>-windows-<arch>-updater.exe` 和对应 `.sig`：Tauri 原生 NSIS 更新包，用于客户端内自动更新。

先在 PowerShell 中配置私钥路径和私钥密码。私钥及密码不能写进仓库：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$HOME\.tauri\linai-updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "你的私钥密码"
$env:GITEE_TOKEN = "你的 Gitee 私人令牌"
```

推荐使用一键发布命令：

```powershell
pnpm release:windows -- --notes "本次桌面端更新说明"
```

该命令会依次检查五处版本号、下载同版本远端 `latest.json`、保留 macOS
条目、构建并签名 x64/x86、校验产物和安装目录保护、上传版本资产、最后
更新 `desktop-latest`，并从公网回下载 updater 做 SHA-256 验证。远端
`latest.json` 与本地版本不一致时会停止，避免覆盖其他版本的清单。

只验证当前已发布版本和本地产物，不重建、不上传：

```powershell
pnpm release:windows -- --validate-only
```

如果 macOS 尚未发布同版本，只发布并验证 Windows 版本资产，不更新共享的
`desktop-latest/latest.json`：

```powershell
pnpm release:windows -- --assets-only --notes "本次桌面端更新说明"
```

该模式用于不同平台无法同步构建的情况。Windows 安装包会出现在
`desktop-v<version>`，但旧客户端不会自动收到该版本。macOS 同版本资产就绪后，
再运行不带 `--assets-only` 的普通发布命令，合并所有平台并激活自动更新。

需要单独排查某个架构时，仍可使用底层构建命令：

```powershell
pnpm bundle:windows:x64
pnpm bundle:windows:x86
```

脚本会执行以下检查：

- 没有签名私钥，或加密私钥未设置密码环境变量时直接失败；空密码需要显式设置为空字符串。
- 原生 NSIS 更新包没有生成 `.sig` 时直接失败。
- 生成的 NSIS 脚本没有包含安装目录保护时直接失败。
- 自动把 `windows-x86_64` 或 `windows-i686` 合并到同版本的 `latest.json`。

将 `dist-windows` 中的 `*-updater.exe` 和 `.sig` 上传到
`desktop-v<version>`。完整的 `*-setup.exe` 可以一并上传供手动安装，但
`latest.json` 必须指向 `*-updater.exe`，不能指向外层完整安装包。

Windows 首次安装时，内层 NSIS 会把用户选择的目录记录在：

```text
HKLM\Software\lin\LinAI
```

自动更新前，客户端会比较该记录与当前 `LinAI.exe` 所在目录。更新安装器还会再次
读取并锁定该目录。记录缺失或目录不一致时，更新会停止，不会回退安装到
`C:\Program Files\LinAI`。此时应使用完整的 `*-setup.exe` 修复安装记录。

实机验证时必须从非默认目录测试，例如先把旧版安装到：

```text
D:\Applications\LinAI
```

更新完成后确认新版 `LinAI.exe` 仍位于该目录，并确认
`C:\Program Files\LinAI` 没有被新建。

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

## Android ARM64 发包

Android release 使用两套互不替代的密钥：

- `~/.tauri/linai-android-release.jks` 给 Android Package Manager 验证 APK 签名连续性，alias 固定为 `linai-android-release`。
- Tauri/minisign updater 私钥给应用内下载器验证 APK 精确字节，对应公钥已编入客户端。

Gitee token 只负责上传公开 Release，不参与 APK 身份或字节签名。三类秘密都不能提交、打印、写进命令参数或打进 WebView。

### 一次性密钥准备

在 `clients/desktop` 下生成 RSA-4096 Android keystore。密码从终端静默读取并通过环境传给 `keytool`，不会进入 shell history：

```sh
mkdir -p ~/.tauri
read -rs LINAI_STORE_SECRET
read -rs LINAI_KEY_SECRET
export LINAI_STORE_SECRET LINAI_KEY_SECRET
keytool -genkeypair -v \
  -keystore ~/.tauri/linai-android-release.jks \
  -storepass:env LINAI_STORE_SECRET \
  -keypass:env LINAI_KEY_SECRET \
  -alias linai-android-release \
  -keyalg RSA -keysize 4096 -validity 10000
printf %s "$LINAI_STORE_SECRET" | swift tools/keychain-secret.swift set ai.lin.android.release store-password
printf %s "$LINAI_KEY_SECRET" | swift tools/keychain-secret.swift set ai.lin.android.release key-password
unset LINAI_STORE_SECRET LINAI_KEY_SECRET
chmod 600 ~/.tauri/linai-android-release.jks
```

`keytool` 会交互询问证书名称等非秘密字段。生成后记录证书 SHA-256，但不要记录密码：

```sh
keytool -list -v -keystore ~/.tauri/linai-android-release.jks -alias linai-android-release
```

在发布任何 APK 前，把 keystore 复制到离线介质并使用 `openssl enc -aes-256-cbc -pbkdf2 -salt` 加密；恢复演练必须确认 alias 和证书 SHA-256 与原件一致。丢失 keystore 后无法对已安装应用做原地升级。

把 updater 私钥和 Gitee token 通过 stdin 存入 Keychain：

```sh
read -rs LINAI_UPDATER_SECRET
printf %s "$LINAI_UPDATER_SECRET" | swift tools/keychain-secret.swift set ai.lin.release updater-private-key
unset LINAI_UPDATER_SECRET

read -rs LINAI_GITEE_SECRET
printf %s "$LINAI_GITEE_SECRET" | swift tools/keychain-secret.swift set ai.lin.release gitee-token
unset LINAI_GITEE_SECRET
```

CI 可改用同名环境变量；本机流程优先读取环境，缺失时读取 Keychain。发布后若 token 曾进入聊天或其他不受控位置，应在 Gitee 立即轮换，并把新值重新写入 Keychain。

### 首次 bootstrap：0.1.4

首次验收必须先保持三个版本文件均为 `0.1.4`：

```text
package.json
src-tauri/Cargo.toml
src-tauri/tauri.conf.json
```

然后构建：

```sh
pnpm android:release
```

wrapper 只接受一个 release-signed ARM64 APK，并检查 `apksigner`、ZIP alignment、package `ai.lin.android`、version `0.1.4`、code `1004`、`debuggable=false` 和仅 `arm64-v8a`。产物必须保留在：

```text
release/android/0.1.4/LinAI_0.1.4_arm64-release.apk
```

此时不要生成或发布 `android-latest.json`。手机若已装 debug 签名的同包名应用，只卸载该 debug 版本，然后安装 bootstrap；确认启动器 logo、登录、个人空间和管理空间正常。

### 发布 0.1.5

把上述三个版本文件同时改成 `0.1.5`，先验证，再依次执行：

```sh
pnpm test:run
pnpm build
pnpm android:release
pnpm android:manifest -- --notes "Android 更新功能与稳定性改进"
pnpm android:publish
```

`android:manifest` 核对三个版本、APK package/name/code，计算精确 byte count 与 SHA-256，对 APK 精确字节生成 minisign 签名并用内置公钥反向验证。输出位于：

```text
release/android/0.1.5/LinAI_0.1.5_arm64-release.apk
release/android/0.1.5/LinAI_0.1.5_arm64-release.apk.sig
release/android/0.1.5/android-latest.json
```

`android:publish` 固定按以下顺序执行，任一匿名验证失败都会停止：

1. 替换 `android-v0.1.5` 的 APK 和 `.sig`。
2. 匿名下载并核对 byte count、SHA-256 和签名文本。
3. 替换 `android-latest` 的 `android-latest.json`。
4. 匿名读取固定 manifest，并再次访问 manifest 指向的 APK。

### 手机原地升级验收

从已安装的 release-signed `0.1.4` 手动检查更新。先取消一次下载并确认没有残留 `.partial`，再重新下载；按提示允许 LinAI 安装未知应用，返回应用后继续打开 Android 系统安装器。不能卸载旧版，安装完成后应显示 `0.1.5`，同时保留登录会话。

最后验证个人/管理空间、退出登录、系统 Back、输入法和安全区、桌面 launcher logo。交付记录必须包含 APK 绝对路径、大小、SHA-256、version/code、ABI、debuggable、证书 SHA-256、签名 scheme、signer count、ZIP alignment、permission/provider、launcher PNG、minisign 验证、公开 URL 和手机验收结果。

若用户拒绝“安装未知应用”，重新点击继续安装会回到授权提示，不需要重新下载。若系统安装器被取消，验证后的 APK 可再次打开；超过 24 小时或版本变化后由客户端清理。
