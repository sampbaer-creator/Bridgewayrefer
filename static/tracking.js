'use strict';
(() => {
  const page = document.querySelector('[data-office-code]');
  const code = page && page.dataset.officeCode;
  if (!code) return;
  // Count visible referral-page navigations, excluding refreshes and history restores.
  // NFC, QR, shared links and staff tests cannot be distinguished by the browser.
  const navigation = performance.getEntriesByType('navigation')[0];
  if (navigation && navigation.type !== 'navigate') return;
  let sent = false;
  const eventId = crypto.randomUUID();
  function recordOpen() {
    if (sent || document.visibilityState !== 'visible') return;
    sent = true;
    const body = JSON.stringify({code,eventId});
    async function send() {
      try {
        const response = await fetch('/api/link-opens', {method:'POST', credentials:'same-origin', referrerPolicy:'same-origin', headers:{'Content-Type':'application/json'},body,keepalive:true});
        if (!response.ok && response.status >= 500) setTimeout(retry,1500);
      } catch (_) { setTimeout(retry,1500); }
    }
    function retry() {
      fetch('/api/link-opens', {method:'POST', credentials:'same-origin', referrerPolicy:'same-origin',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
    }
    send();
  }
  recordOpen(); document.addEventListener('visibilitychange',recordOpen);
})();
