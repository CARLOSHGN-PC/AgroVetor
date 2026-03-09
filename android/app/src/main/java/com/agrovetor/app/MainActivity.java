package com.agrovetor.app;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.agrovetor.app.plugins.AerialMapPlugin;
import com.getcapacitor.BridgeActivity;
import com.agrovetor.app.aerial.NativeAerialMapManager;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AerialMapPlugin.class);
        super.onCreate(savedInstanceState);

        NativeAerialMapManager.getInstance(this).attachToActivity(this);

        android.view.View container = findViewById(com.agrovetor.app.R.id.native_aerial_map_container);
        android.util.Log.i("AerialOfflineDebug", "MainActivity.onCreate layout=capacitor_bridge_layout_main containerFound=" + (container != null));

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(android.graphics.Color.TRANSPARENT);
            WebSettings settings = getBridge().getWebView().getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setGeolocationEnabled(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        NativeAerialMapManager.getInstance(this).onStart();
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        NativeAerialMapManager.getInstance(this).onLowMemory();
    }

    @Override
    public void onStop() {
        NativeAerialMapManager.getInstance(this).onStop();
        super.onStop();
    }

    @Override
    public void onDestroy() {
        NativeAerialMapManager.getInstance(this).onDestroy();
        super.onDestroy();
    }
}
