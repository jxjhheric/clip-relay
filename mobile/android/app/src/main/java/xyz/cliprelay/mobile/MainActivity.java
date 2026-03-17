package xyz.cliprelay.mobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import xyz.cliprelay.mobile.plugins.ShareReceiverPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareReceiverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}