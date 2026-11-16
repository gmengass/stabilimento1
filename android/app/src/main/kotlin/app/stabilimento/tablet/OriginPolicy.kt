package app.stabilimento.tablet

import java.net.URI
import java.net.URISyntaxException
import java.util.Locale

/** An https origin: lowercased host and port, nothing else. */
data class Origin(val host: String, val port: Int) {
    val authority: String get() = if (port == HTTPS_PORT) host else "$host:$port"

    override fun toString() = "https://$authority"

    companion object {
        private const val HTTPS_PORT = 443

        /** A configured origin: exactly `https://host[:port]`, or null. */
        fun parseConfigured(value: String): Origin? {
            val uri = parse(value) ?: return null
            if (uri.rawPath.orEmpty().isNotEmpty() || uri.rawQuery != null || uri.rawFragment != null) {
                return null
            }
            return of(uri)
        }

        /**
         * The origin of a URL about to load, or null unless it is https with a host. Only the
         * scheme and authority are parsed: Chromium sends paths and queries that java.net.URI
         * rejects (`/[id]/page.js`, `?a=|`), and they don't change the origin.
         */
        fun ofUrl(url: String): Origin? {
            val match = SCHEME_AND_AUTHORITY.find(url) ?: return null
            val (scheme, authority) = match.destructured
            return parse("$scheme://$authority")?.let(::of)
        }

        // Up to the first / ? # \ after "scheme://". A backslash ends the authority in
        // Chromium, so it ends it here too.
        private val SCHEME_AND_AUTHORITY = Regex("""^([A-Za-z][A-Za-z0-9+.-]*)://([^/?#\\]*)""")

        private fun parse(value: String): URI? =
            try {
                URI(value)
            } catch (e: URISyntaxException) {
                null
            }

        private fun of(uri: URI): Origin? {
            if (!"https".equals(uri.scheme, ignoreCase = true) || uri.rawUserInfo != null) return null
            val host = uri.host?.lowercase(Locale.ROOT) ?: return null
            val port = if (uri.port == -1) HTTPS_PORT else uri.port
            return if (port in 1..65535) Origin(host, port) else null
        }
    }
}

/** The box's origins (ADR 0010, ADR 0011): the only ones the WebView may load. */
class OriginPolicy(val appOrigin: Origin, val remoteOrigin: Origin?, trusted: List<Origin>) {
    private val allowed: Set<Origin> = setOf(appOrigin) + trusted + listOfNotNull(remoteOrigin)

    /** Box addresses in the order the app tries them: APP_URL, then REMOTE_URL. */
    val candidates: List<Origin> get() = listOfNotNull(appOrigin, remoteOrigin)

    fun allows(url: String): Boolean = Origin.ofUrl(url)?.let { it in allowed } ?: false

    companion object {
        /** From the build's values; throws on anything that is not an exact https origin. */
        fun fromConfig(appUrl: String, trustedOrigins: String, remoteUrl: String): OriginPolicy {
            val trusted = trustedOrigins.split(',').map { it.trim() }.filter { it.isNotEmpty() }
            return OriginPolicy(
                appOrigin = required("APP_URL", appUrl),
                remoteOrigin = remoteUrl.trim().takeIf { it.isNotEmpty() }?.let { required("REMOTE_URL", it) },
                trusted = trusted.map { required("TRUSTED_ORIGINS", it) },
            )
        }

        private fun required(name: String, value: String): Origin =
            requireNotNull(Origin.parseConfigured(value.trim())) { "$name is not an https origin: '$value'" }
    }
}
