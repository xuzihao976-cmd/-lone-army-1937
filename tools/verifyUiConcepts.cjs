/* Meaningful prototype checks; no browser automation enters the production game. */
const { chromium } = require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const output=path.resolve(process.env.UI_CONCEPT_ARTIFACTS||'test-artifacts/ui-concepts');
const base=process.env.UI_CONCEPT_URL||'http://127.0.0.1:3021/ui-concepts/index.html';
const fixture=JSON.parse(fs.readFileSync('design/ui-concepts/fixture.json','utf8'));
const source=fixture.chapters.find(c=>c.id==='sihang');
const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
function contrast(a,b){const lum=c=>rgb(c).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);const x=[lum(a),lum(b)].sort((a,b)=>a-b);return(x[1]+.05)/(x[0]+.05);}
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.UI_CONCEPT_CHROMIUM||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const records=[],flows=[],contrasts=[];let modelRequests=0;const errors=[];
 try{
  for(const concept of['night','command','paper'])for(const sample of['opening','field'])for(const[width,height]of[[320,640],[390,844],[768,1024],[1280,900],[844,390]]){
   const context=await browser.newContext({viewport:{width,height},locale:'zh-CN',reducedMotion:'reduce'});
   await context.addInitScript(()=>{localStorage.setItem('lone_army_autosave','UI_CHECK_SENTINEL');localStorage.setItem('lone_army_slot_1','MANUAL_CHECK_SENTINEL');});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/api\/|dashscope|openai\.com|anthropic/.test(r.url()))modelRequests++;});
   await page.goto(`${base}?concept=${concept}&sample=${sample}&capture=1`,{waitUntil:'networkidle'});
   const root=page.locator(`[data-concept="${concept}"]`);await root.locator('.command-input').waitFor();
   const expected=source[sample==='opening'?'openingSample':'fieldSample'];
   const geometry=await root.evaluate(el=>{const get=s=>{const r=el.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};return{viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,rootWidth:el.scrollWidth,clientWidth:el.clientWidth,journal:get('.journal'),input:get('.command-input'),primary:get('.command-form .primary'),stateHash:el.dataset.stateHash,values:Object.fromEntries([...el.querySelectorAll('[data-field]')].map(e=>[e.dataset.field,e.dataset.value]))};});
   assert(geometry.documentWidth<=width+1,`${concept} ${width} document overflows`);
   assert(geometry.rootWidth<=geometry.clientWidth+1,`${concept} ${width} product overflows`);
   assert(geometry.input.bottom<=height+1,`${concept} ${width} input inaccessible`);
   assert(geometry.primary.bottom<=height+1&&geometry.primary.x>=0&&geometry.primary.right<=width+1,`${concept} ${width} submit inaccessible`);
   assert(geometry.primary.height>=44&&geometry.primary.width>=44,`${concept} primary target too small`);
   assert(geometry.journal.height>=30,`${concept} journal collapsed`);
   assert.equal(geometry.stateHash,expected.stateHash);
   for(const key of['wounded','morale','health','ammo','machineGunAmmo','grenades','sandbags','medkits'])assert.equal(Number(geometry.values[key]),expected.stats[key],concept+' mismatches '+key);
   assert.equal(Number(geometry.values.combatReady),expected.combatReady);
   records.push({concept,sample,width,height,...geometry});
   if(sample==='field'&&[320,390,1280].includes(width))await page.screenshot({path:path.join(output,`${concept}-${width===1280?'desktop':width===390?'mobile':'narrow'}.png`),fullPage:true});
   if(sample==='field'&&width===390){
    const before=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
    await root.getByRole('button',{name:'军令',exact:true}).click();
    await root.locator('dialog .dialog-body button[data-index="0"]').click();
    await root.getByRole('dialog').waitFor();assert((await root.locator('dialog .dialog-body').innerText()).includes(expected.previews[0].preview.durationLabel));
    await page.keyboard.press('Escape');assert.equal(await root.locator('dialog').evaluate(e=>e.open),false);
    await root.getByRole('button',{name:'阵地',exact:true}).click();assert((await root.locator('dialog .dialog-body').innerText()).includes('一楼入口'));await page.keyboard.press('Escape');
    await root.getByRole('button',{name:'顾问',exact:true}).click();assert((await root.locator('dialog .dialog-body').innerText()).includes('不执行军令'));await page.keyboard.press('Escape');
    await root.locator('.command-input').fill('侦察敌情');await root.locator('.command-form .primary').click();assert((await root.locator('dialog .dialog-body').innerText()).includes('15分钟'));await page.keyboard.press('Escape');
    await root.locator('.command-input').fill('<img src=x onerror=alert(1)>');await root.locator('.command-form .primary').click();assert.equal(await root.locator('dialog img').count(),0);await page.keyboard.press('Escape');
    const enlarged=await root.evaluate(el=>{el.style.setProperty('--reading-size','32px');const journal=el.querySelector('.journal');return{scroll:journal.scrollWidth,client:journal.clientWidth,input:el.querySelector('.command-input').getBoundingClientRect().bottom};});
    assert(enlarged.scroll<=enlarged.client+1&&enlarged.input<=844);await root.evaluate(el=>el.style.setProperty('--reading-size','16px'));
    await root.getByRole('button',{name:'章节',exact:true}).click();await page.screenshot({path:path.join(output,`${concept}-chapters-mobile.png`),fullPage:true});
    for(const chapter of fixture.chapters){
     await root.locator(`[data-action="chapter"][data-chapter="${chapter.id}"]`).click();await root.locator('[data-action="tactic"]').first().click();assert((await root.locator('dialog').innerText()).includes(chapter.tactics[0].title));await page.keyboard.press('Escape');
     await root.locator('.menu-dock .primary').click();assert.equal(await root.getAttribute('data-chapter'),chapter.id);assert.equal(Number(await root.locator('[data-field="ammo"]').getAttribute('data-value')),chapter.fieldSample.stats.ammo);await root.getByRole('button',{name:'章节',exact:true}).click();
    }
    await root.locator('[data-action="chapter"][data-chapter="sihang"]').click();await root.locator('.menu-dock .primary').click();
    assert.equal(await root.getAttribute('data-state-hash'),expected.stateHash);assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage)))),before);
    flows.push({concept,militaryPreview:true,advisorReadOnly:true,mapOwnSectors:true,dialogEscape:true,threeChapters:true,tacticRules:true,inputEscaping:true,bodyText200Percent:true,storageUnchanged:true});
    const pairs=await root.evaluate(el=>[...el.querySelectorAll('.metric span,.supply span,.supply b,.journal-copy p,.journal-title,.meta,.quick-action span,.primary,.night-context,.header-time small')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height;}).map(e=>{let p=e,bg='';while(p){const value=getComputedStyle(p).backgroundColor;if(value!=='rgba(0, 0, 0, 0)'&&value!=='transparent'){bg=value;break;}p=p.parentElement;}return{text:e.textContent.slice(0,35),fg:getComputedStyle(e).color,bg};}));
    for(const pair of pairs){const ratio=contrast(pair.fg,pair.bg);assert(ratio>=4.5,`${concept} low text contrast ${ratio} ${pair.text}`);contrasts.push({concept,...pair,ratio});}
   }
   await context.close();
  }
  // Review toolbar must remain usable too, not only the full-screen captures.
  for(const concept of['night','command','paper']){
   const page=await browser.newPage({viewport:{width:320,height:640}});await page.goto(`${base}?concept=${concept}`,{waitUntil:'networkidle'});
   const bottom=await page.locator(`[data-concept="${concept}"] .command-form .primary`).evaluate(e=>e.getBoundingClientRect().bottom);assert(bottom<=641,concept+' review toolbar hides submit');await page.close();
  }
  assert.equal(modelRequests,0);assert.deepEqual(errors,[]);
  const result={date:'2026-11-15',status:'passed',layoutCases:records.length,interactionGroups:flows.length,modelRequests,consoleErrors:errors,minimumCheckedTextContrast:Math.min(...contrasts.map(x=>x.ratio)),records,flows,contrasts,limits:['Browser size simulation; no real iOS/Android keyboard test','200% check applies to narrative text, not complete OS font scaling','Read-only design prototypes; no production game or online deployment test']};
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,records:undefined,flows:undefined,contrasts:undefined},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
