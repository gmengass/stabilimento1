package app.stabilimento.tablet

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Button
import android.widget.TextView
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** One full-screen WebView on the box (ADR 0010), with the address fallback of ADR 0011. */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var statusView: View
    private lateinit var statusTitle: TextView
    private lateinit var statusHint: TextView
    private lateinit var retryButton: Button
    private lateinit var selector: BoxSelector
    private lateinit var client: BoxWebViewClient

    // BoxSelector is used on this thread only; health checks never block the UI.
    private val probeThread: ExecutorService = Executors.newSingleThreadExecutor()
    private var connecting = false
    private var loadedSinceConnect = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.web_view)
        statusView = findViewById(R.id.status_view)
        statusTitle = findViewById(R.id.status_title)
        statusHint = findViewById(R.id.status_hint)
        retryButton = findViewById(R.id.retry_button)

        val policy = OriginPolicy.fromConfig(BuildConfig.APP_URL, BuildConfig.TRUSTED_ORIGINS, BuildConfig.REMOTE_URL)
        selector = BoxSelector(policy.candidates, HealthProbe())
        setUpWebView(policy)
        retryButton.setOnClickListener { connect(forgetCurrent = true) }
        connect(forgetCurrent = false)
    }

    private fun setUpWebView(policy: OriginPolicy) {
        WebView.setWebContentsDebuggingEnabled(false)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            setGeolocationEnabled(false)
        }
        client = BoxWebViewClient(
            policy,
            onPageFailed = ::onPageFailed,
            onPageLoaded = { loadedSinceConnect = true },
            onRendererGone = ::recreate,
        )
        webView.webViewClient = client
        // No file chooser, no camera, microphone or location: every web permission is refused.
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) = request.deny()
        }
    }

    // A load that fails on an address that just answered its health check shows the retry
    // screen instead of probing again, so a page that never loads can't loop.
    private fun onPageFailed() {
        if (connecting) return
        if (loadedSinceConnect) connect(forgetCurrent = true) else showStatus(R.string.not_reachable, offerRetry = true)
    }

    private fun connect(forgetCurrent: Boolean) {
        connecting = true
        showStatus(R.string.connecting, offerRetry = false)
        probeThread.execute {
            if (forgetCurrent) selector.onLoadFailed()
            val origin = selector.select()
            runOnUiThread { if (!isDestroyed) onSelected(origin) }
        }
    }

    private fun onSelected(origin: Origin?) {
        connecting = false
        if (origin == null) {
            showStatus(R.string.not_reachable, offerRetry = true)
            return
        }
        loadedSinceConnect = false
        statusView.visibility = View.GONE
        webView.visibility = View.VISIBLE
        val url = "$origin/"
        client.onLoadStarting(url)
        webView.loadUrl(url)
    }

    private fun showStatus(title: Int, offerRetry: Boolean) {
        webView.visibility = View.INVISIBLE
        statusView.visibility = View.VISIBLE
        statusTitle.setText(title)
        val retry = if (offerRetry) View.VISIBLE else View.GONE
        statusHint.visibility = retry
        retryButton.visibility = retry
    }

    // Back goes back in the app's history; on the first page it sends the app to the
    // background (a pinned tablet stays on the app). Move to OnBackInvokedCallback before
    // targetSdk 36 (predictive back).
    @Suppress("OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            client.onLoadStarting(null)
            webView.goBack()
        } else {
            moveTaskToBack(true)
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        probeThread.shutdownNow()
        webView.destroy()
        super.onDestroy()
    }
}
