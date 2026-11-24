package jp.haruya.aiforecast;
import org.json.*;
import java.io.File;
public final class MarketSmoke {
 public static void main(String[] args)throws Exception {
  MarketData m=new MarketData(new File(args[0]));JSONObject r=m.fetch("USD_JPY");
  if(!r.getString("pair").equals("USD_JPY")||r.getJSONArray("candles").length()<60)throw new AssertionError("market parsing failed");
  JSONObject q=r.getJSONObject("ticker");System.out.println("Native market: "+r.getString("pair")+" status="+q.getString("status")+" closedCandles="+r.getJSONArray("candles").length());
  JSONArray events=EventFeed.fetch();if(events.length()==0)throw new AssertionError("BLS calendar empty");System.out.println("Native BLS calendar events: "+events.length());
 }
}
