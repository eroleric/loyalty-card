# Mobile enrollment experiment

This is a native Android WebView prototype, separate from the public GitHub Pages website. It bundles the existing `dist/` UI and profile code. The website remains a profile/preview prototype.

## What it does

1. Save a US mobile phone in My profile inside the Android app.
2. Choose **Try assisted signup** on Circle K's card.
3. The app opens the official `https://inner-circle.circlek.com/` enrollment page.
4. Once its `https://auth.circlek.com/` iframe is ready, the app fills the saved phone automatically after that initial signup tap.
5. Review the phone and handle subsequent steps yourself. **Retry phone fill** is available if needed.

The adapter never submits the form, requests an SMS, fills an OTP, checks consent, or solves a CAPTCHA. It reports a successful fill only if the input still contains the expected number after the page has rerendered. This does not establish that the retailer has accepted the number or that membership was created.

Only the saved phone is passed to the retailer frame. No credentials or profile are sent automatically when opening the page. Each WebView bridge is restricted to its exact origin; there is no general JavaScript interface exposed to arbitrary websites. Normal TLS checks and the standard WebView user agent remain enabled. The `circle-k-assist.js` adapter is injected using AndroidX WebKit's document-start API so it can operate inside the cross-origin authentication frame.

The Android profile is stored locally in its own app WebView. It does **not** automatically share the profile saved in Chrome, Safari, or the GitHub Pages site. This prototype has no cloud service, no password storage, and no enrollment confirmation tracking. Android uninstall removes its local profile.

## Build and test

Requires Java 17+, Android SDK platform 36, and a compatible emulator/device. Set `ANDROID_HOME` or create ignored `android/local.properties` with `sdk.dir=...`.

```powershell
cd mobile/android
./gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest
adb -s YOUR_TEST_DEVICE install -r app/build/outputs/apk/debug/app-debug.apk
adb -s YOUR_TEST_DEVICE install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s YOUR_TEST_DEVICE shell am instrument -w com.loyaltycard.prototype.test/com.loyaltycard.prototype.EnrollmentProbe
```

The instrumentation probe temporarily saves a reserved fictional phone through the actual profile UI, taps the signup control once, and checks the frame's reported retained value without tapping a separate fill control. It restores and verifies the original local profile afterward. It does not press Circle K's **Let's go** button. Screenshots are saved under the test app's external files directory. Run only in a test installation.

## Scope and remaining work

This tests the first signup step, not end-to-end enrollment. Real phone verification, CAPTCHA behavior, terms/consent, later fields, navigation, and recovery must be checked before calling enrollment working. No iOS build or App Store review has been performed. Windows can build/test Android; an iOS WKWebView implementation and a Mac/device test are still required.

Official entry observed on October 11, 2026: [Circle K Inner Circle](https://www.circlek.com/inner-circle) links to the above enrollment site. The observed first field is `input[type="tel"][name="phone"]` within `auth.circlek.com`.

Platform mechanism: [AndroidX WebViewCompat](https://developer.android.com/reference/androidx/webkit/WebViewCompat#addDocumentStartJavaScript(android.webkit.WebView,java.lang.String,java.util.Set%3Cjava.lang.String%3E)).

## Verified result — October 11, 2026

The instrumentation test passed on an Android 14 (API 34) emulator with Android System WebView 153.0.8010.36. The real Circle K authentication iframe retained the saved fictional number, `+1 (202) 555-0148`, and the screenshot confirmed the formatted value. No form submission, SMS request, CAPTCHA solving, or membership creation was performed. Physical Android devices and iOS remain untested.

Bulk JavaScript input events and whole-number native insertion reset Circle K's field to its country prefix. The working prototype focuses the phone field through the origin-restricted adapter, then inserts digits individually through Android's public [InputConnection](https://developer.android.com/reference/android/view/inputmethod/InputConnection) API on its editor thread. It verifies the retained value afterward and offers manual entry when it cannot confirm the fill. This retailer-specific behavior may change with Circle K or WebView updates.

This is a debug test app, not a production release or store-approved app. External links outside the two enrollment hosts are blocked in this experiment; terms/privacy navigation must be completed before a full enrollment release. The test-only runner chooses necessary cookies only; the production app leaves cookie choices to the user.

The same non-submitting test also passed on the user's Android 17 / API 37 emulator with WebView 153.0.8010.36. Its initially empty app profile was populated with the fictional test profile; it is not a real membership. No SMS or account was requested.

## Policy limitation

Circle K's [Inner Circle terms](https://www.circlek.com/inner-circle/terms-and-conditions), effective August 25, 2026 and checked October 11, restrict framing or altering content, limit the license to personal non-commercial use, and restrict interference with access controls. Successful embedded form entry is technical evidence, not legal clearance for distributing this integration. Do not treat this experiment as a production enrollment connector. A lower-risk direction is opening the official external browser and letting the person use ordinary autofill or paste saved details, with explicit verification and consent. That direction still requires its own policy review and device testing.

Hybrid retest on October 11: the current Android emulator again passed live Circle K phone entry without submission. The test runner now snapshots the existing local profile, restores it on success or failure, and verifies restoration. Full signup, real-device behavior, and policy clearance remain unverified.

One-tap update verified October 11: Try assisted signup now authorizes opening Circle K and automatically filling the saved phone once the auth frame is ready. The live Android emulator test passed without using the retry button. Build and lint passed. No submission or verification was automated.
