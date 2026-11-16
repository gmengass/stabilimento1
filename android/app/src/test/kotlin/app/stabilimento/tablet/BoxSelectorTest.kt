package app.stabilimento.tablet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BoxSelectorTest {
    private val app = Origin("stabilimento.local", 443)
    private val remote = Origin("stabilimento.tail1234.ts.net", 443)

    private class FakeProbe(var up: Set<Origin>, var throwing: Set<Origin> = emptySet()) : Probe {
        val probed = mutableListOf<Origin>()

        override fun isUp(origin: Origin): Boolean {
            probed += origin
            if (origin in throwing) throw IllegalStateException("probe failed")
            return origin in up
        }
    }

    @Test
    fun picksTheAppUrlWithoutProbingTheRemoteOne() {
        val probe = FakeProbe(up = setOf(app, remote))
        assertEquals(app, BoxSelector(listOf(app, remote), probe).select())
        assertEquals(listOf(app), probe.probed)
    }

    @Test
    fun fallsBackToTheRemoteUrl() {
        val probe = FakeProbe(up = setOf(remote))
        assertEquals(remote, BoxSelector(listOf(app, remote), probe).select())
        assertEquals(listOf(app, remote), probe.probed)
    }

    @Test
    fun returnsNullWhenNothingAnswers() {
        assertNull(BoxSelector(listOf(app, remote), FakeProbe(up = emptySet())).select())
    }

    @Test
    fun worksWithoutARemoteUrl() {
        assertEquals(app, BoxSelector(listOf(app), FakeProbe(up = setOf(app))).select())
        assertNull(BoxSelector(listOf(app), FakeProbe(up = setOf(remote))).select())
    }

    @Test
    fun aProbeExceptionCountsAsDown() {
        val probe = FakeProbe(up = setOf(app, remote), throwing = setOf(app))
        assertEquals(remote, BoxSelector(listOf(app, remote), probe).select())
    }

    @Test
    fun keepsTheAddressUntilALoadFails() {
        val probe = FakeProbe(up = setOf(remote))
        val selector = BoxSelector(listOf(app, remote), probe)
        assertEquals(remote, selector.select())

        probe.up = setOf(app, remote)
        assertEquals(remote, selector.select())
        assertEquals(2, probe.probed.size)

        selector.onLoadFailed()
        assertNull(selector.current)
        assertEquals(app, selector.select())
        assertEquals(listOf(app, remote, app), probe.probed)
    }

    @Test
    fun probesAgainAfterNothingAnswered() {
        val probe = FakeProbe(up = emptySet())
        val selector = BoxSelector(listOf(app, remote), probe)
        assertNull(selector.select())
        probe.up = setOf(app)
        assertEquals(app, selector.select())
    }
}
