package jp.haruya.aiforecast;
import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

public final class MainActivity extends Activity {
 private WebView web;private AppCore core;private String pickerId;private byte[] exportBytes;private int pickerType;
 private static final String ORIGIN="https://aiforecast.local";
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);getWindow().setStatusBarColor(Color.rgb(9,21,36));getWindow().setNavigationBarColor(Color.rgb(12,27,45));getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
  core=AppCore.get(this);web=new WebView(this);setContentView(web);web.setBackgroundColor(Color.rgb(9,21,36));
  web.setOnApplyWindowInsetsListener((v,i)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets in=i.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(in.left,in.top,in.right,in.bottom);}return i;});
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);
  web.addJavascriptInterface(new Bridge(),"Native");
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){try{Uri u=r.getUrl();if(!"https".equals(u.getScheme())||!"aiforecast.local".equals(u.getHost())||u.getPath()==null||!u.getPath().matches("/[a-zA-Z0-9_.-]+"))return blocked();String name=u.getPath().substring(1),mime=name.endsWith(".js")?"text/javascript":name.endsWith(".css")?"text/css":name.endsWith(".html")?"text/html":"text/plain";Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-cache");headers.put("X-Content-Type-Options","nosniff");headers.put("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'");return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,getAssets().open(name));}catch(Exception e){return blocked();}}
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !r.getUrl().toString().startsWith(ORIGIN+"/");}
   @Override public void onReceivedSslError(WebView v,SslErrorHandler h,android.net.http.SslError e){h.cancel();}
   @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail detail){new AlertDialog.Builder(MainActivity.this).setMessage("画面を開き直します。保存した予測とAI分析処理は保持されています。").setPositiveButton("開く",(d,w)->recreate()).setCancelable(false).show();return true;}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult r){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("実行",(d,w)->r.confirm()).setNegativeButton("キャンセル",(d,w)->r.cancel()).setOnCancelListener(d->r.cancel()).show();return true;}
   @Override public boolean onJsAlert(WebView v,String url,String message,JsResult r){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("OK",(d,w)->r.confirm()).setOnCancelListener(d->r.cancel()).show();return true;}
  });web.loadUrl(ORIGIN+"/index.html");
 }
 static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 private void result(String id,Object out,String error){runOnUiThread(()->{if(web==null||isFinishing()||isDestroyed())return;String json=out==null?"null":out instanceof JSONObject||out instanceof JSONArray?out.toString():JSONObject.quote(out.toString());web.evaluateJavascript("window.__nativeResult&&window.__nativeResult("+JSONObject.quote(id)+","+json+","+(error==null?"null":JSONObject.quote(error))+")",null);});}
 private void browser(String url){runOnUiThread(()->{try{Uri u=Uri.parse(url);if(!"https".equals(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null)throw new IOException("HTTPSのリンクのみ開けます");startActivity(new Intent(Intent.ACTION_VIEW,u).addCategory(Intent.CATEGORY_BROWSABLE));}catch(Exception e){if(core.auth!=null&&core.auth.signingIn)core.auth.cancelLogin();new AlertDialog.Builder(this).setMessage("ブラウザーを開けませんでした。").setPositiveButton("OK",null).show();}});}
 private void permissions(){if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},9);}
 private void work(String action){runOnUiThread(()->{try{permissions();startForegroundService(new Intent(this,WorkService.class).setAction(action));}catch(Exception e){core.failStart(AppCore.friendly(e));if(core.auth!=null)core.auth.cancelLogin();}});}
 final class Bridge {
  @JavascriptInterface public void call(String id,String action,String data){core.io.execute(()->{try{JSONObject d=new JSONObject(data);Object out=new JSONObject();switch(action){
   case "loadState":out=core.loadState();break;
   case "saveState":core.saveState(d);break;
   case "getStatus":out=core.status(d.optString("seenJob"));break;
   case "market":out=core.market.fetch(d.getString("pair"));break;
   case "calendar":out=new JSONObject().put("events",EventFeed.fetch()).put("fetchedAt",System.currentTimeMillis());break;
   case "models":if(core.auth==null)throw new IOException(core.initError);out=core.auth.models();break;
   case "startAuth":if(core.working)throw new IOException("分析完了後に接続してください。");if(core.auth==null)throw new IOException(core.initError);if(core.auth.signingIn)throw new IOException("ログイン中です");core.io.execute(()->{try{core.auth.login(d.optBoolean("newAccount"),url->{work("auth");browser(url);});}catch(Exception ignored){}});break;
   case "cancelAuth":if(core.auth!=null)core.auth.cancelLogin();break;
   case "switchAccount":if(core.working)throw new IOException("分析完了後に切り替えてください");out=core.auth.select(d.getString("id"));break;
   case "logout":if(core.working)throw new IOException("分析を停止してからログアウトしてください");out=new JSONObject().put("message",core.auth.logout());break;
   case "startJob":out=core.queue(d);work("generate");break;
   case "cancelJob":core.cancelJob();break;
   case "openURL":browser(d.getString("url"));break;
   case "reminders":runOnUiThread(()->{try{if(d.optBoolean("enabled"))permissions();int count=ReminderReceiver.schedule(MainActivity.this,d.getJSONArray("events"),d.optBoolean("enabled"));boolean granted=Build.VERSION.SDK_INT<33||checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;result(id,new JSONObject().put("count",count).put("granted",granted),null);}catch(Exception e){result(id,null,AppCore.friendly(e));}});return;
   case "importFile":runOnUiThread(()->pick(id,21,d));return;
   case "exportFile":byte[] bytes=d.getString("text").getBytes(StandardCharsets.UTF_8);runOnUiThread(()->{if(pickerId!=null){result(id,null,"ファイル操作を完了してください");return;}exportBytes=bytes;pick(id,22,d);});return;
   default:throw new IOException("未対応の操作です");
  }result(id,out,null);}catch(Exception e){result(id,null,AppCore.friendly(e));}});}
 }
 private void pick(String id,int type,JSONObject d){if(pickerId!=null){result(id,null,"ファイル操作を完了してください");return;}try{Intent i=new Intent(type==22?Intent.ACTION_CREATE_DOCUMENT:Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType(type==22?d.optString("mime","application/json"):"*/*");if(type==22)i.putExtra(Intent.EXTRA_TITLE,d.optString("name","aiforecast.json").replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_"));pickerId=id;pickerType=type;startActivityForResult(i,type);}catch(Exception e){pickerId=null;exportBytes=null;result(id,null,AppCore.friendly(e));}}
 @Override protected void onActivityResult(int request,int code,Intent data){super.onActivityResult(request,code,data);if(pickerId==null||request!=pickerType)return;String id=pickerId;pickerId=null;byte[] bytes=exportBytes;exportBytes=null;if(code!=RESULT_OK||data==null){result(id,new JSONObject(),null);return;}core.io.execute(()->{try{Uri uri=data.getData();if(uri==null)throw new IOException("ファイルが選択されていません");if(request==22){try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null||bytes==null)throw new IOException("保存先を開けませんでした");out.write(bytes);}result(id,new JSONObject().put("saved",true),null);}else result(id,new JSONObject().put("text",Net.read(getContentResolver().openInputStream(uri),32*1024*1024)),null);}catch(Exception e){result(id,null,AppCore.friendly(e));}});}
 @Override protected void onResume(){super.onResume();if(web!=null){web.onResume();web.evaluateJavascript("window.onNativeResume&&window.onNativeResume()",null);}}
 @Override protected void onPause(){if(web!=null)web.onPause();super.onPause();}
 @Override public void onBackPressed(){if(web!=null)web.evaluateJavascript("window.onBack&&window.onBack()",v->{if(!"true".equals(v))MainActivity.super.onBackPressed();});else super.onBackPressed();}
 @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("Native");web.destroy();web=null;}super.onDestroy();}
}
