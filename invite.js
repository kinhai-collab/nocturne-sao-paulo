'use strict';

const code = location.search.slice(1);
if (/^[A-Za-z0-9_-]{22}$/.test(code)) {
  const bytes = atob(code.replaceAll('-', '+').replaceAll('_', '/') + '==');
  const hex = Array.from(bytes, byte => byte.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const invite = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  const destination = new URL('planner.html', location.href);
  destination.hash = 'invite=' + invite;
  document.querySelector('#open-invite').href = destination.href;
  location.replace(destination.href);
}
