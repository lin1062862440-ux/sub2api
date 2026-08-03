package ai.lin.android.updater

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidUpdatePolicyTest {
    @Test
    fun generatesOnlyVersionBoundFileNames() {
        assertEquals("linai-update-0.1.5.apk", AndroidUpdatePolicy.fileName("0.1.5"))
        assertThrows(IllegalArgumentException::class.java) {
            AndroidUpdatePolicy.fileName("../0.1.5")
        }
        assertThrows(IllegalArgumentException::class.java) {
            AndroidUpdatePolicy.fileName("0.1.5-beta")
        }
    }

    @Test
    fun acceptsOnlyTheFixedGiteeVersionedApkUrl() {
        assertTrue(
            AndroidUpdatePolicy.acceptsUrl(
                "0.1.5",
                "https://gitee.com/linsource/linai-desktop-release/releases/download/android-v0.1.5/LinAI_0.1.5_arm64-release.apk",
            ),
        )
        assertFalse(AndroidUpdatePolicy.acceptsUrl("0.1.5", "http://gitee.com/linsource/linai-desktop-release/releases/download/android-v0.1.5/a.apk"))
        assertFalse(AndroidUpdatePolicy.acceptsUrl("0.1.5", "https://token@gitee.com/linsource/linai-desktop-release/releases/download/android-v0.1.5/a.apk"))
        assertFalse(AndroidUpdatePolicy.acceptsUrl("0.1.5", "https://gitee.com/linsource/other/releases/download/android-v0.1.5/a.apk"))
        assertFalse(AndroidUpdatePolicy.acceptsUrl("0.1.5", "https://gitee.com/linsource/linai-desktop-release/releases/download/android-v0.1.6/a.apk"))
    }

    @Test
    fun clampsProgressToTheExpectedByteCount() {
        assertEquals(BoundedProgress(0, 100), AndroidUpdatePolicy.progress(-1, 100))
        assertEquals(BoundedProgress(100, 100), AndroidUpdatePolicy.progress(150, 100))
        assertEquals(BoundedProgress(0, 0), AndroidUpdatePolicy.progress(12, -1))
    }

    @Test
    fun expiresVerifiedFilesOnlyAfterTwentyFourHours() {
        assertFalse(AndroidUpdatePolicy.expired(0, 86_400_000))
        assertTrue(AndroidUpdatePolicy.expired(0, 86_400_001))
        assertTrue(AndroidUpdatePolicy.expired(100, 99))
    }

    @Test
    fun requiresPackageNameHigherCodeAndCertificateContinuity() {
        val currentCertificate = byteArrayOf(1, 2, 3)
        assertEquals(
            SecurityFailure.PackageName,
            AndroidUpdatePolicy.validateIdentity(
                "other.app", 1_005, currentCertificate,
                "ai.lin.android", 1_004, currentCertificate,
            ),
        )
        assertEquals(
            SecurityFailure.VersionCode,
            AndroidUpdatePolicy.validateIdentity(
                "ai.lin.android", 1_004, currentCertificate,
                "ai.lin.android", 1_004, currentCertificate,
            ),
        )
        assertEquals(
            SecurityFailure.Certificate,
            AndroidUpdatePolicy.validateIdentity(
                "ai.lin.android", 1_005, byteArrayOf(9),
                "ai.lin.android", 1_004, currentCertificate,
            ),
        )
        assertNull(
            AndroidUpdatePolicy.validateIdentity(
                "ai.lin.android", 1_005, currentCertificate,
                "ai.lin.android", 1_004, currentCertificate,
            ),
        )
        assertArrayEquals(currentCertificate, currentCertificate.copyOf())
    }
}
