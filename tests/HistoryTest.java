package jp.haruya.aiforecast;
import java.io.*;
import java.nio.file.*;
import org.json.*;
public final class HistoryTest {
 static int checks=0;
 static void check(boolean b,String s){if(!b)throw new AssertionError(s);checks++;System.out.println("PASS "+s);}
 public static void main(String[] args)throws Exception{
  File base=Files.createTempDirectory("aiforecast-history-").toFile(),cache=new File(base,"market-cache");cache.mkdirs();int expected=0;
  for(String day:new String[]{"20261001","20261002","20261005"})for(String side:new String[]{"BID","ASK"}){
   String name="USD_JPY-"+day+"-"+side+".json";JSONObject raw=new JSONObject(Files.readString(Path.of(args[0],name)));JSONArray a=raw.getJSONArray("data");Files.writeString(new File(cache,name).toPath(),a.toString());if(side.equals("BID"))expected+=a.length();
  }
  MarketData market=new MarketData(base);int[] progress={0,0};JSONObject r=market.history("USD_JPY","2026-10-05","2026-10-05",new Net.Cancel(),(done,total,message)->{progress[0]=done;progress[1]=total;});
  JSONArray c=r.getJSONArray("candles");check(c.length()==expected,"native historical merge preserves complete BID/ASK observations");check(progress[0]==3&&progress[1]==3,"progress counts two warmup days and selected day");check(r.getJSONArray("missing").length()==0,"cache-backed historical load has no missing dates");
  JSONObject b=new JSONObject(Files.readString(Path.of(args[0],"USD_JPY-20261001-BID.json"))).getJSONArray("data").getJSONObject(0),a=new JSONObject(Files.readString(Path.of(args[0],"USD_JPY-20261001-ASK.json"))).getJSONArray("data").getJSONObject(0);
  check(Math.abs(c.getJSONObject(0).getDouble("c")-(a.getDouble("close")+b.getDouble("close"))/2)<1e-12,"MID is arithmetic BID/ASK mean");
  check(c.getJSONObject(0).getLong("t")==Long.parseLong(b.getString("openTime")),"historical timestamps preserved exactly");
  Net.Cancel cancel=new Net.Cancel();cancel.cancel();try{market.history("USD_JPY","2026-10-05","2026-10-05",cancel,(x,y,z)->{});throw new AssertionError("cancel accepted");}catch(IOException e){checks++;System.out.println("PASS cancellation stops historical loading");}
  for(String[] range:new String[][]{{"2023-01-01","2023-01-02"},{"2999-01-01","2999-01-02"},{"2026-10-05","2026-10-01"}}){try{market.history("USD_JPY",range[0],range[1],new Net.Cancel(),(x,y,z)->{});throw new AssertionError("bad range accepted");}catch(IOException e){checks++;}}
  check(!r.toString().contains("access_token"),"public historical data contains no credentials");
  for(File f:cache.listFiles())f.delete();cache.delete();base.delete();System.out.println("Native history tests: "+checks+" passed");
 }
}
