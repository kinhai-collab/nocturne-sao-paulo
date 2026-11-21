/* Enkai iOS invitation parsing: no credentials or user data in deep links.
   Only the existing invitation UUID is accepted from approved destinations. */
(function (root) {
  'use strict';
  const WEB_HOST = 'kinhai-collab.github.io';
  const PREVIEW_HOST = 'enkai-invites.vercel.app';
  const PREFIX = '/nocturne-sao-paulo/';
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const CODE = /^[A-Za-z0-9_-]{22}$/;
  function decodeInvitation(code) {
    if (typeof code !== 'string' || !CODE.test(code)) return null;
    try {
      const value = atob(code.replace(/-/g, '+').replace(/_/g, '/') + '==');
      if (value.length !== 16) return null;
      const hex = [...value].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
      const uuid = [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16),
        hex.slice(16,20), hex.slice(20)].join('-');
      return UUID.test(uuid) ? uuid : null;
    } catch { return null; }
  }
  function parseInviteLink(input) {
    if (typeof input !== 'string' || input.length > 2048) return null;
    let url;
    try { url = new URL(input); } catch { return null; }
    if (url.username || url.password) return null;
    let allowed = false;
    if (url.protocol === 'enkai:' && url.hostname === 'invite' && (url.pathname === '' || url.pathname === '/')) {
      allowed = true;
    } else if (url.protocol === 'https:' && url.hostname === WEB_HOST &&
        (url.pathname === PREFIX+'i.html' || url.pathname === PREFIX+'planner.html' ||
         /^\/nocturne-sao-paulo\/invite\/[a-z0-9-]+\.html$/.test(url.pathname))) {
      allowed = true;
    } else if (url.protocol === 'https:' && url.hostname === PREVIEW_HOST && url.pathname === '/i') {
      allowed = true;
    }
    if (!allowed) return null;
    if (url.protocol === 'enkai:' && [...url.searchParams.keys()].some(key => !['code','theme'].includes(key))) return null;
    if (url.searchParams.has('code')) return decodeInvitation(url.searchParams.get('code'));
    if (url.pathname === PREFIX+'planner.html' || url.protocol === 'enkai:') {
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
      const candidate = hash.get('invite');
      return UUID.test(candidate || '') ? candidate : null;
    }
    return null;
  }
  const api = Object.freeze({parseInviteLink, decodeInvitation});
  root.EnkaiIOSLinks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
