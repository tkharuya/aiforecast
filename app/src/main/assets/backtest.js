(function(root){'use strict';
const E=typeof module!=='undefined'?require('./engine.js'):root.Engine;
function dates(from,to){const start=E.dayStart(from),end=E.dayStart(to);if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw Error('開始日と終了日を確認してください');const out=[];for(let t=start;t<=end;t+=E.DAY){const d=E.jstDay(t);if(E.schedule(d).length)out.push(d);}return out;}
function caseIndex(input,pair,from,to,h=30,mode='auto'){
 if(!E.PAIRS.includes(pair)||![5,15,30,60,120].includes(+h))throw Error('通貨ペアまたは予測時間が不正です');
 const candles=E.cleanCandles(input),index=new Map(candles.map((c,i)=>[c.t,i])),cases=[],excluded=[];h=+h;
 for(const day of dates(from,to))for(const round of E.schedule(day,mode)){
  const decision=round.expiry-h*E.MIN,i=index.get(decision-E.MIN),j=index.get(round.expiry-E.MIN),id=pair+'|'+round.id+'|'+h;
  if(i===undefined||j===undefined||i<59){excluded.push({id,day,reason:'判断時刻または判定時刻の足が不足'});continue;}
  if(j-i!==h){excluded.push({id,day,reason:'判定までの1分足に欠損'});continue;}
  let first=i;while(first>0&&i-first<719&&candles[first].t-candles[first-1].t<=90000)first--;
  if(i-first+1<60){excluded.push({id,day,reason:'判断前の連続足が不足'});continue;}
  cases.push({id,pair,day,round:round.number,h,decision,expiry:round.expiry,i,j,price:candles[i].c,actual:candles[j].c,tick:pair==='EUR_USD'?.00001:.001,pip:pair==='EUR_USD'?.0001:.01});
 }
 return {pair,from,to,h,candles,cases,excluded,eligible:cases.length,expected:cases.length+excluded.length,mode};
}
function context(data,c){
 const before=data.candles.slice(Math.max(0,c.i-1499),c.i+1),a=E.analyze(before,{bid:c.price,ask:c.price,timestamp:c.decision,status:'OPEN'},c.pair,c.decision);
 if(!a.ready)throw Error(a.reason);return a;
}
function score(c,f,source='technical',extra={}){
 if(!f||![f.p10,f.p50,f.p90].every(E.finite)||f.p10<=0||f.p10>=f.p50||f.p50>=f.p90)throw Error('予測分位点が不正です');
 const p=E.probability(f,c.price,c.tick),pred=p>=.5?'call':'put',actual=E.settles(c.actual,c.price,c.tick),tie=Math.round(c.actual/c.tick)===Math.round(c.price/c.tick);
 return {id:c.id,pair:c.pair,day:c.day,round:c.round,h:c.h,decision:c.decision,expiry:c.expiry,price:c.price,actual:c.actual,p10:f.p10,p50:f.p50,p90:f.p90,pCall:p,prediction:pred,label:actual,correct:pred===actual,tie,rawTie:c.actual===c.price,rawCorrect:pred===(c.actual>=c.price?'call':'put'),errorPips:Math.abs(f.p50-c.actual)/c.pip,naiveErrorPips:Math.abs(c.price-c.actual)/c.pip,covered:c.actual>=f.p10&&c.actual<=f.p90,brier:(p-(actual==='call'?1:0))**2,logLoss:-(actual==='call'?Math.log(p):Math.log(1-p)),source,...extra};
}
function technicalCase(data,c){const a=context(data,c),f=E.forecastAt(a,c.expiry,[]),older=data.candles[c.i-30],momentum=older&&c.price>=older.c?'call':'put';return score(c,f,'technical',{momentumCorrect:momentum===E.settles(c.actual,c.price,c.tick)});}
function evenlySpaced(cases,n){n=Math.min(cases.length,Math.max(1,Math.floor(+n||1)));return Array.from({length:n},(_,i)=>cases[Math.min(cases.length-1,Math.floor((i+.5)*cases.length/n))]);}
function blindInput(data,c){
 const a=context(data,c),scale=100/c.price,baseline=E.forecastAt(a,c.expiry,[]);
 function ind(x){if(!x)return null;const out={...x};for(const k of ['ema9','ema21','ema50','macd','signal','hist','atr','bbMid','bbLow','bbHigh','support','resistance'])out[k]=+(out[k]*scale).toFixed(8);return out;}
 return {schema:'aiforecast-blind-technical-v1',origin:100,horizonMinutes:c.h,sessionHourJST:new Date(c.decision+E.JST).getUTCHours(),indicators:ind(a.ind),multiTimeframe:a.multi.map(x=>({minutes:x.minutes,ind:ind(x.ind)})),baseline:{p10:baseline.p10*scale,p50:baseline.p50*scale,p90:baseline.p90*scale},candles1m:a.candles.slice(-180).map(x=>({minute:(x.t+E.MIN-c.decision)/E.MIN,o:+(x.o*scale).toFixed(8),h:+(x.h*scale).toFixed(8),l:+(x.l*scale).toFixed(8),c:+(x.c*scale).toFixed(8)})),candles5m:E.aggregate(a.candles,5,c.decision).slice(-80).map(x=>({minute:(x.t+5*E.MIN-c.decision)/E.MIN,o:+(x.o*scale).toFixed(8),h:+(x.h*scale).toFixed(8),l:+(x.l*scale).toFixed(8),c:+(x.c*scale).toFixed(8)}))};
}
function blindPrompt(data,c){return 'You are evaluating an anonymous historical FX technical snapshot. Predict only from the observations provided. Calendar date, currency pair and absolute prices are intentionally withheld to reduce historical memorization. Current price is normalized to 100. Do not identify the historical episode or use recalled future outcomes. No news or web access is provided. All candles end at or before minute 0. Consider momentum, regime, volatility, support/resistance and the remaining horizon. The statistical baseline is only a comparison. Output ONLY JSON {"p10":number,"p50":number,"p90":number,"reason":"brief Japanese reasoning"} for horizonMinutes ahead. Strictly 0 < p10 < p50 < p90. These are uncertain uncalibrated estimates.\nSnapshot:\n'+JSON.stringify(blindInput(data,c));}
function scoreBlind(c,result){const scale=c.price/100;if(!result||![result.p10,result.p50,result.p90].every(E.finite))throw Error('GPT予測の形式が不正です');return score(c,{p10:result.p10*scale,p50:result.p50*scale,p90:result.p90*scale},'gpt-blind',{reason:String(result.reason||'')});}
function blockCI(rows,key='correct',reps=2000){
 const groups=new Map();for(const r of rows){const g=groups.get(r.day)||[0,0];g[0]+=+r[key];g[1]++;groups.set(r.day,g);}const g=[...groups.values()];if(g.length<2)return null;
 let seed=194739;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},samples=[];
 for(let i=0;i<reps;i++){let wins=0,n=0;for(let j=0;j<g.length;j++){let x=g[Math.floor(rnd()*g.length)];wins+=x[0];n+=x[1];}samples.push(wins/n);}samples.sort((a,b)=>a-b);return [samples[Math.floor(reps*.025)],samples[Math.min(reps-1,Math.floor(reps*.975))]];
}
function summary(rows,attempted=rows.length){
 if(!rows.length)return {n:0,attempted,accuracy:null,ci:null};const avg=k=>E.mean(rows.map(x=>+x[k])),p=avg('correct'),up=E.mean(rows.map(x=>+(x.label==='call'))),notTies=rows.filter(x=>!x.tie),raw=rows.filter(x=>!x.rawTie&&typeof x.rawCorrect==='boolean');
 return {n:rows.length,attempted,days:new Set(rows.map(x=>x.day)).size,correct:rows.filter(x=>x.correct).length,accuracy:p,ci:blockCI(rows),ties:rows.filter(x=>x.tie).length,accuracyWithoutTies:notTies.length?E.mean(notTies.map(x=>+x.correct)):null,rawNoTiesN:raw.length,accuracyRawNoTies:raw.length?E.mean(raw.map(x=>+x.rawCorrect)):null,alwaysCall:up,alwaysPut:1-up,momentum:rows.every(x=>typeof x.momentumCorrect==='boolean')?avg('momentumCorrect'):null,maePips:avg('errorPips'),naiveMAEPips:avg('naiveErrorPips'),rangeCoverage:avg('covered'),brier:avg('brier'),logLoss:avg('logLoss'),breakEvenCost:1000*p,hypotheticalEV:[500,550,600].map(cost=>({cost,ev:1000*p-cost})),note:'外部MIDの判断時点を目標とした方向正解率。楽天の実目標・購入価格・正式判定ではない。'};
}
function run(data){const rows=[],failures=[];for(const c of data.cases)try{rows.push(technicalCase(data,c));}catch(e){failures.push({id:c.id,reason:e.message});}return {source:'technical',pair:data.pair,from:data.from,to:data.to,h:data.h,rows,excluded:data.excluded,failures,summary:summary(rows,data.expected)};}
const api={dates,caseIndex,context,score,technicalCase,evenlySpaced,blindInput,blindPrompt,scoreBlind,blockCI,summary,run};if(typeof module!=='undefined')module.exports=api;else root.Backtest=api;
})(typeof window!=='undefined'?window:globalThis);
