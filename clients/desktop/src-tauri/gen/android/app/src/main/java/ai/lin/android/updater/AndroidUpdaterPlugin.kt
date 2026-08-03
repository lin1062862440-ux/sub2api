package ai.lin.android.updater

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.StatFs
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import javax.net.ssl.HttpsURLConnection

@InvokeArg
class DownloadArgs {
    lateinit var version: String
    lateinit var url: String
    var bytes: Long = 0
    lateinit var onProgress: Channel
}

@InvokeArg
class PathArgs {
    lateinit var path: String
}

@InvokeArg
class CleanupArgs {
    var retainedVersion: String? = null
}

@TauriPlugin
class AndroidUpdaterPlugin(private val activity: Activity) : Plugin(activity) {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "linai-android-updater").apply { isDaemon = true }
    }
    private val operationLock = Any()
    private val preferences by lazy {
        activity.getSharedPreferences("linai-android-updater", Activity.MODE_PRIVATE)
    }
    @Volatile private var activeTask: Future<*>? = null
    @Volatile private var activeConnection: HttpsURLConnection? = null
    @Volatile private var activePartial: File? = null
    @Volatile private var cancelled = false

    private val updateRoot: File
        get() = File(activity.cacheDir, "linai-updates")

    @Command
    fun installedVersion(invoke: Invoke) {
        val info = installedPackageInfo()
        if (info == null) {
            reject(invoke, "package_info_unavailable")
            return
        }
        invoke.resolve(
            JSObject()
                .put("version", info.versionName ?: "")
                .put("versionCode", versionCode(info)),
        )
    }

    @Command
    fun download(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(DownloadArgs::class.java)
        } catch (_: Exception) {
            reject(invoke, "invalid_download")
            return
        }
        if (
            args.bytes <= 0 ||
            !AndroidUpdatePolicy.acceptsUrl(args.version, args.url)
        ) {
            reject(invoke, "invalid_download")
            return
        }

        synchronized(operationLock) {
            if (activeTask?.isDone == false) {
                reject(invoke, "download_busy")
                return
            }
            cancelled = false
            activeTask = executor.submit { runDownload(args, invoke) }
        }
    }

    @Command
    fun cancelDownload(invoke: Invoke) {
        cancelled = true
        activeConnection?.disconnect()
        activePartial?.delete()
        invoke.resolve()
    }

    @Command
    fun validateArchive(invoke: Invoke) {
        val path = parseContainedPath(invoke) ?: return
        val failure = archiveSecurityFailure(path)
        if (failure != null) {
            deleteUnsafe(path)
            reject(invoke, failure.code)
            return
        }
        preferences.edit().putLong(verifiedKey(path), System.currentTimeMillis()).apply()
        val status = if (canRequestPackageInstalls()) "ready" else "permission-required"
        invoke.resolve(JSObject().put("status", status))
    }

    @Command
    fun requestInstallPermission(invoke: Invoke) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || canRequestPackageInstalls()) {
            invoke.resolve()
            return
        }
        try {
            activity.startActivity(
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${activity.packageName}"),
                ),
            )
            invoke.resolve()
        } catch (_: Exception) {
            reject(invoke, "permission_settings_unavailable")
        }
    }

    @Command
    fun install(invoke: Invoke) {
        val path = parseContainedPath(invoke) ?: return
        val verifiedAt = preferences.getLong(verifiedKey(path), -1)
        if (
            verifiedAt < 0 ||
            AndroidUpdatePolicy.expired(verifiedAt, System.currentTimeMillis())
        ) {
            deleteUnsafe(path)
            reject(invoke, "verification_expired")
            return
        }
        val failure = archiveSecurityFailure(path)
        if (failure != null) {
            deleteUnsafe(path)
            reject(invoke, failure.code)
            return
        }
        if (!canRequestPackageInstalls()) {
            reject(invoke, "permission_required")
            return
        }

        try {
            val uri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                path,
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, APK_MIME_TYPE)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(intent)
            invoke.resolve()
        } catch (_: Exception) {
            reject(invoke, "installer_unavailable")
        }
    }

    @Command
    fun cleanup(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(CleanupArgs::class.java)
        } catch (_: Exception) {
            CleanupArgs()
        }
        executor.execute {
            cleanupFiles(args.retainedVersion)
            invoke.resolve()
        }
    }

    private fun runDownload(args: DownloadArgs, invoke: Invoke) {
        val root = try {
            updateRoot.apply { mkdirs() }.canonicalFile
        } catch (_: IOException) {
            reject(invoke, "storage_unavailable")
            return
        }
        val destination = try {
            File(root, AndroidUpdatePolicy.fileName(args.version)).canonicalFile
        } catch (_: Exception) {
            reject(invoke, "invalid_download")
            return
        }
        if (!contained(root, destination)) {
            reject(invoke, "unsafe_path")
            return
        }
        val partial = File(root, "${destination.name}.partial")
        activePartial = partial
        destination.delete()
        partial.delete()

        if (availableBytes(root) < args.bytes) {
            activePartial = null
            reject(invoke, "storage_full")
            return
        }

        try {
            val connection = openDownloadConnection(args.url)
            activeConnection = connection
            val responseCode = connection.responseCode
            if (responseCode !in 200..299) throw IOException("download response")
            val contentLength = connection.contentLengthLong
            if (contentLength >= 0 && contentLength != args.bytes) {
                throw SizeMismatchException()
            }

            var downloaded = 0L
            var lastProgressAt = 0L
            BufferedInputStream(connection.inputStream).use { input ->
                FileOutputStream(partial, false).use { output ->
                    val buffer = ByteArray(DOWNLOAD_BUFFER_BYTES)
                    while (true) {
                        if (cancelled || Thread.currentThread().isInterrupted) {
                            throw CancelledException()
                        }
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        downloaded += read
                        if (downloaded > args.bytes) throw SizeMismatchException()
                        val now = System.currentTimeMillis()
                        if (now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
                            sendProgress(args.onProgress, downloaded, args.bytes)
                            lastProgressAt = now
                        }
                    }
                    output.fd.sync()
                }
            }
            if (downloaded != args.bytes) throw SizeMismatchException()
            sendProgress(args.onProgress, downloaded, args.bytes)
            if (!partial.renameTo(destination)) throw IOException("rename failed")
            preferences.edit().remove(verifiedKey(destination)).apply()
            invoke.resolve(JSObject().put("path", destination.canonicalPath))
        } catch (_: CancelledException) {
            partial.delete()
            reject(invoke, "cancelled")
        } catch (_: SizeMismatchException) {
            partial.delete()
            reject(invoke, "size_mismatch")
        } catch (_: IOException) {
            partial.delete()
            reject(
                invoke,
                if (cancelled) {
                    "cancelled"
                } else if (availableBytes(root) < args.bytes) {
                    "storage_full"
                } else {
                    "download_failed"
                },
            )
        } catch (_: Exception) {
            partial.delete()
            reject(invoke, "download_failed")
        } finally {
            activeConnection?.disconnect()
            activeConnection = null
            activePartial = null
            synchronized(operationLock) { activeTask = null }
        }
    }

    private fun openDownloadConnection(value: String): HttpsURLConnection {
        var current = URI(value)
        repeat(MAX_REDIRECTS + 1) { redirectCount ->
            if (!isTrustedTransportUri(current)) throw IOException("untrusted redirect")
            val connection = current.toURL().openConnection() as HttpsURLConnection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive")
            val status = connection.responseCode
            if (status !in REDIRECT_CODES) return connection
            val location = connection.getHeaderField("Location") ?: throw IOException("redirect")
            connection.disconnect()
            if (redirectCount == MAX_REDIRECTS) throw IOException("too many redirects")
            current = current.resolve(location)
        }
        throw IOException("too many redirects")
    }

    private fun isTrustedTransportUri(uri: URI): Boolean {
        val host = uri.host ?: return false
        return uri.scheme == "https" &&
            uri.port == -1 &&
            uri.rawUserInfo == null &&
            (host == "gitee.com" || host.endsWith(".gitee.com"))
    }

    private fun sendProgress(channel: Channel, downloaded: Long, total: Long) {
        val progress = AndroidUpdatePolicy.progress(downloaded, total)
        channel.send(
            JSObject()
                .put("downloaded", progress.downloaded)
                .put("total", progress.total),
        )
    }

    private fun parseContainedPath(invoke: Invoke): File? {
        val raw = try {
            invoke.parseArgs(PathArgs::class.java).path
        } catch (_: Exception) {
            reject(invoke, "unsafe_path")
            return null
        }
        val root = try {
            updateRoot.canonicalFile
        } catch (_: IOException) {
            reject(invoke, "missing_file")
            return null
        }
        val file = try {
            File(raw).canonicalFile
        } catch (_: IOException) {
            reject(invoke, "missing_file")
            return null
        }
        if (!contained(root, file)) {
            reject(invoke, "unsafe_path")
            return null
        }
        if (!file.isFile || !file.name.endsWith(".apk")) {
            reject(invoke, "missing_file")
            return null
        }
        return file
    }

    private fun contained(root: File, file: File): Boolean =
        file.path.startsWith(root.path + File.separator) && file.parentFile == root

    private fun archiveSecurityFailure(path: File): SecurityFailure? {
        val archive = archivePackageInfo(path) ?: return SecurityFailure.PackageName
        val installed = installedPackageInfo() ?: return SecurityFailure.PackageName
        val archiveCertificate = signingCertificateDigest(archive) ?: return SecurityFailure.Certificate
        val installedCertificate = signingCertificateDigest(installed) ?: return SecurityFailure.Certificate
        return AndroidUpdatePolicy.validateIdentity(
            archive.packageName,
            versionCode(archive),
            archiveCertificate,
            activity.packageName,
            versionCode(installed),
            installedCertificate,
        )
    }

    @Suppress("DEPRECATION")
    private fun installedPackageInfo(): PackageInfo? = try {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            PackageManager.GET_SIGNATURES
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.packageManager.getPackageInfo(
                activity.packageName,
                PackageManager.PackageInfoFlags.of(flags.toLong()),
            )
        } else {
            activity.packageManager.getPackageInfo(activity.packageName, flags)
        }
    } catch (_: Exception) {
        null
    }

    @Suppress("DEPRECATION")
    private fun archivePackageInfo(path: File): PackageInfo? {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            PackageManager.GET_SIGNATURES
        }
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.packageManager.getPackageArchiveInfo(
                path.path,
                PackageManager.PackageInfoFlags.of(flags.toLong()),
            )
        } else {
            activity.packageManager.getPackageArchiveInfo(path.path, flags)
        }
    }

    @Suppress("DEPRECATION")
    private fun signingCertificateDigest(info: PackageInfo): ByteArray? {
        val certificate = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val signers = info.signingInfo?.apkContentsSigners ?: return null
            if (signers.size != 1) return null
            signers[0].toByteArray()
        } else {
            val signers = info.signatures ?: return null
            if (signers.size != 1) return null
            signers[0].toByteArray()
        }
        return MessageDigest.getInstance("SHA-256").digest(certificate)
    }

    @Suppress("DEPRECATION")
    private fun versionCode(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()

    private fun canRequestPackageInstalls(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.packageManager.canRequestPackageInstalls()

    private fun cleanupFiles(retainedVersion: String?) {
        val root = try {
            updateRoot.apply { mkdirs() }.canonicalFile
        } catch (_: IOException) {
            return
        }
        val retainedName = retainedVersion?.let {
            try {
                AndroidUpdatePolicy.fileName(it)
            } catch (_: IllegalArgumentException) {
                null
            }
        }
        val now = System.currentTimeMillis()
        root.listFiles()?.forEach { candidate ->
            val file = try {
                candidate.canonicalFile
            } catch (_: IOException) {
                return@forEach
            }
            if (!contained(root, file)) return@forEach
            val verifiedAt = preferences.getLong(verifiedKey(file), -1)
            val remove = file.name.endsWith(".partial") ||
                !file.name.matches(Regex("^linai-update-\\d+\\.\\d+\\.\\d+\\.apk$")) ||
                verifiedAt < 0 ||
                AndroidUpdatePolicy.expired(verifiedAt, now) ||
                (retainedName != null && file.name != retainedName)
            if (remove) deleteUnsafe(file)
        }
    }

    private fun deleteUnsafe(file: File) {
        preferences.edit().remove(verifiedKey(file)).apply()
        file.delete()
    }

    private fun verifiedKey(file: File): String = "verified:${file.name}"

    private fun availableBytes(directory: File): Long = try {
        StatFs(directory.path).availableBytes
    } catch (_: Exception) {
        0
    }

    private fun reject(invoke: Invoke, code: String) {
        invoke.reject("operation failed", code)
    }

    private class CancelledException : IOException()
    private class SizeMismatchException : IOException()

    companion object {
        private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
        private const val DOWNLOAD_BUFFER_BYTES = 64 * 1024
        private const val PROGRESS_INTERVAL_MS = 100L
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 30_000
        private const val MAX_REDIRECTS = 5
        private val REDIRECT_CODES = setOf(301, 302, 303, 307, 308)
    }
}
