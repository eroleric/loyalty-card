package com.loyaltycard.prototype;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.ExtractedText;
import android.view.inputmethod.ExtractedTextRequest;
import android.view.inputmethod.InputMethodManager;
import android.text.InputType;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.*;
import org.json.JSONObject;
import java.util.Collections;
import java.nio.charset.StandardCharsets;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;

public class MainActivity extends Activity {
    static final String HOME = "https://appassets.androidplatform.net/assets/index.html";
    static final String SIGNUP = "https://inner-circle.circlek.com/";
    WebView home, retailer;
    Button fill;
    TextView status;
    JavaScriptReplyProxy authReply;
    String savedPhone = "";
    boolean awaitingPhoneFocus = false;
    boolean autoFillPending = false;
    volatile boolean enrollmentOpen = false;
    volatile boolean authReady = false, fillVerified = false;
    volatile String failure = "";
    volatile String fillDiagnostic = "";
    LinearLayout retailerPanel;

    @Override public void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE); setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        root.requestApplyInsets();
        home = new WebView(this); configure(home);
        root.addView(home, new LinearLayout.LayoutParams(-1, 0, 1));
        retailerPanel = new LinearLayout(this); retailerPanel.setOrientation(LinearLayout.VERTICAL);
        retailerPanel.setVisibility(View.GONE);
        root.addView(retailerPanel, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout actions = new LinearLayout(this);
        Button back = new Button(this); back.setText("Back to profile");
        fill = new Button(this); fill.setText("Retry phone fill"); fill.setEnabled(false);
        actions.addView(back, new LinearLayout.LayoutParams(0, -2, 1));
        actions.addView(fill, new LinearLayout.LayoutParams(0, -2, 1)); retailerPanel.addView(actions);
        status = new TextView(this); status.setPadding(20, 12, 20, 12);
        status.setTextSize(14); retailerPanel.addView(status);
        retailer = new WebView(this); configure(retailer);
        retailerPanel.addView(retailer, new LinearLayout.LayoutParams(-1, 0, 1));
        back.setOnClickListener(v -> { enrollmentOpen = false; autoFillPending = false; retailerPanel.setVisibility(View.GONE); home.setVisibility(View.VISIBLE); });
        fill.setOnClickListener(v -> fillSavedPhone());
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        home.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !"appassets.androidplatform.net".equals(request.getUrl().getHost());
            }
            @Override public void onPageFinished(WebView view, String url) {
                home.evaluateJavascript("(() => { if(document.getElementById('native-enroll'))return; const b=document.createElement('button');b.id='native-enroll';b.className='button button-primary retailer-preview';b.textContent='Try assisted signup';b.onclick=()=>{let phone='';try{phone=JSON.parse(localStorage.getItem('loyalty-card.profile.v1')||'{}').profile?.phone||'';}catch{} LoyaltyNative.postMessage(JSON.stringify({phone}));};const note=document.createElement('p');note.className='retailer-preview';note.textContent='Opens Circle K and fills your saved phone. Review it before continuing.';document.querySelector('.retailer-details')?.append(note,b);})()", null);
            }
        });
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            failure = "This Android WebView needs an update for assisted signup.";
            status.setText(failure); home.setVisibility(View.GONE); retailerPanel.setVisibility(View.VISIBLE); return;
        }
        WebViewCompat.addWebMessageListener(home, "LoyaltyNative", Collections.singleton("https://appassets.androidplatform.net"),
            (view, message, origin, mainFrame, reply) -> {
                if (!mainFrame || !"appassets.androidplatform.net".equals(origin.getHost())) return;
                try { savedPhone = normalizePhone(new JSONObject(message.getData()).optString("phone")); startEnrollment(); }
                catch (Exception e) { failure = "Could not read the saved phone."; }
            });
        WebViewCompat.addWebMessageListener(retailer, "CircleAssist", Collections.singleton("https://auth.circlek.com"),
            (view, message, origin, mainFrame, reply) -> {
                if (!"https".equals(origin.getScheme()) || !"auth.circlek.com".equals(origin.getHost())) return;
                if (!enrollmentOpen) return;
                try {
                    JSONObject event = new JSONObject(message.getData());
                    if ("ready".equals(event.optString("type"))) {
                        authReply = reply; authReady = true; fill.setEnabled(!savedPhone.isEmpty());
                        status.setText(savedPhone.isEmpty() ? "Save a US phone in My profile first. You can also type it here." : "Filling your saved phone. Review it before continuing.");
                        if (autoFillPending) { autoFillPending = false; fillSavedPhone(); }
                    } else if ("focused".equals(event.optString("type")) && awaitingPhoneFocus) {
                        awaitingPhoneFocus = false;
                        retailer.postDelayed(() -> commitPhoneToFocusedEditor(), 250);
                    } else if ("filled".equals(event.optString("type"))) {
                        fillVerified = event.optBoolean("matched");
                        fillDiagnostic = "digits retained: " + event.optInt("digitCount");
                        status.setText(fillVerified ? "Phone filled. Review it. Continue, verification, CAPTCHA, and consent are yours to complete." : "Circle K did not retain the value (" + event.optInt("digitCount") + " digits). Enter your phone manually.");
                    } else { status.setText("The signup form changed. Enter your phone manually."); }
                } catch (Exception e) { status.setText("Could not confirm the fill. Review the form manually."); }
            });
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream source = getAssets().open("circle-k-assist.js")) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = source.read(buffer)) != -1) bytes.write(buffer, 0, count);
            }
            String adapter = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
            WebViewCompat.addDocumentStartJavaScript(retailer, adapter, Collections.singleton("https://auth.circlek.com"));
        } catch (Exception e) { failure = "Adapter could not load."; }
        retailer.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                boolean allowed = "https".equals(uri.getScheme()) && ("inner-circle.circlek.com".equals(uri.getHost()) || "auth.circlek.com".equals(uri.getHost()));
                if (!allowed) status.setText("External link stopped in this test app. Use the official Circle K browser page for it.");
                return !allowed;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) { failure = "Circle K could not load: " + error.getDescription(); status.setText(failure); }
            }
        });
        home.loadUrl(HOME);
    }
    private void configure(WebView view) {
        view.getSettings().setJavaScriptEnabled(true); view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setAllowFileAccess(false); view.getSettings().setAllowContentAccess(false);
        view.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    }
    static String normalizePhone(String phone) {
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() == 11 && digits.startsWith("1")) digits = digits.substring(1);
        return digits.matches("[2-9][0-9]{9}") ? digits : "";
    }
    void startEnrollment() {
        authReply = null; authReady = false; fillVerified = false; awaitingPhoneFocus = false; enrollmentOpen = true; autoFillPending = !savedPhone.isEmpty(); fill.setEnabled(false);
        home.setVisibility(View.GONE); retailerPanel.setVisibility(View.VISIBLE);
        status.setText("Opening Circle K and preparing your saved phone. Review it before continuing."); retailer.loadUrl(SIGNUP);
    }
    void fillSavedPhone() {
        if (!enrollmentOpen || awaitingPhoneFocus || authReply == null || savedPhone.isEmpty()) return;
        fillVerified = false; fillDiagnostic = "";
        retailer.requestFocus(); awaitingPhoneFocus = true;
        try { JSONObject request = new JSONObject(); request.put("type", "focus"); authReply.postMessage(request.toString()); }
        catch (Exception e) { status.setText("Could not fill. Enter your phone manually."); }
    }
    void commitPhoneToFocusedEditor() {
        if (!enrollmentOpen) return;
        // Native text entry triggers the same trusted editing path as the Android keyboard.
        // JavaScript focuses the known phone input; refuse non-phone native editors.
        EditorInfo editor = new EditorInfo();
        InputConnection connection = retailer.onCreateInputConnection(editor);
        if (connection == null || (editor.inputType & InputType.TYPE_MASK_CLASS) != InputType.TYPE_CLASS_PHONE) {
            fillDiagnostic = "Phone editor was not focused (input type " + editor.inputType + ")";
            status.setText("Tap the phone field, then try Retry phone fill."); return;
        }
        Handler editorHandler = connection.getHandler();
        if (editorHandler == null) { fillDiagnostic = "Phone editor thread unavailable"; status.setText("Enter your phone manually."); return; }
        // Chromium requires these editor operations on the InputConnection's IME thread.
        final String number = "1" + savedPhone;
        editorHandler.post(() -> typePhoneDigit(connection, editorHandler, number, 0));
    }
    void typePhoneDigit(InputConnection connection, Handler editorHandler, String number, int index) {
        if (!enrollmentOpen) return;
        try {
            ExtractedText existing = connection.getExtractedText(new ExtractedTextRequest(), 0);
            if (existing == null || existing.text == null) throw new IllegalStateException("Phone editor text unavailable");
            int length = existing.text.length();
            connection.setSelection(index == 0 ? 0 : length, length);
            if (!connection.commitText(String.valueOf(number.charAt(index)), 1)) throw new IllegalStateException("Native text entry failed");
            if (index + 1 < number.length()) {
                editorHandler.postDelayed(() -> typePhoneDigit(connection, editorHandler, number, index + 1), 90);
            } else {
                retailer.post(() -> {
                    ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(retailer.getWindowToken(), 0);
                    try {
                        JSONObject request = new JSONObject(); request.put("type", "verify"); request.put("phone", savedPhone);
                        authReply.postMessage(request.toString());
                    } catch (Exception e) { status.setText("Review the filled phone manually."); }
                });
            }
        } catch (RuntimeException | AssertionError error) {
            fillDiagnostic = "Native editor operation unavailable: " + error.getClass().getSimpleName();
            retailer.post(() -> status.setText("Could not fill this phone editor. Enter your phone manually."));
        }
    }
}
