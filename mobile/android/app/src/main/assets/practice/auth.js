(() => {
  const step = document.getElementById('step');
  const message = document.getElementById('message');
  const scenario = document.getElementById('scenario');
  let phone = '', email = '', stage = '', codeExpired = false;
  const report = (name, label, outcome = '') => {
    stage = name;
    document.body.dataset.stage = name;
    document.body.dataset.outcome = outcome;
    window.CircleAssist?.postMessage(JSON.stringify({type:'stage',stage:name,label,outcome}));
    parent.postMessage({type:'practice-stage',stage:name}, 'https://appassets.androidplatform.net');
  };
  const error = text => { message.textContent = text; };
  const render = (html, name, label, outcome = '') => {
    message.textContent = '';
    step.innerHTML = html;
    report(name, label, outcome);
  };
  const start = () => {
    phone = ''; email = ''; codeExpired = false;
    render('<p class="eyebrow">STEP 1 · PHONE</p><h2>Sign up or sign in</h2><p>Review your saved US mobile number before continuing.</p><form id="phone-form"><label for="phone">Mobile phone number</label><input id="phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required value="1"><button type="submit">Let’s go</button></form>', 'phone', 'Review your phone, then continue.');
    document.getElementById('phone-form').onsubmit = event => {
      event.preventDefault();
      const digits = document.getElementById('phone').value.replace(/\D/g, '');
      phone = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
      if (!/^[2-9]\d{9}$/.test(phone)) { error('Enter a valid 10-digit US phone number.'); return; }
      if (scenario.value === 'forbidden') {
        render('<h2>Something went wrong</h2><p>Practice server refused the request (403). No real server was contacted.</p><button id="recover" type="button">Back to phone</button>', 'error', 'Simulated server refusal.');
        document.getElementById('recover').onclick = start;
      } else if (scenario.value === 'captcha') challenge();
      else verification();
    };
  };
  const challenge = () => {
    render('<p class="eyebrow">USER ACTION</p><h2>Verification challenge</h2><p>This is a stand-in for a CAPTCHA handoff, not Google reCAPTCHA.</p><label class="check"><input id="challenge-check" type="checkbox">I completed the practice challenge myself.</label><button id="challenge-next" type="button">Continue</button>', 'captcha', 'Complete the practice challenge yourself.');
    document.getElementById('challenge-next').onclick = () => {
      if (!document.getElementById('challenge-check').checked) { error('Complete the practice challenge first.'); return; }
      verification();
    };
  };
  const verification = () => {
    codeExpired = scenario.value === 'expired';
    render('<p class="eyebrow">STEP 2 · VERIFICATION</p><h2>Enter your code</h2><p>No text was sent. This tests the point where you would enter an SMS code.</p><p class="code-hint">Practice code: <strong>123456</strong></p><form id="code-form"><label for="otp">6-digit verification code</label><input id="otp" name="otp" type="text" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]{6}" required><button type="submit">Verify code</button></form><button id="resend" class="secondary" type="button">Get a new practice code</button>', 'sms', 'Enter the practice code yourself.');
    if (scenario.value === 'existing') {
      step.querySelector('h2').textContent = 'Sign in with your code';
      step.querySelector('h2 + p').textContent = 'This scenario represents an existing member. Verify your phone to sign in; no new account will be created. No text was sent.';
      document.querySelector('#code-form button').textContent = 'Verify and sign in';
    }
    document.getElementById('resend').onclick = () => { codeExpired = false; error('New practice code ready: 123456. No text was sent.'); };
    document.getElementById('code-form').onsubmit = event => {
      event.preventDefault();
      if (codeExpired) { error('This practice code expired. Get a new practice code.'); return; }
      if (document.getElementById('otp').value !== '123456') { error('That code is incorrect. Try 123456.'); return; }
      if (scenario.value === 'existing') complete(true); else details();
    };
  };
  const details = () => {
    // Public US configuration has email/phone, not the EU first/last-name fields.
    render('<p class="eyebrow">STEP 3 · DETAILS</p><h2>Complete your details</h2><p>Your saved email is filled for review. This practice does not require an address or password.</p><form id="details-form"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required><label class="check"><input id="marketing-sms" type="checkbox">Receive promotional texts (optional practice choice).</label><label class="check"><input id="marketing-email" type="checkbox">Receive promotional emails (optional practice choice).</label><label class="check"><input id="terms" type="checkbox" required><span>I accept the <a href="#" id="practice-terms">practice terms</a>. This gives no consent to Circle K.</span></label><button type="submit">Finish practice signup</button></form><dialog id="terms-dialog"><h2>Practice terms</h2><p>This is an offline simulation. No membership is created, no marketing consent is sent, and no rewards are issued. Real Circle K terms must be reviewed during a real signup.</p><button id="close-terms" type="button">Close</button></dialog>', 'details', 'Review your email and choose consent yourself.');
    document.getElementById('practice-terms').onclick = event => { event.preventDefault(); document.getElementById('terms-dialog').showModal(); };
    document.getElementById('close-terms').onclick = () => document.getElementById('terms-dialog').close();
    document.getElementById('details-form').onsubmit = event => { event.preventDefault(); email = document.getElementById('email').value; complete(false); };
  };
  const complete = existing => {
    render(`<p class="eyebrow">PRACTICE COMPLETE</p><h2>${existing ? 'Practice sign-in complete' : 'Practice signup complete'}</h2><p>${existing ? 'Your existing practice account was signed in. Signup details were skipped; no duplicate account was created.' : 'Your new-member practice flow is complete.'} No real Circle K account or card was created.</p><button id="again" type="button">Practice again</button>`, 'complete', existing ? 'Existing member signed in · simulation only.' : 'New member signup completed · simulation only.', existing ? 'signed-in' : 'signed-up');
    document.getElementById('again').onclick = start;
  };
  document.getElementById('restart').onclick = start;
  scenario.onchange = start;
  // No fetch, analytics, remote resources, SMS, or persistent enrollment data.
  new ResizeObserver(() => parent.postMessage({type:'practice-height',height:document.documentElement.scrollHeight}, 'https://appassets.androidplatform.net')).observe(document.body);
  start();
})();
