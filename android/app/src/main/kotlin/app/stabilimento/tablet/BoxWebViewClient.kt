package app.stabilimento.tablet

import android.net.http.SslError
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream

/** Keeps the WebView on the box's origins (ADR 0010) and reports how page loads end. */
class BoxWebViewClient(
    private val policy: OriginPolicy,
    private val onPageFailed: () -> Unit,
    private val onPageLoaded: () -> Unit,
    private val onRendererGone: () -> Unit,
) : WebViewClient() {
    private var mainFrameUrl: String? = null
    private var mainFrameFailed = false

    /** Call before every page load the app starts itself (`loadUrl`, back). */
    fun onLoadStarting(url: String?) {
        mainFrameUrl = url
        mainFrameFailed = false
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val url = request.url.toString()
        if (!policy.allows(url)) return true
        if (request.isForMainFrame) onLoadStarting(url)
        return false
    }

    // Runs on a WebView thread for every request, the main frame included; OriginPolicy is
    // immutable, so this is safe.
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
        if (policy.allows(request.url.toString())) null else blocked()

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

    // Never proceed: a certificate the bundled root doesn't vouch for is never trusted. Only a
    // page's own failure reloads; a refused image or script leaves typed input alone.
    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        handler.cancel()
        if (mainFrameUrl == null || error.url == mainFrameUrl) failMainFrame()
    }

    // Android 8+: a crashed or killed renderer would otherwise take the whole app down.
    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        onRendererGone()
        return true
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
