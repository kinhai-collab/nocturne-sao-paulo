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
    target.searchParams.set('theme', document.body?.dataset.plannerTheme || theme);
    return target;
  }

  window.enkaiGuideBooking = (restaurant, location) => {
    const target = themedLink('planner.html');
    target.searchParams.set('restaurant', restaurant);
    target.searchParams.set('location', location);
    return '<a class="button primary guide-book" href="' + target.href.replaceAll('&', '&amp;') + '">Plan dinner here</a>';
  };

  document.addEventListener('DOMContentLoaded', () => {
    for(const brand of document.querySelectorAll('header a.brand, header a:has(.enkai-logo)')) {
      brand.href=themedLink('planner.html');
      brand.setAttribute('aria-label','Enkai home');
    }
    if (document.body.classList.contains('enkai-guide')) {
      document.body.dataset.guideTheme = theme;
      for (const link of document.querySelectorAll('header a[href="planner.html"]')) {
        link.href = themedLink('planner.html');
      }
      const nav=document.querySelector('header nav');
      if(nav) nav.innerHTML='<button data-guide="michelin" aria-haspopup="dialog">Michelin</button><button data-guide="good" aria-haspopup="dialog">Good Eats</button>';
      const dock=document.createElement('nav');
      dock.className='app-dock';dock.setAttribute('aria-label','Enkai');
      dock.innerHTML='<a href="'+themedLink('planner.html')+'">Home</a><a aria-current="page" href="'+themedLink('planner.html?view=discover')+'">Discover</a><a href="'+themedLink('planner.html?view=wishlist')+'">Saved</a>';
      document.body.append(dock);
      const clarifyLinks=()=>{
        for(const a of document.querySelectorAll('#app a[href]')) {
          const target=new URL(a.href,location.href);
          if(target.origin===location.origin && /\/(index|beyond|ontario|planner)\.html$/.test(target.pathname)) {
            target.searchParams.set('theme',theme);
            if(a.href!==target.href)a.href=target.href;
          }
        }
        for(const a of document.querySelectorAll('.card-actions a, #detail-content a')) {
          if(/^(Book a table|Book externally|Website & reservations)/.test(a.textContent.trim())) a.textContent='Reserve with restaurant ↗';
        }
      };
      new MutationObserver(clarifyLinks).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
      clarifyLinks();
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
