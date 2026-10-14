import {store} from './store.js';
class Telemetry {
 constructor(){this.watchIds={};this.afterFirstFix={};this.firstFixSent={};this.lastSentAt={}}
 startLiveGPS(role=store.getState().activeMode,onFirstFix=null){
  if(onFirstFix)this.afterFirstFix[role]=onFirstFix;
  if(this.watchIds[role]!=null)return;
  if(!window.isSecureContext){store.setLocationStatus(role,false,'Live GPS requires a secure HTTPS page. Open the staging link directly in Safari or Chrome.');return}
  if(!navigator.geolocation){store.setLocationStatus(role,false,'This browser cannot access device GPS. Open the staging link directly in Safari or Chrome, not inside an embedded preview.');return}
  this.firstFixSent[role]=false;
  this.lastSentAt[role]=0;
  store.setLocationStatus(role,false,null);
  store.setGPSRequesting(role,true);
  this.watchIds[role]=navigator.geolocation.watchPosition(async pos=>{
   const c=pos.coords,fix={lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,speed:c.speed==null?null:c.speed*2.23694,heading:c.heading,timestamp:new Date(pos.timestamp).toISOString(),source:'live-gps'};
   if(!Number.isFinite(fix.accuracy)||fix.accuracy>100){store.setGPSRequesting(role,true);store.state.gpsErrors={...store.state.gpsErrors,[role]:`GPS accuracy is ±${Math.round(fix.accuracy)} m. Waiting for a more accurate fix (100 m or better)…`};store.notify();return}
   if(this.firstFixSent[role]&&Date.now()-this.lastSentAt[role]<5000)return;
   const sent=await store.recordGPS(role,fix);
   if(sent){this.lastSentAt[role]=Date.now();if(!this.firstFixSent[role]){this.firstFixSent[role]=true;await store.setLocationStatus(role,true,null);const callback=this.afterFirstFix[role];delete this.afterFirstFix[role];callback?.(fix)}}
  },err=>{if(this.watchIds[role]!=null)navigator.geolocation.clearWatch(this.watchIds[role]);delete this.watchIds[role];delete this.afterFirstFix[role];const message=err.code===1?'Location permission is blocked. In iPhone Settings, enable Location Services for Safari, then reload this page.':err.code===2?'Your phone could not get a GPS fix. Turn on Location Services and Wi-Fi, then try near a window or outdoors.':`Your phone did not return a GPS fix within 60 seconds. The ride request has not been sent. Open this HTTPS page directly in Safari or Chrome and retry.`;store.setLocationStatus(role,false,`${message} (${err.message})`);},{enableHighAccuracy:true,timeout:60000,maximumAge:0});
 }
 stopLiveGPS(role=store.getState().activeMode){if(this.watchIds[role]==null)return;navigator.geolocation.clearWatch(this.watchIds[role]);delete this.watchIds[role];delete this.afterFirstFix[role];delete this.firstFixSent[role];delete this.lastSentAt[role];store.setLocationStatus(role,false,null)}
}
export const telemetry=new Telemetry();
