package app.stabilimento.tablet

import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream

/** Keeps the WebView on the box's origins (ADR 0010) and reports failed page loads. */
class BoxWebViewClient(
    private val policy: OriginPolicy,
    private val onPageFailed: () -> Unit,
    private val onPageLoaded: () -> Unit,
) : WebViewClient() {
    private var mainFrameFailed = false

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
        !policy.allows(request.url.toString())

    // Runs on a WebView thread for every request, the main frame included; OriginPolicy is
    // immutable, so this is safe.
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
        if (policy.allows(request.url.toString())) null else blocked()

    override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
        mainFrameFailed = false
    }

    override fun onPageFinished(view: WebView, url: String) {
        if (!mainFrameFailed) onPageLoaded()
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) failMainFrame()
    }

    // Caddy answers 502 while the app restarts during an update: the box isn't serving pages.
    override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
        if (request.isForMainFrame && response.statusCode in BOX_DOWN_STATUSES) failMainFrame()
    }

    // Never proceed: a certificate the bundled root doesn't vouch for is never trusted.
    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        handler.cancel()
        failMainFrame()
    }

    private fun failMainFrame() {
        mainFrameFailed = true
        onPageFailed()
    }

    private fun blocked() =
        WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))

    private companion object {
        val BOX_DOWN_STATUSES = 502..504
    }
}
