// MAIN world deliberately uses ordinary webpage privileges, not extension privileges.
(() => {
  const panel = document.createElement('p');
  panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;background:white;color:black;border:2px solid #19634b;padding:12px;font:14px sans-serif';
  panel.textContent = 'Website access: waiting for real auth frame';
  document.body.append(panel);
  let tries = 0;
  const timer = setInterval(() => {
    const frame = Array.from(document.querySelectorAll('iframe')).find(f => f.src.startsWith('https://auth.circlek.com/'));
    if (frame) {
      try { void frame.contentWindow.document; }
      catch(error) { panel.textContent = 'Website access: BLOCKED (' + error.name + ')'; clearInterval(timer); return; }
    }
    if (++tries > 120) { panel.textContent = 'Website access: INCONCLUSIVE (frame not ready)'; clearInterval(timer); }
  }, 500);
})();
