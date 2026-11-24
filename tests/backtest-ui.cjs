const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.AF_PLAYWRIGHT||'playwright-core'),E=require('../app/src/main/assets/engine.js');
const root=path.resolve(__dirname,'../app/src/main/assets'),out=path.resolve(__dirname,'../test-output');
const NOW=Date.parse('2026-11-15T23:00:00+09:00'),first=Date.parse('2026-10-01T00:00:00+09:00');let price=150,seed=492765;
const candles=Array.from({length:4320},(_,i)=>{const o=price;seed=(Math.imul(seed,1664525)+1013904223)>>>0;price+=(seed/4294967296-.5)*.04;return {t:first+i*E.MIN,o,h:Math.max(o,price)+.01,l:Math.min(o,price)-.01,c:price}});
const dataset={pair:'USD_JPY',from:'2026-10-01',to:'2026-10-02',candles,missing:[],source:'テスト用の合成データ',fetchedAt:NOW};
let count=0;const ok=(b,name)=>{assert(b,name);count++;console.log('PASS',name)};
const server=http.createServer((req,res)=>{const f=path.join(root,req.url==='/'?'index.html':req.url);if(!f.startsWith(root)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.AF_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:412,height:900}}),errors=[],exports=[],requests=[];page.on('pageerror',e=>errors.push(e.message));let stored={version:1,btSettings:{from:dataset.from,to:dataset.to,h:30,count:3}},job={},runs=0;
 const auth={active:'mock',profiles:[{id:'mock',label:'模擬接続',email:'mock@example.invalid',sharing:true,connected:true}],signingIn:false};
 await page.exposeFunction('__testCall',async(id,a,raw)=>{let r={},error=null,d=JSON.parse(raw);try{switch(a){
 case 'loadState':r=stored;break;case 'saveState':stored=d;break;
 case 'getStatus':r={auth,job,working:false};break;
 case 'models':r=[{slug:'mock-model',display_name:'模擬モデル'}];break;
 case 'calendar':r={events:[],fetchedAt:NOW};break;
 case 'market':throw Error('休場中の検証用応答');
 case 'startJob':{
 requests.push(d);const jid='mock-'+requests.length;job={id:jid,status:'complete',request:d,finishedAt:NOW};
 if(d.kind==='history')job.result=dataset;
 else if(d.kind==='backtest'){
  runs++;job.results=d.items.map((item,i)=>({id:item.id,status:'complete',result:{p10:99.9,p50:100.01,p90:100.1,reason:'UI試験の模擬応答'}}));
  if(runs===1){job.status='failed';job.error='模擬の利用上限';job.results=[job.results[0],{id:d.items[1].id,status:'failed',error:'模擬の利用上限'}];}
 }r={id:jid};break;}
 case 'exportFile':exports.push(d);r={saved:true};break;
 default:r={};
 }}catch(e){error=e.message;}if(!page.isClosed())await page.evaluate(({id,r,error})=>window.__nativeResult(id,r,error),{id,r,error});});
 await page.addInitScript(({now})=>{const D=Date;window.Date=class extends D{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};window.Native={call:(id,a,d)=>window.__testCall(id,a,d)};},{now:NOW});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!document.querySelector('.bottom'));
 await page.locator('.bottom [data-page="history"]').click();
 await page.locator('[data-action="loadBacktest"]').click();await page.waitForFunction(()=>working);await page.evaluate(()=>poll());await page.waitForFunction(()=>!!state.btData);
 ok(requests[0].kind==='history','history download is queued without including user credentials');
 ok(await page.locator('#content').textContent().then(x=>x.includes('4,320本')),'retrieved candle count displayed');
 await page.locator('[data-action="runTechnical"]').click();await page.waitForFunction(()=>state.btRuns?.length===1&&!working);
 ok(await page.evaluate(()=>state.btRuns[0].rows.length===20),'all 20 historical rounds scored');
 ok(await page.evaluate(()=>state.btRuns[0].rows.every(x=>x.source==='technical')),'technical score is not labeled GPT');
 await page.locator('[data-action="runGPTTest"]').click();await page.waitForFunction(()=>working);await page.evaluate(()=>poll());await page.waitForFunction(()=>state.btRuns[1]?.rows.length===1);
 const initial=requests.at(-1);ok(initial.kind==='backtest'&&initial.items.length===3,'requested sample count is sent');
 ok(initial.items.every(x=>!x.prompt.includes('2026-')&&!x.prompt.includes('USD_JPY')&&!x.prompt.includes('"actual"')),'model prompt excludes dates currency pair and answers');
 ok(await page.evaluate(()=>state.btRuns[1].rows.length===1&&state.btRuns[1].failures.length===1),'successful case retained and failed case not scored');
 ok((await page.locator('#content').textContent()).includes('模擬の利用上限'),'failure reason visible');
 const completed=initial.items[0].id;
 await page.locator('[data-action="resumeGPTTest"]').click();await page.waitForFunction(()=>working);await page.evaluate(()=>poll());await page.waitForFunction(()=>state.btRuns[1]?.rows.length===3);
 const resumed=requests.at(-1);ok(resumed.items.length===2&&!resumed.items.some(x=>x.id===completed),'resume sends only unfinished cases');
 ok(await page.evaluate(()=>state.btRuns[1].failures.length===0&&new Set(state.btRuns[1].rows.map(x=>x.id)).size===3),'retry replaces failure and cannot duplicate scores');
 ok((await page.locator('#content').textContent()).includes('同じケースの統計モデル'),'paired baseline comparison visible');
 for(const width of [360,412,840]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(out,'backtest-'+width+'.png'),fullPage:true});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' historical results do not overflow');}
 await page.locator('[data-action="btDetails"]').first().click();ok(await page.locator('#modal tbody tr').count()===3,'case-level GPT results open');await page.locator('#modal [data-action="close"]').click();
 await page.locator('[data-action="exportBacktest"]').click();ok(exports.length===1,'results export completed');const payload=JSON.parse(exports[0].text);ok(payload.runs.length===2&&payload.runs[1].summary.n===3,'export contains distinct technical and GPT results');ok(!exports[0].text.includes('access_token'),'export excludes credentials');
 await page.reload();await page.waitForFunction(()=>state.btRuns?.length===2);await page.locator('.bottom [data-page="history"]').click();ok(await page.evaluate(()=>state.btRuns[1].rows.length===3),'results survive UI restart');
 ok(errors.length===0,'no browser errors: '+errors.join('; '));
 fs.writeFileSync(path.join(out,'backtest-ui-results.json'),JSON.stringify({checks:count,passed:true,account:'mock',market:'synthetic',GPT:'mock',widths:[360,412,840]},null,2));console.log('Backtest UI tests:',count,'passed');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
