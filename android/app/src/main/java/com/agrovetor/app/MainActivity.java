package com.agrovetor.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.widget.FrameLayout;

import com.agrovetor.app.aerial.MainActivityAerialMapController;
import com.agrovetor.app.plugins.AerialMapPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private FrameLayout nativeAerialMapContainer;
    private MainActivityAerialMapController aerialMapController;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AerialMapPlugin.class);
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings settings = getBridge().getWebView().getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setGeolocationEnabled(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

            ensureNativeAerialMapContainer();
            getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
        }
    }

    private void ensureNativeAerialMapContainer() {
        ViewGroup root = findViewById(android.R.id.content);
        if (root == null || getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        if (nativeAerialMapContainer != null) {
            return;
        }

        nativeAerialMapContainer = new FrameLayout(this);
        nativeAerialMapContainer.setId(R.id.nativeAerialMapContainer);
        nativeAerialMapContainer.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        nativeAerialMapContainer.setVisibility(View.GONE);
        nativeAerialMapContainer.setBackgroundColor(Color.TRANSPARENT);

        View webView = getBridge().getWebView();
        ViewGroup webParent = (ViewGroup) webView.getParent();
        if (webParent != null) {
            int webIndex = webParent.indexOfChild(webView);
            webParent.addView(nativeAerialMapContainer, webIndex);
            webView.bringToFront();
        } else {
            root.addView(nativeAerialMapContainer, 0);
            webView.bringToFront();
        }

        aerialMapController = new MainActivityAerialMapController(this);
    }

    public FrameLayout getNativeAerialMapContainer() {
        ensureNativeAerialMapContainer();
        return nativeAerialMapContainer;
    }

    public MainActivityAerialMapController getAerialMapController() {
        if (aerialMapController == null) {
            ensureNativeAerialMapContainer();
        }
        return aerialMapController;
    }

    public void setAerialNativeModeEnabled(boolean enabled) {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        getBridge().getWebView().setBackgroundColor(enabled ? Color.TRANSPARENT : Color.WHITE);
        getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('aerial-native-mode',{detail:{enabled:" + (enabled ? "true" : "false") + "}}));",
                null
        );
    }
}
