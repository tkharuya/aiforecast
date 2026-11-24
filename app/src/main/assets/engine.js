(function(root){
'use strict';
const MIN=60000,DAY=86400000,JST=9*3600000,PAIRS=['USD_JPY','EUR_JPY','GBP_JPY','AUD_JPY','EUR_USD'];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function jstDay(t){return new Date(t+JST).toISOString().slice(0,10)}
function dayStart(day){
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('日付が不正です');
 const start=Date.parse(day+'T00:00:00+09:00');
 if(!Number.isFinite(start)||jstDay(start)!==day)throw Error('日付が不正です');
 return start;
}
function usDst(t){let y=new Date(t).getUTCFullYear();let mar=new Date(Date.UTC(y,2,1)).getUTCDay(),nov=new Date(Date.UTC(y,10,1)).getUTCDay();let a=Date.UTC(y,2,1+(7-mar)%7+7,7),b=Date.UTC(y,10,1+(7-nov)%7,6);return t>=a&&t<b}
function schedule(day,mode='auto'){
 const base=dayStart(day),weekday=new Date(base+JST).getUTCDay();if(weekday===0||weekday===6)return [];
 const summer=mode==='summer'||(mode==='auto'&&usDst(base+12*3600000));const start=base+(summer?8:9)*3600000+20*MIN;
 return Array.from({length:10},(_,i)=>({id:day+'-'+(i+1),day,number:i+1,start:start+i*120*MIN,cutoff:start+(i+1)*120*MIN-2*MIN,expiry:start+(i+1)*120*MIN,summer}));
}
function defaultDay(now,mode='auto'){
 let today=jstDay(now),prev=jstDay(now-DAY),p=schedule(prev,mode);if(p.length&&now<p[9].expiry)return prev;
 for(let i=0;i<8;i++){let d=jstDay(dayStart(today)+i*DAY),s=schedule(d,mode);if(s.length&&now<s[9].expiry)return d;}return today;
}
function roundStatus(r,now){return now<r.start?'開始前':now<r.cutoff?'購入可能':now<r.expiry?'購入締切':'終了'}
function cleanCandles(input,now=Date.now()){
 const map=new Map();for(const a of input||[]){let c={t:+(a.t??a.openTime),o:+(a.o??a.open),h:+(a.h??a.high),l:+(a.l??a.low),c:+(a.c??a.close)};
  if(!Object.values(c).every(finite)||c.t<=0||c.c<=0||c.l<=0||c.h<Math.max(c.o,c.c)||c.l>Math.min(c.o,c.c)||c.t+MIN>now)continue;map.set(c.t,c);
 }return [...map.values()].sort((a,b)=>a.t-b.t);
}
function aggregate(candles,n,now=Date.now()){
 if(n===1)return candles;const map=new Map();for(const c of candles){let t=Math.floor(c.t/(n*MIN))*n*MIN;if(t+n*MIN>now)continue;let b=map.get(t);if(!b)map.set(t,{t,o:c.o,h:c.h,l:c.l,c:c.c,count:1});else{b.h=Math.max(b.h,c.h);b.l=Math.min(b.l,c.l);b.c=c.c;b.count++;}}return [...map.values()].filter(b=>b.count===n);
}
function ema(a,n){if(!a.length)return [];let v=a[0];return a.map((x,i)=>i?(v+=(x-v)*2/(n+1)):v)}
function indicators(candles){
 if(candles.length<35)return null;let c=candles.map(x=>x.c),e9=ema(c,9),e21=ema(c,21),e50=ema(c,50),a=ema(c,12),b=ema(c,26),macd=a.map((x,i)=>x-b[i]),signal=ema(macd,9);
 let gain=0,loss=0,atr=0;for(let i=1;i<c.length;i++){let d=c[i]-c[i-1],tr=Math.max(candles[i].h-candles[i].l,Math.abs(candles[i].h-c[i-1]),Math.abs(candles[i].l-c[i-1]));if(i<=14){gain+=Math.max(0,d)/14;loss+=Math.max(0,-d)/14;atr+=tr/14;}else{gain=(gain*13+Math.max(0,d))/14;loss=(loss*13+Math.max(0,-d))/14;atr=(atr*13+tr)/14;}}
 let tail=c.slice(-20),mid=mean(tail),sd=Math.sqrt(mean(tail.map(x=>(x-mid)**2))),last=c.length-1;
 return {ema9:e9[last],ema21:e21[last],ema50:e50[last],rsi:loss===0?(gain===0?50:100):100-100/(1+gain/loss),macd:macd[last],signal:signal[last],hist:macd[last]-signal[last],atr,bbMid:mid,bbLow:mid-2*sd,bbHigh:mid+2*sd,trend:e9[last]>e21[last]&&e21[last]>e50[last]?'上昇':e9[last]<e21[last]&&e21[last]<e50[last]?'下落':'横ばい',support:Math.min(...candles.slice(-60).map(x=>x.l)),resistance:Math.max(...candles.slice(-60).map(x=>x.h))};
}
function analyze(input,ticker,pair,now=Date.now(),demo=false){
 const candles=cleanCandles(input,now);if(candles.length<60)throw Error('確定した1分足が60本以上必要です。更新するかCSVを読み込んでください。');
 let segment=[candles[candles.length-1]];for(let i=candles.length-2;i>=0&&segment.length<720;i--){if(segment[0].t-candles[i].t>90000)break;segment.unshift(candles[i]);}
 const last=candles[candles.length-1],q=ticker||{},qt=typeof q.timestamp==='number'?q.timestamp:Date.parse(q.timestamp),bid=+q.bid,ask=+q.ask;
 const hasQuote=finite(qt)&&finite(bid)&&finite(ask)&&bid>0&&ask>=bid;
 const price=hasQuote?(bid+ask)/2:last.c,asOf=hasQuote?qt:last.t+MIN,spread=hasQuote?ask-bid:0;
 let reason='';
 if(now-asOf>120000||asOf>now+30000)reason='レートが古いため新しい予測を停止';
 if(now-last.t-MIN>180000)reason='ローソク足が更新されていません';
 if(segment.length<60)reason='連続した確定足が不足しています';
 if(!hasQuote&&!demo)reason='最新レートが不正か取得できていません';
 if(!demo&&q.status!=='OPEN')reason=q.status==='CLOSE'?'市場休場':q.status==='IMPORTED'?'CSVは過去検証専用です':'取引状態を確認できません';
 const ind=indicators(segment.length>=60?segment:candles),ret=[];for(let i=1;i<segment.length;i++)ret.push(Math.log(segment[i].c/segment[i-1].c));
 let recent=ret.slice(-240),m=recent.length?mean(recent):0,variance=recent.length?mean(recent.map(x=>(x-m)**2)):0;
 const tick=pair==='EUR_USD'?0.00001:0.001,sigma=Math.max(Math.sqrt(variance),ind.atr/price/1.6,tick/price);
 const drift=clamp(Math.log(ind.ema9/ind.ema21)/12,-sigma*0.25,sigma*0.25);
 return {pair,candles,price,asOf,spread,quoteStatus:q.status||'UNKNOWN',now,demo,reason,ready:!reason,ind,sigma,drift,tick,multi:[1,5,15].map(n=>({minutes:n,ind:indicators(aggregate(candles,n,now))}))};
}
function forecastAt(a,time,events=[]){
 if(!a.ready||time<=a.now||time-a.now>DAY)return null;const h=(time-a.now)/MIN;
 const relevant=events.filter(e=>e.time>a.now&&e.time<=time&&eventRelevant(e,a.pair));
 const high=relevant.some(e=>e.impact==='high');const boost=high?1.8:relevant.length?1.25:1;
 const logMean=Math.log(a.price)+a.drift*30*(1-Math.exp(-h/30));
 const sig=a.sigma*Math.sqrt(h)*boost,mid=Math.exp(logMean),z=1.2815515655446;
 return {time,p10:Math.exp(logMean-z*sig),p50:mid,p90:Math.exp(logMean+z*sig),sigmaLog:sig,source:'technical',eventRisk:high,events:relevant.map(e=>e.id),label:'統計モデル・未校正'};
}
function normalCDF(x){const t=1/(1+0.2316419*Math.abs(x)),d=0.3989422804014327*Math.exp(-x*x/2),p=1-d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return x>=0?p:1-p;}
function probability(f,strike,tick){if(!f||!finite(strike)||strike<=0)return null;const s=(Math.log(f.p90)-Math.log(f.p10))/(2*1.2815515655446);if(!finite(s)||s<=0)return null;return clamp(1-normalCDF((Math.log(Math.max(tick,strike-tick/2))-Math.log(f.p50))/s),0.0001,0.9999)}
function payoff(p,price){if(!finite(p)||p<0||p>1||!finite(price)||price<=0||price>=1000)return null;return {breakeven:price/1000,ev:1000*p-price,profit:1000-price,loss:price};}
function settles(price,strike,tick){return Math.round(price/tick)>=Math.round(strike/tick)?'call':'put'}
function eventRelevant(e,pair){const [a,b]=pair.split('_');return !e.currencies?.length||e.currencies.includes(a)||e.currencies.includes(b)||e.currencies.includes('ALL')}
function safeURL(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}
function validateEvents(raw,now,sources=[],manual=false){
 if(!Array.isArray(raw))throw Error('イベント一覧がありません');let allowed=new Set(sources.map(s=>safeURL(s.url)).filter(Boolean));let out=[];
 for(const x of raw){let time=x.time===null?null:typeof x.time==='number'?x.time:typeof x.time==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(x.time)?Date.parse(x.time):NaN,url=safeURL(x.source_url||x.url||'');
  if(!x.title||typeof x.title!=='string'||x.title.length>300)continue;
  if(time!==null&&(!finite(time)||time<now-2*DAY||time>now+90*DAY))continue;
  if(!manual&&(!url||!allowed.has(url)))continue;
  out.push({id:x.id||'evt-'+Math.random().toString(36).slice(2),title:x.title,time,currencies:Array.isArray(x.currencies)?x.currencies.filter(c=>['USD','JPY','EUR','GBP','AUD','ALL'].includes(c)):['ALL'],impact:['high','medium','low'].includes(x.impact)?x.impact:'medium',source_url:url,source:manual?'manual':'ai',fetchedAt:now,forecast:String(x.forecast||''),previous:String(x.previous||''),summary:String(x.summary||''),up:String(x.up||''),down:String(x.down||''),base:String(x.base||''),direction:['up','down','neutral','uncertain'].includes(x.direction)?x.direction:'uncertain',timing:time===null?'時刻未定':'予定'});
 }return out;
}
function validateForecast(raw,a,times){
 if(!raw||!Array.isArray(raw.forecasts))throw Error('AIの予測データが見つかりません');const map=new Map();
 for(const f of raw.forecasts){let time=typeof f.time==='number'?f.time:Date.parse(f.time),target=times.find(t=>Math.abs(t-time)<1000);let p10=+f.p10,p50=+f.p50,p90=+f.p90;
  if(target===undefined||![p10,p50,p90].every(finite)||p10<=0||p10>=p50||p50>=p90)continue;
  map.set(target,{time:target,p10,p50,p90,source:'ai',label:'GPT推定・未校正',reason:String(f.reason||''),eventRisk:false});
 }
 if(map.size!==times.length)throw Error('AIの応答に時刻の欠落または不正な予測幅があります。前回の結果を保持しました。再実行してください。');
 return {forecasts:[...map.values()].sort((x,y)=>x.time-y.time),summary:String(raw.summary||''),facts:Array.isArray(raw.facts)?raw.facts.map(String):[],inference:Array.isArray(raw.inference)?raw.inference.map(String):[],risks:Array.isArray(raw.risks)?raw.risks.map(String):[],invalidation:String(raw.invalidation||''),eventScenarios:Array.isArray(raw.eventScenarios)?raw.eventScenarios:[]};
}
function parseCSV(text){
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);if(lines.length<2)throw Error('CSVが空です');let sep=lines[0].includes('\t')?'\t':',',head=lines.shift().split(sep).map(x=>x.trim().toLowerCase().replace(/^"|"$/g,''));
 const idx=names=>head.findIndex(h=>names.includes(h)),ti=idx(['time','timestamp','datetime','date','opentime','t']),oi=idx(['open','o']),hi=idx(['high','h']),li=idx(['low','l']),ci=idx(['close','c']);
 if([ti,oi,hi,li,ci].some(i=>i<0))throw Error('time,open,high,low,close の列が必要です。timeは時差付きISO日時かUNIX時刻にしてください。');
 let rows=lines.map(line=>{let v=line.split(sep).map(x=>x.trim().replace(/^"|"$/g,'')),raw=v[ti],t=/^\d+(\.\d+)?$/.test(raw)?+raw:/(Z|[+-]\d{2}:?\d{2})$/.test(raw)?Date.parse(raw):NaN;if(t<1e11)t*=1000;return {t,o:+v[oi],h:+v[hi],l:+v[li],c:+v[ci]}});
 if(rows.some(c=>!Object.values(c).every(finite)||c.c<=0||c.l<=0||c.h<Math.max(c.o,c.c)||c.l>Math.min(c.o,c.c)))throw Error('CSVに不正な価格または時差のない日時があります');return rows;
}
function evaluate(record,candles){
 let out=[];for(const f of record.forecasts){let c=candles.find(c=>c.t===f.time)||candles.find(c=>c.t+MIN===f.time);if(!c)continue;let actual=c.t===f.time?c.o:c.c;out.push({time:f.time,predicted:f.p50,actual,error:Math.abs(f.p50-actual),covered:actual>=f.p10&&actual<=f.p90,direction:Math.sign(f.p50-record.price)===Math.sign(actual-record.price)});}return out;
}
function backtest(candles,pair,h=30){
 let results=[];const step=Math.max(h,15);for(let i=240;i+h<candles.length;i+=step){if(candles[i+h].t-candles[i].t!==h*MIN)continue;let now=candles[i].t+MIN,price=candles[i].c;
  try{let a=analyze(candles.slice(0,i+1),{bid:price,ask:price,timestamp:now,status:'OPEN'},pair,now),f=forecastAt(a,now+h*MIN);if(!f)continue;let actual=candles[i+h].c;results.push({error:Math.abs(f.p50-actual),baseError:Math.abs(price-actual),covered:actual>=f.p10&&actual<=f.p90,direction:Math.sign(f.p50-price)===Math.sign(actual-price)});}catch{}
 }return {n:results.length,mae:results.length?mean(results.map(x=>x.error)):null,naiveMAE:results.length?mean(results.map(x=>x.baseError)):null,coverage:results.length?mean(results.map(x=>+x.covered)):null,direction:results.length?mean(results.map(x=>+x.direction)):null,h};
}
const API={MIN,DAY,JST,PAIRS,clamp,mean,finite,jstDay,dayStart,usDst,schedule,defaultDay,roundStatus,cleanCandles,aggregate,ema,indicators,analyze,forecastAt,normalCDF,probability,payoff,settles,eventRelevant,safeURL,validateEvents,validateForecast,parseCSV,evaluate,backtest};
if(typeof module!=='undefined')module.exports=API;else root.Engine=API;
})(typeof window!=='undefined'?window:globalThis);
