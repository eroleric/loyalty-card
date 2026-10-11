(() => {
  // This adapter runs only in the exact auth.circlek.com frame, never in CAPTCHA frames.
  const bridge = window.CircleAssist;
  if (!bridge) return;
  let notified = false;
  let readyTimer;
  const findPhone = () => document.querySelector('input[type="tel"][name="phone"]');
  const announce = () => {
    if (findPhone() && !notified && !readyTimer) {
      // Avoid filling the server-rendered input before the client form initializes.
      readyTimer = setTimeout(() => {
        readyTimer = null;
        if (document.readyState !== 'complete' || !findPhone()) return;
        notified = true;
        bridge.postMessage(JSON.stringify({type:'ready'}));
      }, 2000);
    }
  };
  bridge.onmessage = event => {
    try {
      const request = JSON.parse(event.data);
      const input = findPhone();
      if (!input) { bridge.postMessage(JSON.stringify({type:'missing'})); return; }
      if (request.type === 'focus') {
        input.focus();
        input.setSelectionRange(0, input.value.length);
        bridge.postMessage(JSON.stringify({type:'focused'}));
        return;
      }
      if (request.type !== 'verify' || !/^\d{10}$/.test(request.phone)) return;
      // Report success only when the controlled field retains the value after rerendering.
      setTimeout(() => {
        const digits = findPhone()?.value.replace(/\D/g, '') || '';
        bridge.postMessage(JSON.stringify({
          type: 'filled', matched: digits === '1' + request.phone || digits === request.phone,
          digitCount: digits.length
        }));
      }, 500);
    } catch { bridge.postMessage(JSON.stringify({type:'error'})); }
  };
  document.addEventListener('DOMContentLoaded', () => {
    announce();
    new MutationObserver(announce).observe(document.documentElement, {childList:true,subtree:true});
  });
  window.addEventListener('load', announce);
  announce();
})();
