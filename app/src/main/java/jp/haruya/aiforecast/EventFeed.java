package jp.haruya.aiforecast;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.json.*;
final class EventFeed {
 static final String URL="https://www.bls.gov/schedule/news_release/bls.ics";
 static JSONArray fetch()throws Exception{return parse(Net.request(URL,"GET",null,null,null),System.currentTimeMillis());}
 static JSONArray parse(String ics,long now)throws Exception{
  JSONArray result=new JSONArray();Map<String,String> fields=null;String[] lines=ics.replace("\r\n","\n").replaceAll("\n[ \t]","").split("\n");
  for(String line:lines){if(line.equals("BEGIN:VEVENT")){fields=new HashMap<>();continue;}if(fields==null)continue;
   if(line.equals("END:VEVENT")){
    try{String title=fields.get("SUMMARY"),raw=fields.get("DTSTART"),params=fields.get("DTSTART_PARAMS");if(title==null||raw==null){fields=null;continue;}
     long time;if(raw.endsWith("Z"))time=LocalDateTime.parse(raw.substring(0,raw.length()-1),DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss")).toInstant(ZoneOffset.UTC).toEpochMilli();
     else{String zone="America/New_York";if(params!=null&&params.contains("TZID=")){String z=params.substring(params.indexOf("TZID=")+5).split(";")[0].replace("\"","");if(z.equals("US-Eastern"))z="America/New_York";zone=z;}time=LocalDateTime.parse(raw,DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss")).atZone(ZoneId.of(zone)).toInstant().toEpochMilli();}
     if(time<now-86400000L||time>now+45L*86400000){fields=null;continue;}
     String lower=title.toLowerCase(Locale.ROOT),jp=title;boolean high=false;
     if(lower.contains("consumer price index")){jp="米国 消費者物価指数（CPI）";high=true;}else if(lower.contains("employment situation")){jp="米国 雇用統計（非農業部門雇用者数）";high=true;}else if(lower.contains("producer price index")){jp="米国 生産者物価指数（PPI）";high=true;}else if(lower.contains("job openings"))jp="米国 JOLTS求人件数";else if(lower.contains("employment cost"))jp="米国 雇用コスト指数";
     result.put(new JSONObject().put("id","bls-"+Integer.toHexString((title+time).hashCode())).put("title",jp).put("originalTitle",title).put("time",time).put("currencies",new JSONArray().put("USD")).put("impact",high?"high":"medium").put("source","bls").put("source_url","https://www.bls.gov/schedule/news_release/").put("fetchedAt",now).put("forecast","").put("previous","").put("summary","BLS公式日程。発表値と市場予想は未取得。").put("timing","公式予定"));
    }catch(Exception ignored){}fields=null;continue;
   }
   int colon=line.indexOf(':');if(colon<0)continue;String key=line.substring(0,colon),value=line.substring(colon+1).replace("\\n"," ").replace("\\,",",").replace("\\;",";");String base=key.split(";")[0];fields.put(base,value);if(key.contains(";"))fields.put(base+"_PARAMS",key.substring(key.indexOf(';')+1));
  }return result;
 }
}
