'use strict';

const inviteAppBase = new URL(".", document.querySelector('script[src*="invite.js"]').src);
const inviteParams = new URLSearchParams(location.search);
const code = inviteParams.get('code') || Array.from(inviteParams.keys()).find(key => /^[A-Za-z0-9_-]{22}$/.test(key)) || '';
if (/^[A-Za-z0-9_-]{22}$/.test(code)) {
  const bytes = atob(code.replaceAll('-', '+').replaceAll('_', '/') + '==');
  const hex = Array.from(bytes, byte => byte.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const invite = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  const destination = new URL('planner.html', inviteAppBase);
  destination.hash = 'invite=' + invite;
  const selectedTheme = inviteParams.get('theme');
  if (['supper-club', 'after-hours'].includes(selectedTheme)) destination.searchParams.set('theme', selectedTheme);
  document.querySelector('#open-invite').href = destination.href;
  location.replace(destination.href);
}

if(!/^[A-Za-z0-9_-]{22}$/.test(code)) {
  const fallback=new URL('planner.html',inviteAppBase);
  const fallbackTheme=inviteParams.get('theme');
  if(['supper-club','after-hours'].includes(fallbackTheme))fallback.searchParams.set('theme',fallbackTheme);
  document.querySelector('#open-invite').href=fallback.href;
  const help=document.querySelector("#invite-help");
  if(help)help.textContent="Use the full invitation link your host shared to join this dinner. You can also plan your own evening in Enkai.";
}

const themes = {
  'supper-club': { image: 'tuju-course.jpg', name: 'Supper Club', other: 'after-hours' },
  'after-hours': { image: 'evvai-room.jpeg', name: 'After Hours', other: 'supper-club' },
};
const theme = new URLSearchParams(location.search).get('preview');
if (Object.prototype.hasOwnProperty.call(themes, theme)) {
  const { image, name, other } = themes[theme];
  document.body.dataset.inviteTheme = theme;
  document.title = `Enkai · ${name} invite preview`;
  document.querySelector('main').replaceWith(document.querySelector('#invite-preview').content.cloneNode(true));
  document.querySelector('.invite-cover img').src = 'assets/' + image;
  const comparison = document.querySelector('#other-theme');
  comparison.href = '?preview=' + other;
  comparison.textContent = 'Try ' + themes[other].name;

  const planner = new URL('planner.html', inviteAppBase);
  planner.searchParams.set('theme', theme);
  planner.searchParams.set('signin', '1');
  document.querySelector('.invite-signin').href = planner.href;

  const vote = document.querySelector('#preview-vote');
  const form = document.querySelector('#sample-vote');
  const openVote = document.querySelector('#open-vote');

  openVote.addEventListener('click', () => vote.showModal());
  form.addEventListener('change', () => {
    form.querySelector('[type=submit]').disabled = !form.querySelector(':checked');
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.querySelector(':checked')) return;
    vote.close();
    openVote.textContent = 'Edit sample vote';
    document.querySelector('.invite-footer').firstChild.textContent = 'Sample vote recorded ';
  });
}
