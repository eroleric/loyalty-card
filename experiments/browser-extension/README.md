# Minimal platform comparison — October 11, 2026

This unpacked Manifest V3 extension was installed with the user's explicit approval in desktop Brave. It is a diagnostic experiment, not a released enrollment product. It has no background agent, debugger permission, backend, credential storage, or submission logic. Matches are limited to the two official Circle K signup hosts.

| Approach | Observed result | Boundary |
| --- | --- | --- |
| Android APK | PASS on Android 14 and Android 17 emulators, WebView 153.0.8010.36 | Native digit-by-digit InputConnection insertion retained the saved fictional phone. Physical devices, iOS and completed enrollment untested. |
| Desktop browser extension | PASS in real Circle K auth iframe in desktop Brave | Bulk JS input reset; incremental JS value updates with input/change events retained +1 (202) 555-0148 after a delay and blur. Chrome/Edge installation and mobile browsers untested. |
| Ordinary website script | BLOCKED with SecurityError | MAIN-world parent script could not read the loaded auth iframe document. It deliberately used ordinary webpage privileges. Extension-isolated privileges are not valid evidence for this test. |

The screenshot shows both the extension PASS and webpage SecurityError alongside the actual formatted phone. No Let's go click, SMS request, OTP, CAPTCHA solution, consent selection or membership creation occurred. The phone is a reserved fictional number. Existing real phones cause the test to stop rather than overwrite them.

The first website probe ran too early and used extension-isolated privileges; its apparent allowed access was discarded. The corrected probe waits for actual navigation in MAIN world. Only the corrected result above is evidence for the website limitation.

The website experiment tests cross-origin DOM access from Circle K's parent page to its auth frame; our GitHub Pages origin is also separate from the auth origin. This does not rule out user-driven browser autofill, an explicitly cooperating retailer API, or an extension. It does rule out treating an ordinary webpage as a cross-site autofill agent.

Recommendation for the existing phone-first concept: keep Android as the proven mobile prototype. The extension is a viable desktop prototype; a plain website alone cannot implement this direct cross-site assisted fill. The tests establish only phone entry, not end-to-end enrollment, reliability across retailers, store approval, or legal compliance. Circle K's terms restrict framing/altering content; the policy concern recorded in `../../mobile/README.md` remains unresolved for production integrations.

Official platform references: [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy), [Circle K terms](https://www.circlek.com/inner-circle/terms-and-conditions).

The extension adds a test panel, but fills only after the explicit **Test fictional phone fill** click. It remains installed for inspection. Turn it off in the extension manager when finished testing. Do not publish it as a real signup feature.
