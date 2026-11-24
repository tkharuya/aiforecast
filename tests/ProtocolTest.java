package jp.haruya.aiforecast;
import org.json.*;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
public final class ProtocolTest {
 static int passed=0;
 static void ok(boolean condition,String name){if(!condition)throw new AssertionError(name);passed++;System.out.println("PASS "+name);}
 public static void main(String[] args)throws Exception{
  HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.setExecutor(Executors.newCachedThreadPool());
  String done="data: {\"type\":\"response.completed\",\"response\":{\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"{\\\"ok\\\":true}\"}]}]}}\n\n";
  String delta="data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\n";
  server.createContext("/",exchange->{String path=exchange.getRequestURI().getPath(),body=done;int status=200;if(path.equals("/truncated"))body=delta;else if(path.equals("/failed"))body=delta+"data: {\"type\":\"response.failed\",\"response\":{\"error\":{\"code\":\"subscription_sharing_usage_limit_exceeded\",\"message\":\"quota\"}}}\n\n";else if(path.equals("/incomplete"))body=delta+"data: {\"type\":\"response.incomplete\"}\n\n";else if(path.equals("/unauthorized")){status=401;body="{\"error\":{\"message\":\"expired\"}}";}
   byte[] bytes=body.getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","text/event-stream");exchange.sendResponseHeaders(status,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();
  String base="http://127.0.0.1:"+server.getAddress().getPort();
  try{
   String text=Net.streamAt(base+"/ok","test",new JSONObject(),new Net.Cancel(),n->{});ok(new JSONObject(text).getBoolean("ok"),"completed SSE returns final output");
   for(String path:new String[]{"truncated","failed","incomplete","unauthorized"}){boolean rejected=false;try{Net.streamAt(base+"/"+path,"test",new JSONObject(),new Net.Cancel(),n->{});}catch(Exception e){rejected=true;}ok(rejected,path+" does not become a completed forecast");}
   Net.Cancel c=new Net.Cancel();c.cancel();boolean cancelled=false;try{Net.streamAt(base+"/ok","test",new JSONObject(),c,n->{});}catch(Exception e){cancelled=true;}ok(cancelled,"cancelled request stops before send");
   long now=java.time.Instant.parse("2026-11-15T12:00:00Z").toEpochMilli();String sample="BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Consumer Price Index\r\nDTSTART;TZID=US-Eastern:20261118T083000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:All day, no precise time\r\nDTSTART;VALUE=DATE:20261118\r\nEND:VEVENT\r\nEND:VCALENDAR";
   JSONArray ev=EventFeed.parse(sample,now);ok(ev.length()==1,"calendar excludes unknown all-day release times");ok(ev.getJSONObject(0).getLong("time")==java.time.Instant.parse("2026-11-18T13:30:00Z").toEpochMilli(),"Eastern standard time converted correctly");
   String summer=sample.replace("20261118","20260718");JSONArray sev=EventFeed.parse(summer,java.time.Instant.parse("2026-07-15T12:00:00Z").toEpochMilli());ok(sev.getJSONObject(0).getLong("time")==java.time.Instant.parse("2026-07-18T12:30:00Z").toEpochMilli(),"Eastern daylight time converted correctly");
   if(args.length>0){JSONArray live=EventFeed.parse(Files.readString(Path.of(args[0])),now);ok(live.length()>0,"real BLS calendar parsed");for(int i=0;i<live.length();i++)ok(live.getJSONObject(i).getLong("time")>now-86400000L,"calendar time in requested window");}
   System.out.println("Protocol tests: "+passed+" passed");
  }finally{server.stop(0);((java.util.concurrent.ExecutorService)server.getExecutor()).shutdownNow();}
 }
}
