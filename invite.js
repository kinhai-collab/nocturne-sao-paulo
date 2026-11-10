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

  const vote = document.querySelector('#preview-vote');
  const signIn = document.querySelector('#preview-signin');
  const form = document.querySelector('#sample-vote');
  const openVote = document.querySelector('#open-vote');
  let votePending = false;

  openVote.addEventListener('click', () => vote.showModal());
  document.querySelector('.invite-signin').addEventListener('click', () => {
    signIn.returnValue = '';
    signIn.showModal();
  });
  form.addEventListener('change', () => {
    form.querySelector('[type=submit]').disabled = !form.querySelector(':checked');
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.querySelector(':checked')) return;
    votePending = true;
    vote.close();
    signIn.returnValue = '';
    signIn.showModal();
  });
  signIn.addEventListener('close', () => {
    if (!votePending) return;
    votePending = false;
    if (['google', 'microsoft'].includes(signIn.returnValue)) {
      openVote.textContent = 'Edit sample vote';
      document.querySelector('.invite-footer').firstChild.textContent = 'Sample vote recorded ';
    } else {
      vote.showModal();
    }
  });
}
