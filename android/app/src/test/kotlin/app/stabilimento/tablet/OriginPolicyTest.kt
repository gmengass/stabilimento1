package app.stabilimento.tablet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class OriginPolicyTest {
    private val policy = OriginPolicy.fromConfig(
        appUrl = "https://stabilimento.local",
        trustedOrigins = "https://192.168.0.10, https://box.lan:8443",
        remoteUrl = "https://stabilimento.tail1234.ts.net",
    )

    @Test
    fun parsesConfiguredOrigins() {
        assertEquals(Origin("stabilimento.local", 443), policy.appOrigin)
        assertEquals(Origin("stabilimento.tail1234.ts.net", 443), policy.remoteOrigin)
        assertEquals("https://box.lan:8443", Origin.parseConfigured("https://box.lan:8443").toString())
    }

    @Test
    fun lowercasesHostsAndTreats443AsTheDefaultPort() {
        assertEquals(Origin("stabilimento.local", 443), Origin.parseConfigured("HTTPS://Stabilimento.LOCAL:443"))
        assertEquals("https://stabilimento.local", Origin("stabilimento.local", 443).toString())
    }

    @Test
    fun refusesConfiguredValuesThatAreNotExactHttpsOrigins() {
        listOf(
            "http://stabilimento.local",
            "https://stabilimento.local/",
            "https://stabilimento.local/app",
            "https://stabilimento.local?x=1",
            "https://stabilimento.local#top",
            "https://user@stabilimento.local",
            "https://*.stabilimento.local",
            "stabilimento.local",
            "",
        ).forEach { assertNull("accepted '$it'", Origin.parseConfigured(it)) }
    }

    @Test
    fun fromConfigThrowsOnABadValue() {
        expectInvalid { OriginPolicy.fromConfig("http://stabilimento.local", "", "") }
        expectInvalid { OriginPolicy.fromConfig("https://stabilimento.local", "https://ok.lan, https://bad.lan/", "") }
        expectInvalid { OriginPolicy.fromConfig("https://stabilimento.local", "", "https://remote.ts.net/") }
    }

    @Test
    fun emptyTrustedOriginsAndRemoteUrlAreAllowed() {
        val minimal = OriginPolicy.fromConfig("https://stabilimento.local", " ", "")
        assertNull(minimal.remoteOrigin)
        assertEquals(listOf(Origin("stabilimento.local", 443)), minimal.candidates)
        assertTrue(minimal.allows("https://stabilimento.local/"))
    }

    @Test
    fun candidatesAreAppThenRemote() {
        assertEquals(listOf(policy.appOrigin, policy.remoteOrigin), policy.candidates)
    }

    @Test
    fun allowsAnyPathOnTheBoxOrigins() {
        listOf(
            "https://stabilimento.local/",
            "https://stabilimento.local/admin/beach?date=2026-07-01#map",
            "https://STABILIMENTO.local:443/login",
            "https://192.168.0.10/health",
            "https://box.lan:8443/",
            "https://stabilimento.tail1234.ts.net/",
            "https://stabilimento.local/_next/static/chunks/app/[id]/page-1a2b.js",
            "https://stabilimento.local/_next/static/chunks/%5Bid%5D.js",
            "https://stabilimento.local/?q=a|b{c}^`",
            "https://192.168.0.10:443/_next/image?url=%2Fx.png&w=64",
            "HTTPS://STABILIMENTO.LOCAL/",
            "https://stabilimento.local",
        ).forEach { assertTrue("refused '$it'", policy.allows(it)) }
    }

    @Test
    fun refusesEverythingElse() {
        listOf(
            "https://stabilimento.local.evil.com/",
            "https://evilstabilimento.local/",
            "https://stabilimento.local:8443/",
            "https://box.lan/",
            "http://stabilimento.local/",
            "https://stabilimento.local@evil.com/",
            "https://evil.com/#https://stabilimento.local",
            "https://evil.com\\@stabilimento.local/",
            "https://evil.com?@stabilimento.local/",
            "https://stabilimento.local:99999/",
            "https:/stabilimento.local/",
            "https:///stabilimento.local/",
            " https://stabilimento.local/",
            "javascript:alert(1)",
            "data:text/html,hi",
            "file:///sdcard/x.html",
            "content://downloads/1",
            "intent://scan#Intent;scheme=zxing;end",
            "about:blank",
            "not a url",
        ).forEach { assertFalse("allowed '$it'", policy.allows(it)) }
    }

    private fun expectInvalid(block: () -> Unit) {
        try {
            block()
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            // expected
        }
    }
}
