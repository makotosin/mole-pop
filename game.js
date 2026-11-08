(() => {
'use strict';
const canvas=document.getElementById('board'),ctx=canvas.getContext('2d');
const scoreEl=document.getElementById('score'),timeEl=document.getElementById('time'),bestEl=document.getElementById('best');
const overlay=document.getElementById('overlay'),titleEl=document.getElementById('overlayTitle'),textEl=document.getElementById('overlayText'),resultEl=document.getElementById('result');
const playBtn=document.getElementById('playBtn'),bgmBtn=document.getElementById('bgmBtn'),sfxBtn=document.getElementById('sfxBtn'),comboEl=document.getElementById('combo'),floatMsg=document.getElementById('floatMsg');
const phaseAnnouncement=document.getElementById('phaseAnnouncement'),phaseIcon=document.getElementById('phaseIcon'),phaseTitle=document.getElementById('phaseTitle'),phaseSubtitle=document.getElementById('phaseSubtitle'),boardWrap=document.querySelector('.board-wrap');
const spriteNames=['normal','gold','bomb','normal_hit','gold_hit','bomb_hit','crazy','crazy_hit'];
const sprites={};for(const name of spriteNames){const img=new Image();img.src='assets/'+name+'.png';img.onload=()=>render();sprites[name]=img;}
let W=0,H=0,dpr=1,holes=[],score=0,best=0,combo=0,mode='menu',clock=60,last=0,elapsed=0,spawnIn=.3,active=[],fx=[],bgmEnabled=true,sfxEnabled=true,audio=null,lastHole=-1,rushAnnounced=false,calmAnnounced=false,speedAnnounced=false;
try{best=Math.max(0,Number(localStorage.getItem('mogura_best')||0))||0;}catch(e){}bestEl.textContent=best;
try{bgmEnabled=localStorage.getItem('mole_bgm')!=='off';sfxEnabled=localStorage.getItem('mole_sfx')!=='off';}catch(e){}
function showAudioSettings(){bgmBtn.textContent=bgmEnabled?'BGM ON':'BGM OFF';sfxBtn.textContent=sfxEnabled?'SFX ON':'SFX OFF';bgmBtn.setAttribute('aria-pressed',String(bgmEnabled));sfxBtn.setAttribute('aria-pressed',String(sfxEnabled));}
showAudioSettings();
// Short original chip-tune melody: cheerful farm / retro arcade, no sampled music.
// Each game phase uses its own variation. Notes are scheduled only while playing.
const melodies={normal:[64,67,69,72,71,69,67,64,62,64,67,69,67,64,62,60],chill:[64,null,67,null,69,null,67,null,62,null,64,null,60,null,62,null],speed:[67,69,72,74,72,69,67,64,69,72,76,74,72,69,67,64],rush:[72,76,79,76,74,77,81,77,72,76,79,83,81,79,77,74]};
const bassNotes={normal:[48,48,53,55],chill:[48,53,50,48],speed:[48,55,53,55],rush:[48,55,53,55]};
let musicStep=0,nextMusicAt=0,musicPhase='normal';
// iOS Safari requires Web Audio to be explicitly unlocked by a user gesture.
// Do not repeatedly resume audio from requestAnimationFrame: that is not a gesture.
function audioContext(){
 try{
  if(!audio || audio.state==='closed'){
   const AC=window.AudioContext||window.webkitAudioContext;
   if(!AC)return null;
   audio=new AC();
  }
  return audio;
 }catch(e){return null;}
}
function unlockAudio(){
 const a=audioContext();if(!a)return;
 try{
  if(a.state!=='running'){
   const promise=a.resume();
   if(promise && typeof promise.then==='function')promise.then(()=>{
     if(a.state==='running' && mode==='playing')resetMusicClock();
   }).catch(()=>{});
  }
  // Silent oscillator helps unlock playback in WebKit on first tap.
  const source=a.createOscillator(),gain=a.createGain();
  gain.gain.value=0;source.connect(gain).connect(a.destination);
  source.start(0);source.stop(a.currentTime+.02);
 }catch(e){}
}
// Re-attempt from actual user gestures including taps on game elements.
document.addEventListener('touchstart',unlockAudio,{capture:true,passive:true});
document.addEventListener('pointerdown',unlockAudio,{capture:true,passive:true});

function tone(midi,when,duration,shape='square',vol=.018){if(midi===null)return;const a=audioContext();if(!a)return;const osc=a.createOscillator(),env=a.createGain(),f=440*Math.pow(2,(midi-69)/12);osc.type=shape;osc.frequency.setValueAtTime(f,when);env.gain.setValueAtTime(0.0001,when);env.gain.exponentialRampToValueAtTime(vol,when+.016);env.gain.exponentialRampToValueAtTime(.0001,when+duration);osc.connect(env).connect(a.destination);osc.start(when);osc.stop(when+duration+.01);}
function currentMusicPhase(){return elapsed<20?'normal':elapsed<35?'chill':elapsed<50?'speed':'rush';}
function resetMusicClock(){musicStep=0;musicPhase=currentMusicPhase();nextMusicAt=audio?audio.currentTime+.06:0;}
function runMusic(){if(mode!=='playing'||!bgmEnabled)return;const a=audioContext();if(!a||a.state!=='running')return;const phase=currentMusicPhase();if(musicPhase!==phase){musicPhase=phase;musicStep=0;nextMusicAt=a.currentTime+.035;}const beat=phase==='chill'?.39:phase==='rush'?.155:phase==='speed'?.205:.265; if(nextMusicAt<a.currentTime-.15)nextMusicAt=a.currentTime+.025;let i=0;while(nextMusicAt<a.currentTime+.09&&i++<3){const step=musicStep%16;const note=melodies[phase][step];if(note!==null)tone(note,nextMusicAt,beat*.76,'square',phase==='chill'?.011:.016);if(step%4===0){const bass=bassNotes[phase][Math.floor(step/4)];tone(bass-12,nextMusicAt,Math.min(.28,beat*1.3),'triangle',.025);}if(phase!=='chill'&&step%4===2)tone(55,nextMusicAt,beat*.22,'triangle',.008);nextMusicAt+=beat;musicStep++;}}

function resize(){let r=canvas.getBoundingClientRect();W=Math.max(200,r.width);H=Math.max(150,r.height);dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);buildHoles();render();}
function buildHoles(){holes=[];const gridW=Math.min(W*.88,H*1.06,610), gridH=Math.min(H*.81,gridW*1.04);const dx=gridW/3,dy=gridH/3;const cx=W/2,cy=H*.515;for(let i=0;i<9;i++){let c=i%3,r=Math.floor(i/3);holes.push({x:cx+(c-1)*dx,y:cy+(r-1)*dy,rx:Math.min(dx*.40,dy*.51),ry:Math.min(dy*.23,dx*.24),n:i});}}
function random(){return Math.random();}function rand(a,b){return a+(b-a)*random();}
function sound(freq=440,duration=.085,type='sine'){if(!sfxEnabled)return;try{audio=audioContext();if(!audio||audio.state!=='running')return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(50,freq*.55),audio.currentTime+duration);gain.gain.setValueAtTime(.09,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch(e){}}
function start(){unlockAudio();setPhase('normal');hidePhase();mode='playing';overlay.hidden=true;score=0;combo=0;clock=60;elapsed=0;spawnIn=.18;active=[];fx=[];lastHole=-1;rushAnnounced=false;calmAnnounced=false;speedAnnounced=false;last=performance.now();scoreEl.textContent='0';timeEl.textContent='60';comboEl.textContent='';sound(510,.12,'triangle');resetMusicClock();}
function end(){hidePhase();setPhase('normal');mode='ended';active=[];if(score>best){best=score;try{localStorage.setItem('mogura_best',String(best));}catch(e){}bestEl.textContent=best;}titleEl.textContent=score>=200?'AWESOME!':'TIME UP!';textEl.innerHTML=score>=200?'The moles are shocked!':'Ready for another round?';resultEl.hidden=false;resultEl.innerHTML='<strong>'+score+'</strong> PTS<small>BEST '+best+' PTS</small>';playBtn.textContent='PLAY AGAIN';overlay.hidden=false;sound(520,.15,'triangle');}
function multiplier(){return combo>=8?2:combo>=5?1.5:combo>=3?1.2:1;}
function spawn(){
 const rush=elapsed>=50;
 const calm=elapsed>=20&&elapsed<35;
 const maxActive=rush?3:calm?1:elapsed>=35?2:elapsed>=12?2:1;
 if(active.filter(m=>!m.hit).length>=maxActive)return false;
 let free=holes.filter(h=>!active.some(m=>m.n===h.n));
 if(!free.length)return false;
 // De-emphasize the previous hole, but retain a slight chance for surprises.
 let choices=free.filter(h=>h.n!==lastHole);
 if(choices.length && random()<.83)free=choices;
 const h=free[Math.floor(random()*free.length)];lastHole=h.n;
 const roll=random(),type=roll<.10?'crazy':roll<.22?'gold':roll<.39?'bomb':'normal';
 const speed=Math.min(1,elapsed/60);
 const life=type==='crazy'?(calm?rand(1.25,1.55):rand(.92,1.15)):(calm?rand(1.3,1.75):rand(1.0,1.43)-speed*.28);
 active.push({n:h.n,type,age:0,life,hit:false,hitAge:0,phase:rand(0,6.28)});
 return true;
}
function nextSpawnInterval(){
 // Four beats: warm-up, breathing room, acceleration, final rush.
 let interval;
 if(elapsed<20)interval=rand(.50,.86);
 else if(elapsed<35)interval=rand(.90,1.45);
 else if(elapsed<50)interval=rand(.34,.68);
 else interval=rand(.20,.48);
 // Occasional short bursts and pauses, while keeping the calm phase gentle.
 if(elapsed<20 || elapsed>=35){
   if(random()<.10)interval+=rand(.18,.37);
   if(random()<.12)interval*=.62;
 }
 return Math.max(.17,interval);
}
function tick(dt){
 if(mode!=='playing')return;
 elapsed+=dt;clock=Math.max(0,60-elapsed);timeEl.textContent=Math.ceil(clock);
 if(clock<=0){end();return;}
 if(elapsed>=20&&!calmAnnounced){calmAnnounced=true;spawnIn=Math.max(spawnIn,.5);setPhase('chill');announcePhase('CHILL TIME!','TAKE IT EASY','☁');sound(400,.16,'sine');}
 if(elapsed>=35&&!speedAnnounced){speedAnnounced=true;setPhase('speed');announcePhase('SPEED UP!','HERE WE GO!','⚡');sound(650,.14,'triangle');}
 if(elapsed>=50&&!rushAnnounced){rushAnnounced=true;setPhase('rush');announcePhase('MOLE RUSH!','LAST 10 SECONDS','★');sound(820,.16,'triangle');}
 spawnIn-=dt;
 if(spawnIn<=0){
   spawn();
   if(elapsed>=50 && random()<.26)spawn();
   spawnIn=nextSpawnInterval();
 }
 for(const m of active){m.age+=dt;if(m.hit)m.hitAge+=dt;}
 active=active.filter(m=>m.hit?m.hitAge<.39:m.age<m.life);
 for(const f of fx)f.age+=dt;
 fx=fx.filter(f=>f.age<.55);
}
let phaseTimeout=null;
function setPhase(phase){boardWrap.classList.remove('phase-chill','phase-speed','phase-rush');if(phase!=='normal')boardWrap.classList.add('phase-'+phase);}
function hidePhase(){phaseAnnouncement.classList.remove('visible');if(phaseTimeout!==null){clearTimeout(phaseTimeout);phaseTimeout=null;}}
function announcePhase(title,subtitle,icon){hidePhase();phaseTitle.textContent=title;phaseSubtitle.textContent=subtitle;phaseIcon.textContent=icon;phaseAnnouncement.classList.add('visible');phaseTimeout=setTimeout(()=>{phaseAnnouncement.classList.remove('visible');phaseTimeout=null;},1850);}
function flash(label){floatMsg.textContent=label;floatMsg.classList.remove('show');void floatMsg.offsetWidth;floatMsg.classList.add('show');}
function strokePath(points,color='#725039',width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.stroke();}
function oval(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function drawPaper(){ctx.fillStyle='#f4e5c2';ctx.fillRect(0,0,W,H);ctx.lineWidth=1;for(let i=0;i<27;i++){const y=(i*61.6)%H;ctx.strokeStyle=i%2?'#ddbd8950':'#b9965e24';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y+Math.sin(i)*7);ctx.stroke();}for(let i=0;i<40;i++){let x=(i*109.43)%W,y=(i*53.27)%H;strokePath([[x,y],[x+7,y-2],[x+11,y+1]],'#89764a4a',1.3);}}
function drawHole(h){const {x,y,rx,ry}=h;oval(x+2,y+4,rx*1.12,ry*1.22,'#b18255');oval(x,y,rx,ry,'#513b35');oval(x,y+ry*.22,rx*.84,ry*.75,'#301e1c');ctx.strokeStyle='#865b3c';ctx.lineWidth=2.2;for(let k=0;k<2;k++){ctx.beginPath();ctx.ellipse(x+(k?2:-2),y+(k?0:-2),rx*(1.07+k*.03),ry*(1.05+k*.04),0,Math.PI*1.02,Math.PI*1.97);ctx.stroke();}}
function imgDraw(img,x,y,w,h,alpha=1){if(!img.complete||!img.naturalWidth)return;ctx.globalAlpha=alpha;ctx.drawImage(img,x,y,w,h);ctx.globalAlpha=1;}
function drawMole(m){
 const h=holes[m.n];if(!h)return;
 const appearing=Math.min(1,m.age/.18);
 const vanishing=Math.min(1,Math.max(0,m.life-m.age)/.20);
 const rise=m.hit?1:Math.max(0,Math.min(appearing,vanishing));
 const name=m.type+(m.hit?'_hit':'');
 const img=sprites[name];
 // The complete mole is centered over its own hole. Clip only its lower edge
 // behind the soil, never its left/right sides: those cuts looked like a bug.
 const width=Math.min(h.rx*(m.type==='crazy'?2.03:1.80), H*(m.type==='crazy'?.205:.185));
 const ratio=(img&&img.naturalWidth)?img.naturalHeight/img.naturalWidth:.9;
 const height=width*ratio;
 const surfaceY=h.y+h.ry*.54;
 const visibleHeight=height*.91*rise;
 const x=h.x-width/2;
 const y=surfaceY-visibleHeight+(m.hit?Math.min(m.hitAge*18,6):0);
 const wobble=(m.type==='crazy'&&!m.hit)?Math.sin(m.age*24)*Math.min(3,width*.018):0;
 ctx.save();
 ctx.beginPath();
 ctx.rect(0,0,W,Math.max(0,surfaceY));
 ctx.clip();
 imgDraw(img,x+wobble,y,width,height,m.hit?1:Math.min(1,rise*3));
 ctx.restore();
 if(m.hit)drawBurst(h.x,h.y-h.ry*1.6,m.label||'POP!',m.hitAge);
}
function drawBurst(x,y,label,age){ctx.save();ctx.globalAlpha=Math.max(0,1-age*2.6);ctx.font=`900 ${Math.round(Math.max(15,Math.min(32,W*.042)))}px sans-serif`;ctx.textAlign='center';ctx.lineWidth=5;ctx.strokeStyle='#fff1ce';ctx.strokeText(label,x,y-35-age*40);ctx.fillStyle=label==='OUCH!'?'#ab4530':label.includes('50')?'#863ca1':'#a04b20';ctx.fillText(label,x,y-35-age*40);ctx.restore();}
function drawRim(h){const {x,y,rx,ry}=h;ctx.save();ctx.strokeStyle='#86512f';ctx.lineWidth=Math.max(2,rx*.06);ctx.beginPath();ctx.ellipse(x,y+ry*.28,rx*1.07,ry*.87,0,.08,Math.PI-.08);ctx.stroke();ctx.strokeStyle='#b07b4e';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+2,y+ry*.33,rx*.99,ry*.86,0,.08,Math.PI-.08);ctx.stroke();ctx.restore();}
function render(){if(!W||!H)return;ctx.clearRect(0,0,W,H);drawPaper();for(const h of holes)drawHole(h);for(const m of active)drawMole(m);for(const h of holes)drawRim(h);for(let i=0;i<12;i++){let h=holes[i%9],x=h.x+h.rx*(i%2?1.35:-1.3),y=h.y+h.ry*.5;strokePath([[x-3,y+6],[x,y-2],[x+3,y+6]],'#75905a99',2);}for(const f of fx){ctx.save();ctx.globalAlpha=1-f.age/.55;ctx.strokeStyle=f.bad?'#c04c4c':'#d5a62b';ctx.lineWidth=2.7;for(let j=0;j<7;j++){const a=j*Math.PI*2/7,r=16+f.age*85;strokePath([[f.x+Math.cos(a)*r,f.y+Math.sin(a)*r],[f.x+Math.cos(a)*(r+12),f.y+Math.sin(a)*(r+12)]],ctx.strokeStyle,2.7);}ctx.restore();}}
function pointer(e){
 if(mode!=='playing')return;e.preventDefault();
 const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*W/rect.width,y=(e.clientY-rect.top)*H/rect.height;
 const candidates=active.filter(m=>!m.hit&&m.age>.045).map(m=>({m,h:holes[m.n]}))
 .filter(({h})=>Math.abs(x-h.x)<h.rx*1.23&&y>h.y-h.rx*2.08&&y<h.y+h.ry*1.5);
 candidates.sort((a,b)=>Math.abs(a.h.x-x)+Math.abs(a.h.y-y)-Math.abs(b.h.x-x)-Math.abs(b.h.y-y));
 if(!candidates.length){combo=0;comboEl.textContent='';sound(190,.05,'sine');return;}
 const m=candidates[0].m;m.hit=true;m.hitAge=0;
 const base={normal:10,gold:30,bomb:-10,crazy:50}[m.type];
 combo=base<0?0:combo+1;
 const factor=base<0?1:multiplier();
 const gain=Math.round(base*factor);
 score=Math.max(0,score+gain);scoreEl.textContent=score;
 comboEl.textContent=combo>=3?`${combo} COMBO  ×${factor.toFixed(1)}  ${combo>=8?'WOW!':combo>=5?'GREAT!':'NICE!'}`:'';
 m.label=base<0?'OUCH!':`+${gain}`;
 fx.push({x,y,age:0,bad:base<0});
 sound(base<0?155:base===50?880:base===30?720:460,.11,base<0?'sawtooth':'triangle');
 flash(base<0?'OOPS!':combo>=8?'WOW!':combo>=5?'GREAT!':combo>=3?'NICE!':'POP!');
}
function frame(t){let dt=Math.min(.05,(t-last)/1000||0);last=t;tick(dt);runMusic();render();requestAnimationFrame(frame);}
playBtn.addEventListener('click',()=>{if(mode==='paused'){unlockAudio();mode='playing';overlay.hidden=true;last=performance.now();resetMusicClock();}else start();});canvas.addEventListener('pointerdown',pointer);bgmBtn.addEventListener('click',()=>{bgmEnabled=!bgmEnabled;try{localStorage.setItem('mole_bgm',bgmEnabled?'on':'off');}catch(e){}showAudioSettings();if(bgmEnabled&&mode==='playing'){unlockAudio();resetMusicClock();}});sfxBtn.addEventListener('click',()=>{sfxEnabled=!sfxEnabled;try{localStorage.setItem('mole_sfx',sfxEnabled?'on':'off');}catch(e){}showAudioSettings();if(sfxEnabled){unlockAudio();sound(660,.08,'triangle');}});document.addEventListener('keydown',e=>{if(e.key==='Escape' && mode==='paused'){ /* Browser Escape is not overridden. */ }});document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing'){mode='paused';titleEl.textContent='PAUSED';textEl.textContent='Ready to keep going?';resultEl.hidden=true;playBtn.textContent='RESUME';overlay.hidden=false;}});
const ro=new ResizeObserver(resize);ro.observe(canvas);resize();last=performance.now();requestAnimationFrame(frame);
})();
