package com.tjwls.examstudyai;

import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends BridgeActivity {

    private static final String CALLBACK_HOST = "auth";
    private static final String CALLBACK_PATH_PREFIX = "/callback";
    private static final Set<String> PAYMENT_QUERY_KEYS = new HashSet<>(
        Arrays.asList(
            "pg_token",
            "kakaoPay",
            "nicePay",
            "np_token",
            "orderId",
            "amount",
            "message",
            "niceBilling",
            "trial"
        )
    );

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        routePaymentCallbackToApp(intent);
    }

    private void routePaymentCallbackToApp(Intent intent) {
        if (intent == null) {
            return;
        }

        Uri callbackUri = intent.getData();
        if (!isPaymentCallbackUri(callbackUri)) {
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

    private boolean isPaymentCallbackUri(Uri uri) {
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

        for (String key : PAYMENT_QUERY_KEYS) {
            String value = callbackUri.getQueryParameter(key);
            if (value == null || value.isEmpty()) {
                continue;
            }
            builder.appendQueryParameter(key, value);
        }

        return builder.build().toString();
    }
}
