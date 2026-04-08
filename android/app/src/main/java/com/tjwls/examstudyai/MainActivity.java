package com.tjwls.examstudyai;

import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String CALLBACK_HOST = "auth";
    private static final String CALLBACK_PATH_PREFIX = "/callback";

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        routeCallbackToApp(intent);
    }

    private void routeCallbackToApp(Intent intent) {
        if (intent == null) {
            return;
        }

        Uri callbackUri = intent.getData();
        if (!isHandledCallbackUri(callbackUri)) {
            return;
        }

        Bridge bridge = getBridge();
        if (bridge == null) {
            return;
        }

        WebView webView = bridge.getWebView();
        if (webView == null) {
            return;
        }

        String appCallbackUrl = buildAppCallbackUrl(bridge, callbackUri);

        webView.post(() -> {
            webView.stopLoading();
            webView.loadUrl(appCallbackUrl);

            // Drop the NicePay page stack so Android back returns inside the app.
            webView.postDelayed(webView::clearHistory, 300);
        });
    }

    private boolean isHandledCallbackUri(Uri uri) {
        if (uri == null) {
            return false;
        }

        String expectedScheme = getString(R.string.custom_url_scheme);
        String path = uri.getPath();

        return expectedScheme.equalsIgnoreCase(String.valueOf(uri.getScheme())) &&
            CALLBACK_HOST.equalsIgnoreCase(String.valueOf(uri.getHost())) &&
            path != null &&
            path.startsWith(CALLBACK_PATH_PREFIX);
    }

    private String buildAppCallbackUrl(Bridge bridge, Uri callbackUri) {
        Uri appUri = Uri.parse(bridge.getAppUrl());
        Uri.Builder builder = appUri.buildUpon().clearQuery();

        // Preserve every callback parameter so OAuth code exchange and payment returns
        // can both complete inside the WebView.
        for (String key : callbackUri.getQueryParameterNames()) {
            for (String value : callbackUri.getQueryParameters(key)) {
                if (value == null || value.isEmpty()) {
                    continue;
                }
                builder.appendQueryParameter(key, value);
            }
        }

        String encodedFragment = callbackUri.getEncodedFragment();
        if (encodedFragment != null && !encodedFragment.isEmpty()) {
            builder.encodedFragment(encodedFragment);
        }

        return builder.build().toString();
    }
}
