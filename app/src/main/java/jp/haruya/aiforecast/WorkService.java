package jp.haruya.aiforecast;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
public final class WorkService extends Service {
 private PowerManager.WakeLock wake;
 private final Handler handler=new Handler(Looper.getMainLooper());
 @Override public void onCreate(){super.onCreate();getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("analysis","AI分析・ChatGPT接続",NotificationManager.IMPORTANCE_LOW));}
 @Override public int onStartCommand(Intent intent,int flags,int startId){
  AppCore core=AppCore.get(this);String action=intent==null?"":intent.getAction();if("stop".equals(action)){core.cancelJob();if(core.auth!=null)core.auth.cancelLogin();stopSelf();return START_NOT_STICKY;}
  PendingIntent content=PendingIntent.getActivity(this,1,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  PendingIntent stop=PendingIntent.getService(this,2,new Intent(this,WorkService.class).setAction("stop"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification n=new Notification.Builder(this,"analysis").setSmallIcon(R.drawable.ic_stat).setContentTitle("藍予測").setContentText("generate".equals(action)?"AIが為替・経済イベントを分析しています":"ChatGPTへの接続を待っています").setContentIntent(content).setOngoing(true).addAction(new Notification.Action.Builder(null,"停止",stop).build()).build();
  if(Build.VERSION.SDK_INT>=29)startForeground(11,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);else startForeground(11,n);
  if(wake==null){wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"AiForecast:Analysis");wake.acquire(25*60*1000L);}
  if("generate".equals(action))core.io.execute(()->{core.runJob();handler.post(()->{if(core.auth==null||!core.auth.signingIn)stopSelf();});});
  if("auth".equals(action))handler.postDelayed(new Runnable(){public void run(){if(core.auth!=null&&core.auth.signingIn)handler.postDelayed(this,1500);else if(!core.working)stopSelf();}},2000);
  return START_NOT_STICKY;
 }
 @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);if(wake!=null&&wake.isHeld())wake.release();super.onDestroy();}
 @Override public void onTimeout(int startId,int fgsType){AppCore.get(this).cancelJob();if(AppCore.get(this).auth!=null)AppCore.get(this).auth.cancelLogin();stopSelf();}
 @Override public IBinder onBind(Intent i){return null;}
}
