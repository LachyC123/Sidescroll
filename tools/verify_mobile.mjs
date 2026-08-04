// Mobile verification harness.
//
// The game shipped unplayable on a phone twice over: a fade curtain that was
// never lifted left every pre-gameplay screen solid black, and there were no
// touch controls at all, so a touch device had no way to move or even leave the
// title screen. Both were invisible to the desktop harness, which drives the
// game with a keyboard.
//
// This runs the whole first-play path on three emulated devices using nothing
// but touch: boot, title, new game, slot select, movement, jump, attack and
// pause. It also asserts the canvas and every control are actually on screen
// and large enough to hit.
//
//   node tools/verify_mobile.mjs [--url http://localhost:8099/game/]

import { chromium, devices } from 'playwright';
import fs from 'fs'; import path from 'path';
function findChrome(){const r='/opt/pw-browsers';for(const d of fs.readdirSync(r)){const p=path.join(r,d,'chrome-linux','chrome');if(d.startsWith('chromium-')&&fs.existsSync(p))return p;}}
const args=process.argv.slice(2);
const ai=args.indexOf('--url');
const URL = ai>=0 ? args[ai+1] : 'http://localhost:8099/game/';
const b=await chromium.launch({executablePath:findChrome()});
let fails=0;
const ck=(n,ok,d)=>{ if(!ok) fails++; console.log(`${ok?'  ok  ':' FAIL '} ${n}${d?'  -- '+d:''}`); };

async function run(label, dev, shot){
  console.log('\n=== '+label);
  const ctx=await b.newContext({...dev, hasTouch:true, isMobile:true});
  const pg=await ctx.newPage();
  pg.on('pageerror',e=>{console.log('PAGEERROR '+e.message); fails++;});
  await pg.goto(URL,{waitUntil:'load'});
  await pg.waitForFunction(()=>window.__crownless,null,{timeout:60000});
  await pg.waitForTimeout(1000);

  const tap = async (sel, ms=160) => {
    const el=await pg.$(sel); const bb=await el.boundingBox();
    await pg.touchscreen.tap(bb.x+bb.width/2, bb.y+bb.height/2);
    await pg.waitForTimeout(ms);
  };
  const colours = ()=>pg.evaluate(()=>{const c=document.getElementById('c');
    const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; const s=new Set();
    for(let i=0;i<d.length;i+=4) s.add((d[i]<<16)|(d[i+1]<<8)|d[i+2]); return s.size;});
  const cur = ()=>pg.evaluate(()=>{const m=window.__crownless.screen?.menu; return m?.current?.label ?? null;});
  const scr = ()=>pg.evaluate(()=>window.__crownless.screenName);

  const info=await pg.evaluate(()=>{
    const c=document.getElementById('c'), r=c.getBoundingClientRect();
    const pad=document.querySelector('.tc');
    const bs=[...document.querySelectorAll('.tc-btn')].map(b=>{const q=b.getBoundingClientRect();
      return {a:b.getAttribute('aria-label'), w:Math.round(q.width), h:Math.round(q.height),
              onScreen: q.top>=0&&q.bottom<=innerHeight&&q.left>=0&&q.right<=innerWidth};});
    return {canvas:[Math.round(r.width),Math.round(r.height)],
      canvasOnScreen: r.top>=0 && r.bottom<=innerHeight,
      padVisible:!pad.hidden, buttons:bs, vw:innerWidth, vh:innerHeight};
  });
  ck('canvas fits on screen', info.canvasOnScreen, `canvas ${info.canvas} in ${info.vw}x${info.vh}`);
  ck('touch pad is shown', info.padVisible);
  ck('all touch targets on screen and >=40x36', info.buttons.every(b=>b.onScreen&&b.w>=40&&b.h>=36),
     info.buttons.filter(b=>!b.onScreen||b.w<40||b.h<36).map(b=>b.a).join(',')||'all good');

  ck('boot renders', await colours()>=3, (await colours())+' colours');
  await tap('.tc-attack', 600);
  ck('reaches title by touch', await scr()==='title', await scr());
  ck('title renders', await colours()>=6, (await colours())+' colours');

  // navigate by label using only the pad
  const selectByLabel = async (want)=>{
    for(let i=0;i<20;i++){ const c=await cur();
      if(c===want){ await tap('.tc-attack', 320); return true; }
      await tap('.tc-down', 110); }
    return false;
  };
  ck('NEW GAME reachable by touch', await selectByLabel('NEW GAME'), await scr());
  ck('CHOOSE A SLOT reachable', await selectByLabel('CHOOSE A SLOT'), await scr());
  ck('SLOT 1 reachable', await selectByLabel('SLOT 1'), await scr());
  await pg.waitForTimeout(2200);
  ck('gameplay entered by touch', await pg.evaluate(()=>!!window.__crownless.world));
  ck('gameplay renders', await colours()>=30, (await colours())+' colours');

  // hold the on-screen right button with a real touch and confirm movement
  const el=await pg.$('.tc-right'); const bb=await el.boundingBox();
  const x=bb.x+bb.width/2, y=bb.y+bb.height/2;
  const x0=await pg.evaluate(()=>Math.round(window.__crownless.world.player.x));
  await pg.touchscreen.tap(x,y);            // ensure hit
  await pg.evaluate(([x,y])=>{
    const t=(type,id)=>{ const ev=new PointerEvent(type,{pointerId:id,clientX:x,clientY:y,
      bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true}); dispatchEvent(ev); };
    t('pointerdown',1); window.__holdRelease=()=>t('pointerup',1);
  },[x,y]);
  await pg.waitForTimeout(900);
  const x1=await pg.evaluate(()=>Math.round(window.__crownless.world.player.x));
  await pg.evaluate(()=>window.__holdRelease && window.__holdRelease());
  await pg.waitForTimeout(200);
  ck('holding the pad moves the player', x1-x0 > 40, `${x0} -> ${x1}`);
  const stopped=await pg.evaluate(async()=>{const f=window.__crownless;const a=f.world.player.x;
    await new Promise(r=>setTimeout(r,400)); return Math.round(f.world.player.x-a);});
  ck('releasing stops the player', Math.abs(stopped)<6, 'drift '+stopped);

  // jump and attack from touch
  await tap('.tc-jump', 120);
  ck('jump works from touch', await pg.evaluate(()=>{const s=window.__crownless.world.player.state;
    return s==='Airborne'||s==='JumpStart'||s==='Land';}), await pg.evaluate(()=>window.__crownless.world.player.state));
  await pg.waitForTimeout(700);
  await tap('.tc-attack', 90);
  ck('attack works from touch', await pg.evaluate(()=>/Attack/.test(window.__crownless.world.player.state)),
     await pg.evaluate(()=>window.__crownless.world.player.state));
  await pg.waitForTimeout(600);
  await tap('.tc-pause', 400);
  ck('pause opens from touch', await scr()==='pause', await scr());
  await pg.screenshot({path:shot});
  await ctx.close();
}
await run('iPhone portrait', devices['iPhone 13'], 'shots/mobile-portrait.png');
await run('iPhone landscape', devices['iPhone 13 landscape'], 'shots/mobile-landscape.png');
await run('Pixel 7 portrait', devices['Pixel 7'], 'shots/mobile-android.png');
console.log(fails? `\n${fails} FAILURES` : '\nall mobile checks passed');
await b.close();
process.exit(fails?1:0);
