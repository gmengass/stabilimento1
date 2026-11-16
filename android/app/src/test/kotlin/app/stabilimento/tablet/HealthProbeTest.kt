package app.stabilimento.tablet

import com.sun.net.httpserver.HttpServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.util.concurrent.CopyOnWriteArrayList

// Plain HTTP stands in for https: the scheme is the only difference, and trust is the network
// security config's job, which a JVM test can't exercise.
class HealthProbeTest {
    private val server = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)
    private val origin get() = Origin("127.0.0.1", server.address.port)
    private val requested = CopyOnWriteArrayList<String>()

    private fun respond(status: Int, delayMs: Long = 0, headers: Map<String, String> = emptyMap()) {
        server.createContext("/") { exchange ->
            requested += exchange.requestURI.path
            Thread.sleep(delayMs)
            headers.forEach { (k, v) -> exchange.responseHeaders.add(k, v) }
            exchange.sendResponseHeaders(status, -1)
            exchange.close()
        }
    }

    init {
        server.start()
    }

    private fun probe(timeoutMs: Int = 1_000) = HealthProbe(timeoutMs = timeoutMs, scheme = "http")

    @After
    fun stop() = server.stop(0)

    @Test
    fun upOn200AtSlashHealth() {
        respond(200)
        assertTrue(probe().isUp(origin))
        assertEquals(listOf("/health"), requested)
    }

    @Test
    fun downOnAServerError() {
        respond(503)
        assertFalse(probe().isUp(origin))
    }

    @Test
    fun downOnARedirectWithoutFollowingIt() {
        respond(302, headers = mapOf("Location" to "/elsewhere"))
        assertFalse(probe().isUp(origin))
        assertEquals(listOf("/health"), requested)
    }

    @Test
    fun downWhenTheAnswerIsTooSlow() {
        respond(200, delayMs = 2_000)
        val started = System.nanoTime()
        assertFalse(probe(timeoutMs = 300).isUp(origin))
        val elapsedMs = (System.nanoTime() - started) / 1_000_000
        assertTrue("took $elapsedMs ms", elapsedMs < 1_500)
    }

    @Test
    fun downWhenNothingListens() {
        val freePort = ServerSocket(0, 0, InetAddress.getLoopbackAddress()).use { it.localPort }
        assertFalse(probe().isUp(Origin("127.0.0.1", freePort)))
    }

    @Test
    fun defaultTimeoutIsThreeSeconds() {
        assertEquals(3_000, HealthProbe.DEFAULT_TIMEOUT_MS)
    }
}
