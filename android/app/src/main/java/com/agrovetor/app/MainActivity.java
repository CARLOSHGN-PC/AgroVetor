package com.agrovetor.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.widget.FrameLayout;

import androidx.fragment.app.Fragment;

import com.agrovetor.app.aerial.NativeAerialMapFragment;
import com.agrovetor.app.plugins.AerialMapPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String NATIVE_AERIAL_TAG = "NativeAerialMapFragment";

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
        }
    }

    public void setNativeAerialMapVisible(boolean visible) {
        runOnUiThread(() -> {
            FrameLayout host = findViewById(R.id.nativeAerialMapHost);
            if (host == null) return;

            host.setVisibility(visible ? View.VISIBLE : View.GONE);
            Fragment fragment = getSupportFragmentManager().findFragmentByTag(NATIVE_AERIAL_TAG);

            if (visible) {
                if (fragment == null) {
                    getSupportFragmentManager()
                            .beginTransaction()
                            .replace(R.id.nativeAerialMapHost, new NativeAerialMapFragment(), NATIVE_AERIAL_TAG)
                            .commitNowAllowingStateLoss();
                }
            } else if (fragment != null) {
                getSupportFragmentManager()
                        .beginTransaction()
                        .remove(fragment)
                        .commitNowAllowingStateLoss();
            }
        });
    }
}
