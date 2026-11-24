package jp.haruya.aiforecast;
import java.io.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.json.*;

final class MarketData {
 static final String BASE="https://forex-api.coin.z.com/public/v1/";
 private final File cache;
 interface Progress {void update(int done,int total,String message);}
 MarketData(File dir){cache=new File(dir,"market-cache");cache.mkdirs();}
 static void pair(String symbol)throws IOException{if(!Arrays.asList("USD_JPY","EUR_JPY","GBP_JPY","AUD_JPY","EUR_USD").contains(symbol))throw new IOException("対応していない通貨ペアです");}
 private static JSONObject get(String url)throws Exception{JSONObject r;try{r=Net.get(url,null);}catch(Net.HttpError e){throw new IOException("GMO公開FXデータの通信エラー（HTTP "+e.status+"）");}if(r.optInt("status",-1)!=0)throw new IOException("GMO公開データを取得できませんでした。しばらくして更新してください。");return r;}
 JSONObject fetch(String symbol)throws Exception{
  pair(symbol);long now=System.currentTimeMillis();JSONArray all=get(BASE+"ticker").getJSONArray("data");JSONObject ticker=null;
  for(int i=0;i<all.length();i++)if(all.getJSONObject(i).optString("symbol").equals(symbol))ticker=all.getJSONObject(i);
  if(ticker==null)throw new IOException("この通貨ペアの配信レートがありません");
  TreeMap<Long,JSONObject> merged=new TreeMap<>();LocalDate day=Instant.ofEpochMilli(now).atZone(ZoneId.of("Asia/Tokyo")).minusHours(6).toLocalDate();String warning="";
  for(int back=0;back<7&&merged.size()<1000;back++){
   String date=day.minusDays(back).format(DateTimeFormatter.BASIC_ISO_DATE);
   try{
    JSONArray bid=klines(symbol,date,"BID",back>0),ask=klines(symbol,date,"ASK",back>0);Map<String,JSONObject> asks=new HashMap<>();for(int i=0;i<ask.length();i++)asks.put(ask.getJSONObject(i).getString("openTime"),ask.getJSONObject(i));
    for(int i=0;i<bid.length();i++){JSONObject b=bid.getJSONObject(i),a=asks.get(b.getString("openTime"));if(a==null)continue;long t=Long.parseLong(b.getString("openTime"));if(t+60000>now)continue;JSONObject c=new JSONObject().put("t",t);String[] in={"open","high","low","close"},out={"o","h","l","c"};for(int k=0;k<in.length;k++)c.put(out[k],(b.getDouble(in[k])+a.getDouble(in[k]))/2);merged.put(t,c);}
   }catch(Exception e){if(back==0)warning="当日足の取得に失敗しました。取得時刻を確認してください。";else warning="一部の過去データを取得できませんでした。";}
  }
  if(merged.size()<60)throw new IOException("確定足を十分に取得できませんでした。通信を確認し、再更新してください。");
  JSONArray candles=new JSONArray();for(JSONObject c:merged.values())candles.put(c);
  return new JSONObject().put("pair",symbol).put("ticker",ticker).put("quotes",all).put("candles",candles).put("fetchedAt",now).put("source","GMOコイン Public FX / BID・ASK平均（MID近似）").put("warning",warning);
 }
 JSONObject history(String symbol,String from,String to,Net.Cancel cancel,Progress progress)throws Exception{
  pair(symbol);LocalDate first=LocalDate.parse(from),last=LocalDate.parse(to),earliest=LocalDate.of(2023,10,28),today=LocalDate.now(ZoneId.of("Asia/Tokyo"));
  if(first.isBefore(earliest)||last.isBefore(first)||!last.isBefore(today))throw new IOException("2023年10月28日以降、昨日以前の期間を指定してください。");
  List<LocalDate> days=new ArrayList<>();for(LocalDate d=first.minusDays(4);!d.isAfter(last);d=d.plusDays(1))if(!d.isBefore(earliest)&&d.getDayOfWeek()!=DayOfWeek.SATURDAY&&d.getDayOfWeek()!=DayOfWeek.SUNDAY)days.add(d);
  TreeMap<Long,JSONObject> merged=new TreeMap<>();JSONArray missing=new JSONArray();int done=0;
  for(LocalDate day:days){cancel.check();String date=day.format(DateTimeFormatter.BASIC_ISO_DATE);progress.update(done,days.size(),day+" の確定足を取得中");
   try{JSONArray bid=klines(symbol,date,"BID",true,cancel),ask=klines(symbol,date,"ASK",true,cancel);Map<String,JSONObject> asks=new HashMap<>();for(int i=0;i<ask.length();i++)asks.put(ask.getJSONObject(i).getString("openTime"),ask.getJSONObject(i));
    if(bid.length()==0||ask.length()==0)missing.put(new JSONObject().put("day",day.toString()).put("reason","足がありません"));
    for(int i=0;i<bid.length();i++){JSONObject b=bid.getJSONObject(i),a=asks.get(b.getString("openTime"));if(a==null)continue;long t=Long.parseLong(b.getString("openTime"));if(t+60000>System.currentTimeMillis())continue;JSONObject c=new JSONObject().put("t",t);String[] in={"open","high","low","close"},out={"o","h","l","c"};for(int k=0;k<in.length;k++)c.put(out[k],(b.getDouble(in[k])+a.getDouble(in[k]))/2);merged.put(t,c);}
   }catch(Exception e){cancel.check();missing.put(new JSONObject().put("day",day.toString()).put("reason",e.getMessage()));}
   progress.update(++done,days.size(),done+" / "+days.size()+" 日取得");
  }
  cancel.check();if(merged.size()<120)throw new IOException("検証用データが不足しています。期間か通信状態を確認してください。");JSONArray candles=new JSONArray();for(JSONObject c:merged.values())candles.put(c);
  return new JSONObject().put("pair",symbol).put("from",from).put("to",to).put("candles",candles).put("missing",missing).put("source","GMO公開FX / BID・ASK足の平均").put("fetchedAt",System.currentTimeMillis());
 }
 private JSONArray klines(String pair,String date,String type,boolean closed)throws Exception{
  return klines(pair,date,type,closed,null);
 }
 private synchronized JSONArray klines(String pair,String date,String type,boolean closed,Net.Cancel cancel)throws Exception{
  File f=new File(cache,pair+"-"+date+"-"+type+".json");long dayEnd=LocalDate.parse(date,DateTimeFormatter.BASIC_ISO_DATE).plusDays(1).atTime(6,0).atZone(ZoneId.of("Asia/Tokyo")).toInstant().toEpochMilli();
  if(f.exists()&&((closed&&f.lastModified()>=dayEnd)||System.currentTimeMillis()-f.lastModified()<45000))try{return new JSONArray(Net.read(new FileInputStream(f),4*1024*1024));}catch(Exception ignored){}
  String url=BASE+"klines?symbol="+pair+"&priceType="+type+"&interval=1min&date="+date;JSONObject response;
  if(cancel==null)response=get(url);else{java.net.HttpURLConnection conn=Net.connection(url,"GET",null,null,null,cancel,45000);try{int status=conn.getResponseCode();if(status!=200)throw new IOException("過去データの通信エラー HTTP "+status);response=new JSONObject(Net.read(conn.getInputStream(),4*1024*1024));if(response.optInt("status",-1)!=0)throw new IOException("過去データの応答が不正です");cancel.check();}finally{conn.disconnect();cancel.connection=null;}}
  JSONArray a=response.getJSONArray("data");
  try(FileOutputStream out=new FileOutputStream(f)){out.write(a.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
  File[] files=cache.listFiles();if(files!=null)for(File old:files)if(System.currentTimeMillis()-old.lastModified()>14L*86400000)old.delete();return a;
 }
}
