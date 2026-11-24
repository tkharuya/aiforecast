package jp.haruya.aiforecast;
import android.app.*;
import android.content.*;
import org.json.*;
public final class ReminderReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context c,Intent i){try{NotificationManager nm=c.getSystemService(NotificationManager.class);nm.createNotificationChannel(new NotificationChannel("events","イベントの事前通知",NotificationManager.IMPORTANCE_DEFAULT));PendingIntent open=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);nm.notify(i.getIntExtra("id",200),new Notification.Builder(c,"events").setSmallIcon(R.drawable.ic_stat).setContentTitle("藍予測 · 予定時刻が近づいています").setContentText(i.getStringExtra("title")).setContentIntent(open).setAutoCancel(true).build());}catch(SecurityException ignored){}}
 static int schedule(Context c,JSONArray events,boolean enabled)throws Exception{
  AlarmManager am=c.getSystemService(AlarmManager.class);android.content.SharedPreferences p=c.getSharedPreferences("reminders",0);JSONArray old=new JSONArray(p.getString("ids","[]"));for(int j=0;j<old.length();j++){PendingIntent pi=PendingIntent.getBroadcast(c,old.getInt(j),new Intent(c,ReminderReceiver.class),PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);if(pi!=null){am.cancel(pi);pi.cancel();}}
  JSONArray ids=new JSONArray();if(enabled)for(int j=0;j<events.length();j++){JSONObject e=events.getJSONObject(j);long at=e.optLong("time")-10*60000L;if(at<System.currentTimeMillis()||!e.optString("impact").equals("high"))continue;int id=e.optString("id").hashCode();Intent i=new Intent(c,ReminderReceiver.class).putExtra("title",e.optString("title")+"（予定の約10分前）").putExtra("id",id);PendingIntent pi=PendingIntent.getBroadcast(c,id,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi);ids.put(id);}
  p.edit().putString("ids",ids.toString()).apply();return ids.length();
 }
}
