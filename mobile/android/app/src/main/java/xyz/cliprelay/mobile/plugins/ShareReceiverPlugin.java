package xyz.cliprelay.mobile.plugins;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.os.Parcelable;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;

@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {
    private static final int MAX_SHARE_BYTES = 25 * 1024 * 1024;
    private static JSObject pendingShare;

    @Override
    public void load() {
        super.load();
        cacheShareIntent(getActivity().getIntent());
    }

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        if (pendingShare == null) {
            call.resolve();
            return;
        }
        call.resolve(pendingShare);
    }

    @PluginMethod
    public void clearPendingShare(PluginCall call) {
        pendingShare = null;
        call.resolve();
    }

    @PluginMethod
    public void resolvePendingShareUris(PluginCall call) {
        JSObject result = new JSObject();
        JSArray files = new JSArray();
        result.put("files", files);

        if (pendingShare == null || !pendingShare.has("uris")) {
            call.resolve(result);
            return;
        }

        JSArray uris = pendingShare.optJSONArray("uris") instanceof JSArray ? (JSArray) pendingShare.optJSONArray("uris") : null;
        if (uris == null) {
            call.resolve(result);
            return;
        }

        try {
            for (int index = 0; index < uris.length(); index++) {
                String rawUri = uris.getString(index);
                if (rawUri == null || rawUri.isEmpty()) {
                    continue;
                }
                JSObject file = readSharedUri(Uri.parse(rawUri));
                if (file != null) {
                    files.put(file);
                }
            }
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        cacheShareIntent(intent);
    }

    private void cacheShareIntent(Intent intent) {
        JSObject payload = serializeIntent(intent);
        if (payload == null) {
            return;
        }
        pendingShare = payload;
        notifyListeners("shareReceived", payload, true);
    }

    private JSObject serializeIntent(Intent intent) {
        if (intent == null) {
            return null;
        }

        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return null;
        }

        JSObject payload = new JSObject();
        payload.put("action", action);
        payload.put("mimeType", intent.getType());

        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (subject != null && !subject.isEmpty()) {
            payload.put("subject", subject);
        }

        CharSequence extraText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (extraText != null && extraText.length() > 0) {
            payload.put("text", extraText.toString());
        }

        JSArray uris = new JSArray();

        Uri singleUri = getParcelable(intent, Intent.EXTRA_STREAM, Uri.class);
        if (singleUri != null) {
            uris.put(singleUri.toString());
        }

        ArrayList<Uri> multipleUris = getParcelableArrayList(intent, Intent.EXTRA_STREAM, Uri.class);
        if (multipleUris != null) {
            for (Uri uri : multipleUris) {
                if (uri != null) {
                    uris.put(uri.toString());
                }
            }
        }

        if (uris.length() > 0) {
            payload.put("uris", uris);
        }

        return payload;
    }

    private JSObject readSharedUri(Uri uri) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        JSObject file = new JSObject();
        file.put("uri", uri.toString());

        String mimeType = resolver.getType(uri);
        if (mimeType != null && !mimeType.isEmpty()) {
            file.put("mimeType", mimeType);
        }

        String name = null;
        long size = -1L;
        try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameIndex >= 0) {
                    name = cursor.getString(nameIndex);
                }
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                    size = cursor.getLong(sizeIndex);
                }
            }
        }

        if ((name == null || name.isEmpty()) && uri.getLastPathSegment() != null) {
            name = uri.getLastPathSegment();
        }
        if (name == null || name.isEmpty()) {
            name = "shared-file";
        }
        file.put("name", name);

        if (size < 0L) {
            try (ParcelFileDescriptor descriptor = resolver.openFileDescriptor(uri, "r")) {
                if (descriptor != null) {
                    size = descriptor.getStatSize();
                }
            }
        }
        if (size >= 0L) {
            file.put("size", size);
        }

        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) {
                throw new IOException("Unable to open shared content URI.");
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            int total = 0;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_SHARE_BYTES) {
                    throw new IOException("Shared file exceeds 25 MB limit in the current shell build.");
                }
                output.write(buffer, 0, read);
            }
            file.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
        }

        return file;
    }

    @SuppressWarnings("deprecation")
    private <T extends Parcelable> T getParcelable(Intent intent, String key, Class<T> cls) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableExtra(key, cls);
        }
        return cls.cast(intent.getParcelableExtra(key));
    }

    @SuppressWarnings({"deprecation", "unchecked"})
    private <T extends Parcelable> ArrayList<T> getParcelableArrayList(Intent intent, String key, Class<T> cls) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableArrayListExtra(key, cls);
        }
        return (ArrayList<T>) intent.getParcelableArrayListExtra(key);
    }
}
