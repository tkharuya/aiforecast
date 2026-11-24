const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.AF_PLAYWRIGHT||'playwright-core');
const E=require('../app/src/main/assets/engine.js');
const root=path.resolve(__dirname,'../app/src/main/assets'),out=path.resolve(__dirname,'../test-output');fs.mkdirSync(out,{recursive:true});
const NOW=Date.parse('2026-11-16T19:30:00+09:00');
let count=0;function ok(b,s){assert(b,s);count++;console.log('PASS',s)}
let p=150,seed=89736;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const candles=Array.from({length:1440},(_,i)=>{let o=p;p+=(rnd()-.5)*.04;return {t:NOW-(1440-i)*60000,o,h:Math.max(o,p)+.01,l:Math.min(o,p)-.01,c:p}});
const market={pair:'USD_JPY',candles,ticker:{bid:p-.001,ask:p+.001,timestamp:NOW,status:'CLOSE'},source:'テスト用データ（休場）',fetchedAt:NOW};
const server=http.createServer((req,res)=>{const f=path.join(root,req.url==='/'?'index.html':req.url);if(!f.startsWith(root)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.AF_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  for(const width of [360,412,840]){
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));let stored={},job={},working=false,lastRequest=null,exports=[];
   const auth={active:'test-profile',profiles:[{id:'test-profile',label:'テスト接続',email:'ui-test@example.invalid',sharing:true,connected:true}],signingIn:false};
   await page.exposeFunction('__testCall',async(id,action,data)=>{
    let out={},error=null,d=JSON.parse(data);try{switch(action){
     case 'loadState':out=stored;break;
     case 'saveState':stored=JSON.parse(data);break;
     case 'getStatus':out={auth,job,working};break;
     case 'market':out={...market,pair:d.pair};break;
     case 'calendar':out={events:[],fetchedAt:NOW};break;
     case 'models':out=[{slug:'test-model',display_name:'テストモデル'}];break;
     case 'startJob':{lastRequest=d;let id='test-'+Math.random().toString(36).slice(2);job={id,status:'complete',request:d,startedAt:NOW,finishedAt:NOW,sources:[]};
      if(d.kind==='forecast'){let c=d.context;job.result={summary:'模擬AI応答。実際のモデル推論ではありません。',facts:['入力はデモデータ'],inference:['予測の動作検証'],risks:['実際の相場と無関係'],invalidation:'検証用',eventScenarios:[],forecasts:c.times.map(t=>{let h=(t-c.requestedAt)/60000;return {time:t,p10:c.price-.02*Math.sqrt(h),p50:c.price+.001*h,p90:c.price+.02*Math.sqrt(h)+.002*h};})};}
      else{job.result={summary:'検証用の検索結果',events:[{title:'<img src=x onerror=alert(1)> テストイベント',time:new Date(NOW+3600000).toISOString(),currencies:['USD'],impact:'high',source_url:'https://www.bls.gov/schedule/',summary:'検索出典のあるテスト予定'},{title:'出典なし',time:new Date(NOW+3600000).toISOString(),currencies:['USD'],source_url:'https://invalid.invalid/no-source'}]};job.sources=[{url:'https://www.bls.gov/schedule/',title:'テスト出典'}];}out={id};break;}
     case 'exportFile':exports.push(d);out={saved:true};break;
     case 'reminders':out={count:0,granted:true};break;
     case 'cancelJob':working=false;job.status='cancelled';break;
     default:out={};
    }}catch(e){error=e.message;}if(!page.isClosed())await page.evaluate(({id,out,error})=>window.__nativeResult(id,out,error),{id,out,error});
   });
   await page.addInitScript(({now})=>{const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};window.Native={call:(id,a,d)=>window.__testCall(id,a,d)};},{now:NOW});
   await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('#content').textContent.includes('市場休場'));
   ok(await page.locator('[data-action="analyze"]').isDisabled(),width+' closed market cannot run current forecast');
   await page.locator('.bottom [data-page="settings"]').click();await page.locator('[data-action="demo"]').click();await page.waitForSelector('#chart path',{state:'attached'});
   ok(await page.locator('.banner.demo').count()===1,width+' demo is explicitly labeled');
   if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))){await page.screenshot({path:path.join(out,'overflow.png'),fullPage:true});console.log(await page.evaluate(()=>[...document.querySelectorAll('#content *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,15).map(e=>({tag:e.tagName,cls:e.className,rect:e.getBoundingClientRect().toJSON()}))));}
   ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' dashboard does not overflow');
   await page.locator('#strike').fill('152.20');await page.locator('#callPrice').fill('520');await page.locator('#putPrice').fill('540');ok((await page.locator('#oddsResult').textContent()).includes('52.0%'),width+' purchase price changes break-even');
   await page.locator('[data-action="ladder"]').click();await page.locator('[data-action="addLadder"]').click();await page.locator('[data-ladder="1"][data-field="strike"]').fill('152.25');await page.locator('[data-ladder="1"][data-field="call"]').fill('499');await page.locator('[data-ladder="1"][data-field="put"]').fill('580');await page.locator('[data-action="saveLadder"]').click();ok(await page.evaluate(()=>ladder().length===2),width+' ladder rows saved');
   await page.locator('[data-action="snapshot"]').click();ok(await page.evaluate(()=>state.history.length===1),width+' technical snapshot saved');
   await page.locator('[data-action="analyze"]').click();await page.waitForFunction(()=>working);await page.evaluate(()=>poll());await page.waitForFunction(()=>state.history.length===2);ok(lastRequest.kind==='forecast'&&lastRequest.context.times.length>=5,width+' AI receives exact horizon timestamps');
   ok((await page.locator('#content').textContent()).includes('模擬AI応答'),width+' completed AI forecast applied');
   await page.screenshot({path:path.join(out,'forecast-'+width+'.png'),fullPage:true});
   await page.locator('.bottom [data-page="events"]').click();await page.locator('[data-action="addEvent"]').click();await page.locator('[name="title"]').fill('手動の重要指標');await page.locator('#eventForm [type="submit"]').click();ok(await page.evaluate(()=>state.events.some(e=>e.title==='手動の重要指標')),width+' manual Japanese-time event saved');
   await page.locator('[data-action="research"]').click();await page.waitForFunction(()=>working);await page.evaluate(()=>poll());await page.waitForFunction(()=>state.events.some(e=>e.title.includes('テストイベント')));ok(!(await page.evaluate(()=>state.events.some(e=>e.title==='出典なし'))),width+' hallucinated event sources excluded');ok(await page.locator('#content img').count()===0,width+' event markup rendered as text');
   await page.screenshot({path:path.join(out,'events-'+width+'.png'),fullPage:true});
   await page.locator('.bottom [data-page="history"]').click();await page.locator('[data-action="backtest"]').click();ok((await page.locator('#content').textContent()).includes('モデル誤差'),width+' backtest displays baseline comparison');await page.locator('[data-action="export"]').click();ok(exports.length===1&&JSON.parse(exports[0].text).history.length===2,width+' history export excludes auth');ok(!exports[0].text.includes('access_token'),width+' no credential in export');
   await page.locator('[data-action="record"]').first().click();ok(await page.locator('#modal[open]').count()===1,width+' archived record opens');await page.locator('#modal [data-action="close"]').click();
   await page.locator('.bottom [data-page="settings"]').click();await page.screenshot({path:path.join(out,'settings-'+width+'.png'),fullPage:true});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' settings does not overflow');
   ok(errors.length===0,width+' no JavaScript errors: '+errors.join('; '));await page.close();
  }
  fs.writeFileSync(path.join(out,'ui-results.json'),JSON.stringify({checks:count,passed:true,account:'mock',market:'test and explicit demo',widths:[360,412,840]},null,2));console.log('UI tests:',count,'passed');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
