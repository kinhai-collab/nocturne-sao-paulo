(() => {
  'use strict';
  const figure=document.querySelector('.hero-photo');if(!figure)return;
  const slides=[
    ['evvai-dish.jpg','Evvai','A dish presented with white flowers and caviar at Evvai','center 62%','https://www.evvai.com.br/'],
    ['evvai-chef.jpg','Evvai','Two blue culinary creations at Evvai','center 55%','https://www.evvai.com.br/'],
    ['tuju-course.jpg','Tuju','A cocktail garnished with yellow flowers at Tuju','center 55%','https://www.tuju.com.br/'],
    ['evvai-course.jpg','Evvai','An orange dish with a delicate striped surface and purple flowers at Evvai','center 62%','https://www.evvai.com.br/'],
    ['evvai-room.jpeg','Evvai','Evvai dining room with warm lighting and a decorative floral ceiling','center 50%','https://www.evvai.com.br/'],
    ['evvai-table.jpg','Evvai','An Evvai bite topped with orange roe on a sculptural white presentation','center 45%','https://www.evvai.com.br/'],
    ['tuju-room.png','Tuju','A close view of crustaceans featured on Tuju’s official website','center 50%','https://www.tuju.com.br/'],
    ['tuju-facade.jpg','Tuju','Tuju’s rooftop dining space surrounded by São Paulo buildings','center 55%','https://www.tuju.com.br/']
  ];
  const layers=[...figure.querySelectorAll('.slide-image')],pause=document.getElementById('slide-pause'),prev=document.getElementById('slide-prev'),next=document.getElementById('slide-next'),restaurant=document.getElementById('slide-restaurant'),credit=document.getElementById('slide-credit');
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let index=0,activeLayer=0,busy=false,paused=motion.matches,timer;
  const loaded=new Map(),failed=new Set();
  function load(i){
    if(loaded.has(i))return loaded.get(i);
    const promise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{failed.add(i);reject(new Error('Photo could not load'));};image.src='assets/'+slides[i][0];});
    loaded.set(i,promise);return promise;
  }
  function controls(){figure.dataset.photoTone=[2,4,6].includes(index)?'dark':'light';pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-label',paused?'Play slideshow':'Pause slideshow');prev.disabled=next.disabled=busy;figure.dataset.currentPhoto=String(index+1);}
  function schedule(){clearInterval(timer);if(!paused&&!document.hidden)timer=setInterval(()=>advance(1),10000);}
  async function advance(direction,target){
    if(busy)return;busy=true;controls();
    let candidate=index;
    try{
      let found=false;
      for(let n=0;n<slides.length-1;n++){
        candidate=n===0&&target!==undefined?target:(candidate+direction+slides.length)%slides.length;if(failed.has(candidate))continue;
        try{await load(candidate);found=true;break;}catch{}
      }
      if(!found)return;
      const incoming=layers[1-activeLayer],outgoing=layers[activeLayer],slide=slides[candidate];
      incoming.src='assets/'+slide[0];incoming.alt=slide[2];incoming.style.objectPosition=slide[3];incoming.style.transform=candidate===4?'scale(1.06)':'none';
      // Decode before fading so a slow image never replaces the current frame with a blank.
      if(incoming.decode)await incoming.decode();
      incoming.style.zIndex='2';outgoing.style.zIndex='1';incoming.setAttribute('aria-hidden','false');outgoing.setAttribute('aria-hidden','true');
      // Keep the old frame opaque underneath until the incoming frame finishes its fade.
      incoming.getBoundingClientRect();incoming.classList.add('is-active');
      await new Promise(resolve=>setTimeout(resolve,motion.matches?0:1500));
      outgoing.classList.remove('is-active');activeLayer=1-activeLayer;index=candidate;
      restaurant.textContent=slide[1]+' · ★★★ MICHELIN';credit.href=slide[4];credit.textContent=index===4?'Photo: Tadeu Brunelli / Evvai ↗':'Photo: '+slide[1]+' official website ↗';
      load((index+1)%slides.length).catch(()=>{});
    }catch{
      // Keep the previously rendered photo if an image fails to decode.
      failed.add(candidate);
    }finally{busy=false;controls();}
  }
  prev.onclick=()=>{advance(-1);schedule();};next.onclick=()=>{advance(1);schedule();};


  pause.onclick=()=>{paused=!paused;controls();schedule();};
  document.addEventListener('visibilitychange',schedule);
  motion.addEventListener('change',e=>{paused=e.matches;controls();schedule();});
  // Preload all eight after the first frame, ready for seamless automatic playback.
  slides.forEach((_,i)=>load(i).catch(()=>{}));controls();schedule();
})();
