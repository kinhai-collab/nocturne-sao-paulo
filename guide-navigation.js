'use strict';

(() => {
  const url = new URL(location.href);
  const theme = url.searchParams.get('theme') === 'after-hours' ? 'after-hours' : 'supper-club';
  const guides = {
    michelin: { label: 'Michelin', saoPaulo: 'index.html#discover', ontario: 'ontario.html#michelin-starred' },
    good: { label: 'Good Eats', saoPaulo: 'beyond.html#discover', ontario: 'ontario.html#highly-reviewed' },
  };

  function themedLink(path) {
    const target = new URL(path, url);
    target.searchParams.set('theme', theme);
    return target;
  }

  window.enkaiGuideBooking = (restaurant, location) => {
    const target = themedLink('planner.html');
    target.searchParams.set('restaurant', restaurant);
    target.searchParams.set('location', location);
    return '<a class="button primary guide-book" href="' + target.href.replaceAll('&', '&amp;') + '">Book here</a>';
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('enkai-guide')) {
      document.body.dataset.guideTheme = theme;
      for (const link of document.querySelectorAll('header a[href="planner.html"]')) {
        link.href = themedLink('planner.html');
      }
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'guide-locations';
    dialog.setAttribute('aria-labelledby', 'guide-location-title');
    dialog.innerHTML = '<form method="dialog"><button type="submit" aria-label="Close">×</button></form>' +
      '<h2 id="guide-location-title">Current locations</h2><p class="guide-location-type"></p>' +
      '<div class="guide-location-links"><a>São Paulo</a><a>Toronto &amp; Ontario</a></div>';
    document.body.append(dialog);
    dialog.addEventListener('click', event => {
      if (event.target.closest('a[href]')) dialog.close();
    });

    document.addEventListener('click', event => {
      const trigger = event.target.closest('button[data-guide]');
      if (!trigger) return;
      const guide = guides[trigger.dataset.guide];
      dialog.querySelector('.guide-location-type').textContent = guide.label + ' guide';
      const [saoPaulo, ontario] = dialog.querySelectorAll('a');
      saoPaulo.href = themedLink(guide.saoPaulo);
      ontario.href = themedLink(guide.ontario);
      dialog.showModal();
    });
  });
})();
