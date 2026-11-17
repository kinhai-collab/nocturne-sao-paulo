'use strict';

let restaurantPhotoObserver;
let restaurantPhotoActive=0;
let restaurantPhotoQueue=[];
let restaurantPhotoLimitReached=false;
const thumbnailPlaceholder='<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="26" cy="24" r="14"/><circle cx="26" cy="24" r="10"/><path d="M5 8v13m4-13v13m-2 0v19M43 8v32M43 8c-6 5-6 16 0 16"/></svg>';

function photoLink(value) {
  if(typeof value!=='string'||!value)return '';
  try{const url=new URL(value,location.href);return url.protocol==='https:'||(url.protocol==='http:'&&url.origin===location.origin)?url.href:'';}catch{return '';}
}
function restaurantThumbnail(place,index) {
  const state=place.thumbnail;
  if(state?.status==='ready') {
    const photo=state.photo;
    return '<button type="button" class="restaurant-thumbnail" data-action="show-restaurant-photo" data-photo-index="'+index+'" aria-label="View photo of '+escape(place.name)+'"><img src="'+escape(photo.url)+'" alt="'+escape(place.name)+' food or restaurant photo" decoding="async"></button><div class="thumbnail-credit" translate="no">'+(photo.kind==='google'?'Google Maps'+(photo.authors||[]).map(author=>'<span>'+(photoLink(author.photoUri)?'<img class="photo-author-avatar" src="'+escape(photoLink(author.photoUri))+'" alt="" referrerpolicy="no-referrer">':'')+(photoLink(author.uri)?'<a href="'+escape(photoLink(author.uri))+'" target="_blank" rel="noopener noreferrer">'+escape(author.name)+'</a>':escape(author.name))+'</span>').join(''):'Restaurant website')+'</div>';
  }
  const unavailable=restaurantPhotoLimitReached||['missing','error','limited'].includes(state?.status);
  return '<div class="restaurant-thumbnail thumbnail-placeholder">'+thumbnailPlaceholder+'<small>'+(unavailable?'Photo unavailable':'Loading photo…')+'</small></div>';
}
function photoCredits(photo) {
  return '<figcaption class="restaurant-photo-credit">'+(photo.kind==='google'?'<span class="google-maps-credit" translate="no">Google Maps</span>':'')+
    (photo.authors||[]).map(author=>'<span>'+(photoLink(author.photoUri)?'<img class="photo-author-avatar" src="'+escape(photoLink(author.photoUri))+'" alt="" referrerpolicy="no-referrer">':'')+(photoLink(author.uri)?'<a href="'+escape(photoLink(author.uri))+'" target="_blank" rel="noopener noreferrer">'+escape(author.name)+'</a>':escape(author.name))+'</span>').join('')+
    (photoLink(photo.source)?'<a href="'+escape(photoLink(photo.source))+'" target="_blank" rel="noopener noreferrer">'+(photo.kind==='website'?'Photo: restaurant website':'View original photo')+' ↗</a>':'')+'</figcaption>';
}
function showRestaurantPhoto(index) {
  const place=restaurantReturn?.places[Number(index)];
  if(place?.thumbnail?.status!=='ready')return;
  const viewer=document.querySelector('#restaurant-photo-view');
  viewer.innerHTML='<div class="panel-heading row spread"><h2 id="restaurant-photo-title">'+escape(place.name)+'</h2><button type="button" data-action="close-restaurant-photo" aria-label="Close restaurant photo">×</button></div><figure class="restaurant-photo-large"><img src="'+escape(place.thumbnail.photo.url)+'" alt="'+escape(place.name)+' food or restaurant photo" referrerpolicy="no-referrer">'+photoCredits(place.thumbnail.photo)+'</figure><a href="'+escape(venueMaps(place.name,{location:place.address,venues:[{name:place.name,placeId:place.placeId}]}))+'" target="_blank" rel="noopener noreferrer">Reviews & location ↗</a>';
  viewer.showModal();
}
function stopRestaurantPhotos() {
  restaurantPhotoObserver?.disconnect();
  restaurantPhotoQueue=[];
  const viewer=document.querySelector('#restaurant-photo-view');
  if(viewer?.open)viewer.close();
  if(viewer)viewer.replaceChildren();
}
function paintRestaurantThumbnail(search,place) {
  if(search!==restaurantReturn)return;
  const index=search.places.indexOf(place);
  const slot=panel.querySelector('[data-thumbnail-index="'+index+'"]');
  if(!slot)return;
  slot.innerHTML=restaurantThumbnail(place,index);
  const image=slot.querySelector('img');
  if(image)image.addEventListener('error',()=>{
    place.thumbnail={status:'error'};
    paintRestaurantThumbnail(search,place);
  },{once:true});
}
function updatePhotoLimitNotice() {
  const note=panel.querySelector('[data-photo-notice]');
  if(!note)return;
  note.hidden=!restaurantPhotoLimitReached;
  note.textContent='Some photos aren’t available right now. You can still add restaurants to your poll.';
}
function pumpRestaurantPhotos() {
  while(restaurantPhotoActive<2&&restaurantPhotoQueue.length) {
    const {search,place}=restaurantPhotoQueue.shift();
    if(search!==restaurantReturn||!search.places.includes(place))continue;
    if(restaurantPhotoLimitReached){place.thumbnail={status:'limited'};paintRestaurantThumbnail(search,place);continue;}
    restaurantPhotoActive++;
    place.thumbnail={status:'loading'};
    api('place-photo',{placeId:place.placeId}).then(({photo})=>{
      if(search!==restaurantReturn||!search.places.includes(place))return;
      const url=photoLink(photo?.url);
      if(!photo||!url){place.thumbnail={status:'missing'};return;}
      place.thumbnail={status:'ready',photo:{...photo,url}};
    }).catch(error=>{
      if(error.status===429)restaurantPhotoLimitReached=true;
      if(search===restaurantReturn&&search.places.includes(place))place.thumbnail={status:error.status===429?'limited':'error'};
    }).finally(()=>{
      restaurantPhotoActive--;
      if(search===restaurantReturn&&search.places.includes(place))paintRestaurantThumbnail(search,place);
      updatePhotoLimitNotice();
      pumpRestaurantPhotos();
    });
  }
}
function queueRestaurantPhoto(search,place) {
  if(search!==restaurantReturn||place.thumbnail)return;
  if(!place.placeId||restaurantPhotoLimitReached){place.thumbnail={status:restaurantPhotoLimitReached?'limited':'missing'};paintRestaurantThumbnail(search,place);return;}
  place.thumbnail={status:'queued'};
  restaurantPhotoQueue.push({search,place});
  pumpRestaurantPhotos();
}
function observeRestaurantThumbnails() {
  restaurantPhotoObserver?.disconnect();
  const search=restaurantReturn;
  if(!search)return;
  const slots=panel.querySelectorAll('[data-thumbnail-index]');
  if(window.IntersectionObserver) {
    restaurantPhotoObserver=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting&&entry.target.isConnected&&search===restaurantReturn){
        restaurantPhotoObserver.unobserve(entry.target);
        const place=search.places[Number(entry.target.dataset.thumbnailIndex)];
        if(place)queueRestaurantPhoto(search,place);
      }
    },{root:panel,rootMargin:'0px',threshold:0.05});
    slots.forEach(slot=>restaurantPhotoObserver.observe(slot));
  } else {
    // Older browsers get a small first batch rather than preloading every result.
    search.places.slice(0,3).forEach(place=>queueRestaurantPhoto(search,place));
  }
  // Sorting creates new image elements but keeps the same in-progress results.
  search.places.forEach(place=>{
    if(place.thumbnail?.status==='ready')paintRestaurantThumbnail(search,place);
  });
  updatePhotoLimitNotice();
}
