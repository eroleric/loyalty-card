window.addEventListener('message', event => {
  const frame = document.querySelector('iframe');
  if (event.origin !== 'https://auth.loyalty.test' || event.source !== frame.contentWindow) return;
  if (event.data?.type === 'practice-stage') document.body.dataset.stage = event.data.stage;
  if (event.data?.type === 'practice-height') frame.style.height = `${Math.min(1600, Math.max(480, event.data.height))}px`;
});
