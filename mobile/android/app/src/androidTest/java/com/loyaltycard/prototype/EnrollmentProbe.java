package com.loyaltycard.prototype;

import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import androidx.webkit.WebViewCompat;
import java.util.HashSet;
import java.util.Arrays;

/** A non-submitting smoke test against the real Circle K page. Never clicks Let's go. */
public class EnrollmentProbe extends Instrumentation {
    MainActivity activity;
    String originalProfile;
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Intent intent = new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = (MainActivity) startActivitySync(intent);
            long until = System.currentTimeMillis() + 20000;
            while (System.currentTimeMillis() < until && !"true".equals(js("!!document.getElementById('native-enroll')"))) Thread.sleep(250);
            require("true".equals(js("!!document.getElementById('native-enroll')")), "Local profile UI did not load");
            originalProfile = js("localStorage.getItem('loyalty-card.profile.v1')");
            // Drive the real profile save UI with a reserved fictional telephone number.
            js("(()=>{location.hash='profile'; for(const [id,value] of [['firstName','Taylor'],['phone','+1 (202) 555-0148']]){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}document.getElementById('profile-form').requestSubmit();return document.getElementById('saved-profile-state').textContent;})()");
            require(js("document.getElementById('saved-profile-state').textContent").contains("saved on this device"), "Save failed");
            // A fresh test WebView gets a cookie notice. Choose the visible necessary-only
            // option in the test; production leaves that choice to the person using the app.
            runOnMainSync(() -> WebViewCompat.addDocumentStartJavaScript(activity.retailer,
                "document.addEventListener('DOMContentLoaded',()=>{let tries=0;const timer=setInterval(()=>{const b=Array.from(document.querySelectorAll('button,a')).find(el=>el.textContent.trim()==='Use necessary cookies only');if(b){b.click();clearInterval(timer);}if(++tries>120)clearInterval(timer);},500);});",
                new HashSet<>(Arrays.asList("https://inner-circle.circlek.com", "https://auth.circlek.com"))));
            js("document.getElementById('native-enroll').click()");
            until = System.currentTimeMillis() + 90000;
            while (System.currentTimeMillis() < until && !activity.authReady && activity.failure.isEmpty()) Thread.sleep(500);
            screenshot("circle-k-loaded.png");
            require(activity.authReady, "Live auth frame not ready: " + activity.failure);
            require("2025550148".equals(activity.savedPhone), "Profile phone did not transfer correctly");
            until = System.currentTimeMillis() + 10000;
            while (System.currentTimeMillis() < until && !activity.fillVerified) Thread.sleep(200);
            screenshot("circle-k-filled.png");
            require(activity.fillVerified, "Circle K did not retain the automatic fill after the single signup click: " + activity.fillDiagnostic);
            result.putString("result", "PASS: actual Circle K iframe loaded in Android WebView; saved fictional phone retained after assisted fill. No submission, OTP, CAPTCHA, or membership creation performed.");
            result.putString("screenshots", activity.getExternalFilesDir(null).getAbsolutePath());
            restoreProfile();
            finish(0, result);
        } catch (Throwable error) {
            try { screenshot("circle-k-failure.png"); } catch (Exception ignored) {}
            try { restoreProfile(); } catch (Exception restoreError) { result.putString("restoreError", restoreError.getMessage()); }
            result.putString("result", "FAIL: " + error.getMessage()); finish(1, result);
        }
    }
    private void restoreProfile() throws Exception {
        if (originalProfile == null) return;
        js("(()=>{const previous=" + originalProfile + ";if(previous===null)localStorage.removeItem('loyalty-card.profile.v1');else localStorage.setItem('loyalty-card.profile.v1',previous);return true;})()");
        require(originalProfile.equals(js("localStorage.getItem('loyalty-card.profile.v1')")), "Original profile restoration failed");
    }
    private String js(String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> value = new AtomicReference<>();
        runOnMainSync(() -> activity.home.evaluateJavascript(script, response -> { value.set(response); done.countDown(); }));
        require(done.await(5, TimeUnit.SECONDS), "Profile script timed out"); return value.get();
    }
    private void screenshot(String name) throws Exception {
        Bitmap image = getUiAutomation().takeScreenshot();
        require(image != null, "Screenshot unavailable");
        try (FileOutputStream file = new FileOutputStream(new File(activity.getExternalFilesDir(null), name))) {
            image.compress(Bitmap.CompressFormat.PNG, 100, file);
        }
        image.recycle();
    }
    private void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
}
