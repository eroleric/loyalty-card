(() => {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#fff;color:#111;border:2px solid #19634b;padding:12px;font:14px sans-serif;max-width:330px;box-shadow:0 2px 12px #777';
  const title = document.createElement('strong');
  title.textContent = 'Loyalty Card · diagnostic only';
  const result = document.createElement('p');
  panel.append(title, result); document.body.append(panel);
  result.textContent = 'Extension loaded in real auth frame. No submission.';
  const button = document.createElement('button');
  button.textContent = 'Test fictional phone fill';
  panel.append(button);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const expected = '12025550148';
  const digits = input => input.value.replace(/\D/g, '');
  button.onclick = async () => {
    button.disabled = true;
    const input = document.querySelector('input[type="tel"][name="phone"]');
    if (!input) { result.textContent = 'FAIL: phone field missing'; button.disabled = false; return; }
    if (digits(input).length > 1) { result.textContent = 'Stopped: existing phone would be overwritten'; button.disabled = false; return; }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const put = value => { setter.call(input, value); input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true})); };
    input.focus();
    put(expected); await sleep(750);
    const bulk = digits(input) === expected;
    if (!bulk) {
      put('1');
      for (const digit of '2025550148') { put(input.value + digit); await sleep(100); }
      await sleep(750);
    }
    const retained = digits(input) === expected || digits(input) === expected.slice(1);
    result.textContent = (retained ? 'PASS' : 'FAIL') + ': bulk ' + (bulk ? 'retained' : 'reset') + '; final digits ' + digits(input).length + '. No submission.';
    input.blur(); button.disabled = false;
  };
})();
