# Loyalty Card Android prototype

## Current mode: offline practice

The Android app bundles our existing profile UI and a local Circle K signup simulation. Choose **Practice Circle K signup** from the retailer card. This fills the saved phone automatically; later it fills the saved email for review. No live enrollment is opened from the home screen.

Practice sequence: phone review → optional simulated CAPTCHA → practice SMS code → new-member email/marketing/consent → simulated completion. The code is **123456**, and no text is sent. Test scenarios provide server refusal (403), expired code with resend recovery, and existing-member sign-in. An incorrect six-digit code stays on the verification screen. Marketing choices and practice consent are never selected automatically. The practice terms are local placeholder terms, not an agreement with Circle K.

Everything is bundled in the APK: no remote fonts, scripts, analytics, assets, requests, or SMS. Android disables network loads while practice mode is active; WebView request interception serves only packaged assets and rejects everything else. Content Security Policy also disallows connections and form navigation. The mock auth form uses a separate local origin, `auth.loyalty.test`, to exercise our exact-origin bridge and the same native phone insertion path used in the earlier live test. Practice email fill is limited to that local origin. The fixture does not reproduce Circle K's full backend, React state behavior, fraud detection, or real CAPTCHA service.

The profile stays on this Android installation. It does not share the profile saved in a desktop browser. No password, payment information, or completed enrollment record is stored by practice mode. Uninstalling the app removes the Android profile.

## Research and fidelity — October 11, 2026

Study used public informational pages and GET requests for the publicly served signup HTML/JavaScript. No signup/check-user POST, SMS request, or account creation was performed during this work.

Verified sources:

- [Official Inner Circle overview](https://www.circlek.com/inner-circle): US mobile number participation and website/app enrollment.
- [Public auth entry](https://auth.circlek.com/en?appId=blt3f3321ced95bb768&bu=us): phone-first configuration, US country code, marketing options and terms configuration.
- [Public signup component](https://auth.circlek.com/_next/static/chunks/4779.c64ac98631658c05.js): US fields are email and phone; first/last name are EU-specific; password is configuration-dependent.
- [Public passwordless verification component](https://auth.circlek.com/_next/static/chunks/1665.24e22fd3a623a6f0.js): verification and new-versus-existing-member branches. Deployment URLs may change.

The public page's actual verification component was read through its webpack mapping (component 1665); it distinguishes existing-member success from a new-user details step. The public standard OTP component (260) supports another registration path. Step order depends on server responses. Our fixture chooses the phone → verification → details path; it is not a captured successful live enrollment. The exact six-digit practice code, timeout/error triggers, CAPTCHA checkbox, and explicit practice-consent gate are simulation choices. Circle K's observed US configuration hides its terms checkboxes, so our explicit gate deliberately tests user consent rather than matching that screen pixel for pixel. No real barcode, rewards, points, or membership number is invented.

Later live enrollment remains unverified. The live experiment retained a fictional phone on Android 14 and Android 17 emulators, but subsequent user attempts logged three check-user 403 responses. The cause of those refusals has not been established.

## Build and verification

Requires Java 17+, SDK platform 36 and a compatible Android emulator/device. Configure `ANDROID_HOME` or ignored `android/local.properties`.

```powershell
cd mobile/android
./gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
adb -s YOUR_TEST_DEVICE install -r app/build/outputs/apk/debug/app-debug.apk
adb -s YOUR_TEST_DEVICE install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s YOUR_TEST_DEVICE shell am instrument -w com.loyaltycard.prototype.test/com.loyaltycard.prototype.PracticeProbe
```

`PracticeProbe` is the default test runner. It temporarily saves fictional phone/email through the profile UI, tests one-tap phone insertion, email fill, wrong/expired codes, resend, CAPTCHA handoff, consent gating, simulated success, existing-member and 403 scenarios. It verifies network loads are disabled and no nonlocal resource was requested, then restores and verifies the original profile. Screenshots are saved in the app's external files directory. Use a test installation. Inspect `INSTRUMENTATION_RESULT` for PASS; adb's process exit code alone does not prove success.

Build and lint passed; the full offline scenario test passed on the current Android emulator. Physical-device behavior is untested. This is a debug prototype.

## Archived live experiment

`EnrollmentProbe` remains an explicitly named live runner for historical testing; do not run it while developing the offline fixture. It opens Circle K and verifies phone retention only, never submitting enrollment or requesting SMS. The production bridge restricts live messages to the exact auth.circlek.com origin. Normal TLS, default WebView user agent, and blocked file/content access remain enabled. Live top-level navigation outside the two signup hosts is blocked in this experiment, so its terms/privacy navigation is incomplete.

Circle K's [Inner Circle terms](https://www.circlek.com/inner-circle/terms-and-conditions), effective August 25, 2026 and checked October 11, restrict framing/altering content and interference with access controls. Technical autofill success is not legal clearance, retailer acceptance, or store approval. Offline practice does not resolve those production questions. No iOS implementation or store review has been completed.
