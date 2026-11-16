package app.stabilimento.tablet

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketException
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.concurrent.thread

// Plain HTTP stands in for https: the scheme is the only difference, and trust is the network
// security config's job, which a JVM test can't exercise. Unit tests compile against
// android.jar, so the server is a bare socket rather than the JDK's com.sun HttpServer.
class HealthProbeTest {
    private val server = ServerSocket(0, 50, InetAddress.getLoopbackAddress())
    private val origin = Origin("127.0.0.1", server.localPort)
    private val requested = CopyOnWriteArrayList<String>()

    private fun respond(status: Int, delayMs: Long = 0, headers: Map<String, String> = emptyMap()) {
        thread(isDaemon = true) {
            try {
                while (true) {
                    server.accept().use { socket ->
                        val requestLine = socket.getInputStream().bufferedReader().readLine().orEmpty()
                        requested += requestLine.split(' ').getOrElse(1) { "" }
                        Thread.sleep(delayMs)
                        val extra = headers.entries.joinToString("") { (k, v) -> "$k: $v\r\n" }
                        val reply = "HTTP/1.1 $status X\r\nContent-Length: 0\r\nConnection: close\r\n$extra\r\n"
                        socket.getOutputStream().apply {
                            write(reply.toByteArray())
                            flush()
                        }
                    }
                }
            } catch (e: SocketException) {
                // closed by stop()
            }
        }
    }

    private fun probe(timeoutMs: Int = 1_000) = HealthProbe(timeoutMs = timeoutMs, scheme = "http")

    @After
    fun stop() = server.close()

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
