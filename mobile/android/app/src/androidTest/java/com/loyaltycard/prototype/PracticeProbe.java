package com.loyaltycard.prototype;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import org.json.JSONObject;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Runs only the bundled offline fixture. Never opens a retailer URL. */
public class PracticeProbe extends EnrollmentProbe {
    volatile String snapshot = "";
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            activity = (MainActivity) startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            long until = System.currentTimeMillis() + 20000;
            while (System.currentTimeMillis() < until && !"true".equals(js("!!document.getElementById('native-enroll')"))) Thread.sleep(200);
            require("true".equals(js("!!document.getElementById('native-enroll')")), "Home did not load");
            originalProfile = js("localStorage.getItem('loyalty-card.profile.v1')");
            js("(()=>{location.hash='profile';for(const [id,value] of [['firstName','Taylor'],['phone','+1 (202) 555-0148'],['email','taylor@example.com']]){document.getElementById(id).value=value;}document.getElementById('profile-form').requestSubmit();return true;})()");
            runOnMainSync(() -> {
                WebViewCompat.addWebMessageListener(activity.retailer, "PracticeProbe", Collections.singleton("https://auth.loyalty.test"), (v,m,o,f,r) -> snapshot=m.getData());
                WebViewCompat.addDocumentStartJavaScript(activity.retailer,
                    "window.addEventListener('message',e=>{if(e.origin!=='https://appassets.androidplatform.net'||e.source!==parent)return;const a=e.data.testAction;if(!a)return;const q=s=>document.querySelector(s);switch(a){case 'phoneNext':q('#phone-form').requestSubmit();break;case 'code':q('#otp').value=e.data.value;q('#code-form').requestSubmit();break;case 'resend':q('#resend').click();break;case 'finish':q('#details-form').requestSubmit();break;case 'consent':q('#terms').checked=true;break;case 'challenge':q('#challenge-check').checked=true;q('#challenge-next').click();break;case 'scenario':q('#scenario').value=e.data.value;q('#scenario').dispatchEvent(new Event('change'));break;}PracticeProbe.postMessage(JSON.stringify({stage:document.body.dataset.stage,outcome:document.body.dataset.outcome,message:q('#message').textContent,terms:q('#terms')?.checked||false,marketing:q('#marketing-sms')?.checked||q('#marketing-email')?.checked||false,email:q('#email')?.value||'',phone:q('#phone')?.value||''}));});",
                    Collections.singleton("https://auth.loyalty.test"));
            });
            js("document.getElementById('native-enroll').click()");
            waitForFill();
            require(activity.practiceMode, "Test unexpectedly selected live mode");
            screenshot("circle-k-practice-phone.png");
            require(action("phoneNext", "").optString("stage").equals("sms"), "Phone did not reach simulated SMS");
            require(action("code", "000000").optString("message").contains("incorrect"), "Wrong code was accepted");
            require(action("code", "123456").optString("stage").equals("details"), "Correct code failed");
            until = System.currentTimeMillis()+5000;
            while (!activity.practiceEmailFilled && System.currentTimeMillis()<until) Thread.sleep(100);
            JSONObject details = action("inspect", "");
            require(details.optString("email").equals("taylor@example.com"), "Saved email not filled");
            require(!details.optBoolean("terms") && !details.optBoolean("marketing"), "Consent was selected automatically");
            require(action("finish", "").optString("stage").equals("details"), "Missing consent accepted");
            screenshot("circle-k-practice-details.png");
            action("consent", "");
            require(action("finish", "").optString("outcome").equals("signed-up"), "New member did not complete signup");
            screenshot("circle-k-practice-complete.png");
            action("scenario", "forbidden"); waitForFill();
            require(action("phoneNext", "").optString("stage").equals("error"), "403 scenario failed");
            action("scenario", "captcha"); waitForFill();
            require(action("phoneNext", "").optString("stage").equals("captcha"), "CAPTCHA handoff failed");
            require(action("challenge", "").optString("stage").equals("sms"), "User challenge action failed");
            action("scenario", "expired"); waitForFill(); action("phoneNext", "");
            require(action("code", "123456").optString("message").contains("expired"), "Expired code accepted");
            action("resend", ""); require(action("code", "123456").optString("stage").equals("details"), "Resend recovery failed");
            action("scenario", "existing"); waitForFill(); action("phoneNext", "");
            require(action("code", "000000").optString("stage").equals("sms"), "Existing member bypassed verification");
            JSONObject existing = action("code", "123456");
            require(existing.optString("outcome").equals("signed-in"), "Existing member incorrectly routed to signup");
            require(existing.optString("email").isEmpty() && !existing.optBoolean("terms"), "Existing member was shown signup fields");
            screenshot("circle-k-practice-signin.png");
            AtomicReference<Boolean> networkBlocked = new AtomicReference<>(false);
            runOnMainSync(() -> networkBlocked.set(activity.retailer.getSettings().getBlockNetworkLoads()));
            require(networkBlocked.get(), "Network was enabled");
            require(activity.blockedPracticeRequests == 0, "Fixture attempted a nonlocal resource");
            restoreProfile();
            result.putString("result", "PASS: offline one-tap phone and email autofill; wrong/expired codes, resend, CAPTCHA handoff, consent gate, success, existing-member and 403 scenarios. Network loads disabled; no nonlocal resources requested. Original profile restored.");
            finish(0,result);
        } catch (Throwable error) {
            try { screenshot("circle-k-practice-failure.png"); restoreProfile(); } catch(Exception restoreError) {result.putString("restoreError",restoreError.toString());}
            result.putString("result", "FAIL: "+error); finish(1,result);
        }
    }
    private void waitForFill() throws Exception {
        long until=System.currentTimeMillis()+15000;
        while (!activity.fillVerified && System.currentTimeMillis()<until) Thread.sleep(100);
        require(activity.fillVerified, "Practice phone autofill failed: "+activity.fillDiagnostic);
    }
    private JSONObject action(String action, String value) throws Exception {
        snapshot="";
        String payload=new JSONObject().put("testAction",action).put("value",value).toString();
        CountDownLatch done=new CountDownLatch(1);
        runOnMainSync(()->activity.retailer.evaluateJavascript("document.querySelector('iframe').contentWindow.postMessage("+payload+",'https://auth.loyalty.test')",r->done.countDown()));
        require(done.await(5,TimeUnit.SECONDS),"Action timed out");
        long until=System.currentTimeMillis()+5000;
        while(snapshot.isEmpty()&&System.currentTimeMillis()<until)Thread.sleep(50);
        require(!snapshot.isEmpty(),"No practice response: "+action);
        return new JSONObject(snapshot);
    }
}

