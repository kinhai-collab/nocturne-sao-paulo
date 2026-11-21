/* Capacitor-only shell. Never sends bearer tokens or invites to analytics/logs.
   Native sign-in is intentionally gated until approved provider SDKs are configured.
   Existing web sign-in continues unchanged in the public browser. */
(() => {
  'use strict';
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return;
  const webPlanner = 'https://kinhai-collab.github.io/nocturne-sao-paulo/planner.html';
  const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
  const panel = () => document.querySelector('#panel');

  const showSignIn = () => {
    const dialog=panel();
    if(!dialog) return;
    dialog.innerHTML =
      '<div class="panel-heading row spread"><h2 id="panel-title">Enkai on iPhone</h2>' +
      '<button type="button" data-action="ios-close-auth" aria-label="Close">×</button></div>' +
      '<div class="stack">' +
      '<p><strong>Native sign-in is being prepared for TestFlight.</strong></p>' +
      '<p>For now, you can securely use the existing web version while we configure iOS Google and Microsoft sign-in.</p>' +
      '<button type="button" class="primary" data-action="ios-open-web">Open Enkai web version</button>' +
      '<small>The web login will not sign you into this app yet. No Google or Microsoft login will run inside an embedded iOS webview.</small>' +
      '<a href="privacy.html">Privacy &amp; data use</a>' +
      '<p role="status" data-ios-status></p></div>';
    if(!dialog.open)dialog.showModal();
  };

  window.EnkaiNativeApp = Object.freeze({showSignIn});
  const handleInvite = raw => {
    const uuid=window.EnkaiIOSLinks?.parseInviteLink(raw);
    if(!uuid) return;
    if(window.location.hash === '#invite='+uuid) return;
    // Refresh initializes Enkai's existing invite parsing and preview handling.
    window.location.replace(new URL('index.html#invite='+encodeURIComponent(uuid),window.location.href).href);
  };

  document.addEventListener('click', event => {
    const button=event.target.closest('button[data-action^="ios-"]');
    if(!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(button.dataset.action==='ios-close-auth') {panel()?.close();return;}
    if(button.dataset.action!=='ios-open-web') return;
    const status=panel()?.querySelector('[data-ios-status]');
    const url=new URL(webPlanner);
    const invite=new URLSearchParams(window.location.hash.replace(/^#/, '')).get('invite');
    url.searchParams.set('signin','1');
    if(UUID.test(invite||''))url.hash='#invite='+encodeURIComponent(invite);
    // Capacitor Browser opens Apple's SFSafariViewController, not a WKWebView OAuth screen.
    // This is an explicit web-app handoff, not a native authenticated session.
    const browser=cap.Plugins?.Browser;
    if(!browser?.open) {
      if(status)status.textContent='Browser handoff is unavailable. Use Safari to open the Enkai website.';
      return;
    }
    browser.open({url:url.href}).catch(()=>{
      if(status)status.textContent='Could not open the web version. Try Safari directly.';
    });
  },true);

  const app=cap.Plugins?.App;
  if(app?.addListener) {
    app.addListener('appUrlOpen', data => handleInvite(data?.url));
    app.getLaunchUrl?.().then(data => handleInvite(data?.url)).catch(()=>{});
  }
})();
