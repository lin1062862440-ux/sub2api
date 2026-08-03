package ai.lin.android.updater

import java.net.URI

data class BoundedProgress(val downloaded: Long, val total: Long)

enum class SecurityFailure(val code: String) {
    PackageName("package_name_mismatch"),
    VersionCode("version_code_mismatch"),
    Certificate("certificate_mismatch"),
}

object AndroidUpdatePolicy {
    private val versionPattern = Regex("^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$")
    private const val releasePrefix = "/linsource/linai-desktop-release/releases/download/android-v"
    private const val verifiedLifetimeMs = 86_400_000L

    fun fileName(version: String): String {
        require(versionPattern.matches(version)) { "invalid version" }
        return "linai-update-$version.apk"
    }

    fun acceptsUrl(version: String, value: String): Boolean {
        if (!versionPattern.matches(version)) return false
        val uri = try {
            URI(value)
        } catch (_: Exception) {
            return false
        }
        if (
            uri.scheme != "https" ||
            uri.host != "gitee.com" ||
            uri.port != -1 ||
            uri.rawUserInfo != null ||
            uri.rawQuery != null ||
            uri.rawFragment != null
        ) return false
        val escapedVersion = Regex.escape(version)
        return Regex("^${Regex.escape(releasePrefix)}$escapedVersion/[A-Za-z0-9._-]+\\.apk$")
            .matches(uri.rawPath ?: "")
    }

    fun progress(downloaded: Long, expectedBytes: Long): BoundedProgress {
        val total = expectedBytes.coerceAtLeast(0)
        return BoundedProgress(downloaded.coerceIn(0, total), total)
    }

    fun expired(verifiedAtMs: Long, nowMs: Long): Boolean =
        nowMs < verifiedAtMs || nowMs - verifiedAtMs > verifiedLifetimeMs

    fun validateIdentity(
        archivePackage: String,
        archiveVersionCode: Long,
        archiveCertificate: ByteArray,
        installedPackage: String,
        installedVersionCode: Long,
        installedCertificate: ByteArray,
    ): SecurityFailure? {
        if (archivePackage != installedPackage) return SecurityFailure.PackageName
        if (archiveVersionCode <= installedVersionCode) return SecurityFailure.VersionCode
        if (!archiveCertificate.contentEquals(installedCertificate)) return SecurityFailure.Certificate
        return null
    }
}
