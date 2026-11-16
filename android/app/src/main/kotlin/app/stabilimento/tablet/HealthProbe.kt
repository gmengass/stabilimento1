package app.stabilimento.tablet

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * `GET <origin>/health` (ADR 0011): up only on HTTP 200, redirects not followed. Over https the
 * app's network security config applies, so only the club root and system roots are trusted.
 */
class HealthProbe(
    private val timeoutMs: Int = DEFAULT_TIMEOUT_MS,
    private val scheme: String = "https",
) : Probe {
    override fun isUp(origin: Origin): Boolean {
        val connection = URL("$scheme://${origin.authority}/health").openConnection() as HttpURLConnection
        return try {
            connection.connectTimeout = timeoutMs
            connection.readTimeout = timeoutMs
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            connection.responseCode == HttpURLConnection.HTTP_OK
        } catch (e: IOException) {
            false
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        const val DEFAULT_TIMEOUT_MS = 3_000
    }
}
