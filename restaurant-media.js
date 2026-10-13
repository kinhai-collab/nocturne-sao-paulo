(() => {
'use strict';
const media=window.RESTAURANT_MEDIA||{};
window.restaurantMedia={mount:init,
 card(r){const m=media[r.id];return m?.card?`<div class="restaurant-identifier ${m.logo?'is-logo':''} ${m.darkLogo?'dark-logo':''}"><img src="${m.card}" alt="${m.logo?r.name+' logo':r.name+' restaurant image'}" loading="lazy" decoding="async"></div>`:`<div class="restaurant-identifier unavailable"><span>${r.name}</span><small>Restaurant imagery coming soon</small></div>`;},
 gallery(r){const m=media[r.id];if(!m?.photos?.length)return `<p class="note">Official website photos are not currently available. <a href="${r.website||r.guide}" target="_blank" rel="noopener noreferrer">View the restaurant’s profile ↗</a></p>`;
 return `<figure class="restaurant-gallery" data-restaurant="${r.id}" aria-label="${r.name} photo gallery"><div class="gallery-stage"><img class="gallery-image active" src="${m.photos[0].src}" alt="${m.photos[0].alt}"><img class="gallery-image" alt="" aria-hidden="true"></div><figcaption><a href="${m.source}" target="_blank" rel="noopener noreferrer">${m.credit||'Photos: official restaurant website'} ↗</a><span class="gallery-count" aria-live="polite">1 / ${m.photos.length}</span></figcaption><div class="gallery-controls" ${m.photos.length<2?'hidden':''}><button class="gallery-prev" aria-label="Previous restaurant photo">‹</button><button class="gallery-pause" aria-label="Pause restaurant slideshow">Ⅱ</button><button class="gallery-next" aria-label="Next restaurant photo">›</button></div></figure>`;}
};
const motion=matchMedia('(prefers-reduced-motion: reduce)');let current=null;
function stop(){if(current){clearInterval(current.timer);current=null;}}
function init(){const figure=document.querySelector('#detail[open] .restaurant-gallery');if(!figure||current?.figure===figure)return;stop();const photos=media[figure.dataset.restaurant].photos,layers=[...figure.querySelectorAll('.gallery-image')];let index=0,layer=0,busy=false,paused=motion.matches;
current={figure,timer:null};const session=current,pause=figure.querySelector('.gallery-pause');
const schedule=()=>{clearInterval(session.timer);if(!paused&&photos.length>1)session.timer=setInterval(()=>{if(!figure.isConnected||!figure.closest('dialog')?.open){stop();return;}if(!document.hidden)advance(1);},10000);};
const controls=()=>{pause.textContent=paused?'▷':'Ⅱ';pause.setAttribute('aria-label',paused?'Play restaurant slideshow':'Pause restaurant slideshow');};
async function advance(direction){if(busy||photos.length<2)return;busy=true;const candidate=(index+direction+photos.length)%photos.length,incoming=layers[1-layer],outgoing=layers[layer];try{incoming.src=photos[candidate].src;incoming.alt=photos[candidate].alt;if(incoming.decode)await incoming.decode();if(current!==session)return;incoming.style.zIndex=2;outgoing.style.zIndex=1;incoming.setAttribute('aria-hidden','false');outgoing.setAttribute('aria-hidden','true');incoming.getBoundingClientRect();incoming.classList.add('active');await new Promise(resolve=>setTimeout(resolve,motion.matches?0:1500));if(current!==session)return;outgoing.classList.remove('active');layer=1-layer;index=candidate;figure.querySelector('.gallery-count').textContent=`${index+1} / ${photos.length}`;}catch{}finally{busy=false;}}
figure.querySelector('.gallery-prev').onclick=()=>{advance(-1);schedule();};figure.querySelector('.gallery-next').onclick=()=>{advance(1);schedule();};pause.onclick=()=>{paused=!paused;controls();schedule();};figure.closest('dialog').addEventListener('close',stop,{once:true});controls();schedule();}

})();
