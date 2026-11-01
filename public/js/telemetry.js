import {store} from './store.js';
const MAX_ACCURACY=500;
class Telemetry {
 constructor(){
  this.watchIds={};this.afterFirstFix={};this.firstFixSent={};this.lastSentAt={};this.wakeLock=null;
  if(typeof document!=='undefined'){
   document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
     const s=store.getState(),role=s.activeMode;
     if(role==='pilot'&&(s.driverAvailable||this.watchIds.pilot!=null))this.requestWakeLock();
     if(this.watchIds[role]!=null)this.refreshNow(role);
    }
   });
  }
 }
 async requestWakeLock(){
  try{if(typeof navigator!=='undefined'&&'wakeLock'in navigator&&!this.wakeLock){this.wakeLock=await navigator.wakeLock.request('screen');this.wakeLock.addEventListener?.('release',()=>{this.wakeLock=null})}}catch{}
 }
 async releaseWakeLock(){
  try{if(this.wakeLock){await this.wakeLock.release();this.wakeLock=null}}catch{this.wakeLock=null}
 }
 buildFix(pos){
  const c=pos.coords;
  return{lat:c.latitude,lng:c.longitude,accuracy:Math.min(MAX_ACCURACY,Math.max(1,Number(c.accuracy)||25)),rawAccuracy:c.accuracy,speed:c.speed==null?null:c.speed*2.23694,heading:c.heading,timestamp:new Date(pos.timestamp||Date.now()).toISOString(),source:'live-gps'};
 }
 refreshNow(role=store.getState().activeMode){
  return new Promise(resolve=>{
   if(typeof navigator==='undefined'||!navigator.geolocation){resolve(null);return}
   navigator.geolocation.getCurrentPosition(async pos=>{
    if(!Number.isFinite(pos?.coords?.accuracy)||pos.coords.accuracy>MAX_ACCURACY){resolve(null);return}
    const fix=this.buildFix(pos);
    this.lastSentAt[role]=Date.now();
    await store.recordGPS(role,fix);
    if(!this.firstFixSent[role]){this.firstFixSent[role]=true;await store.setLocationStatus(role,true,null);const cb=this.afterFirstFix[role];delete this.afterFirstFix[role];cb?.(fix)}
    resolve(fix);
   },()=>resolve(null),{enableHighAccuracy:true,timeout:8000,maximumAge:15000});
  });
 }
 startLiveGPS(role=store.getState().activeMode,onFirstFix=null){
  if(onFirstFix)this.afterFirstFix[role]=onFirstFix;
  if(role==='pilot')this.requestWakeLock();
  if(this.watchIds[role]!=null){this.refreshNow(role);return}
  if(!window.isSecureContext){store.setLocationStatus(role,false,'Live GPS requires a secure HTTPS page. Open this site directly in Safari or Chrome.');return}
  if(!navigator.geolocation){store.setLocationStatus(role,false,'This browser cannot access device GPS. Open this site directly in Safari or Chrome, not inside an embedded preview.');return}
  this.firstFixSent[role]=false;
  this.lastSentAt[role]=0;
  store.setLocationStatus(role,false,null);
  store.setGPSRequesting(role,true);
  this.watchIds[role]=navigator.geolocation.watchPosition(async pos=>{
   const c=pos.coords;
   if(!Number.isFinite(c.accuracy)||c.accuracy>MAX_ACCURACY){store.setGPSRequesting(role,true);store.state.gpsErrors={...store.state.gpsErrors,[role]:`GPS accuracy is ±${Math.round(c.accuracy)} m. Move near a window or use address search below…`};store.notify();return}
   const fix=this.buildFix(pos);
   if(this.firstFixSent[role]&&Date.now()-this.lastSentAt[role]<4000)return;
   const sent=await store.recordGPS(role,fix);
   if(sent){this.lastSentAt[role]=Date.now();if(!this.firstFixSent[role]){this.firstFixSent[role]=true;await store.setLocationStatus(role,true,null);const callback=this.afterFirstFix[role];delete this.afterFirstFix[role];callback?.(fix)}}
  },err=>{if(this.watchIds[role]!=null)navigator.geolocation.clearWatch(this.watchIds[role]);delete this.watchIds[role];delete this.afterFirstFix[role];const message=err.code===1?'Location permission is blocked. Enable Location Services for Safari/Chrome, or search your pickup address below.':err.code===2?'Your phone could not get a satellite fix indoors. Move near a window or search your pickup address below.':`Your phone did not return a GPS fix within 60 seconds. Retry GPS or search your pickup address below.`;store.setLocationStatus(role,false,`${message} (${err.message})`);},{enableHighAccuracy:true,timeout:60000,maximumAge:10000});
 }
 stopLiveGPS(role=store.getState().activeMode){if(role==='pilot'&&!store.getState().driverAvailable)this.releaseWakeLock();if(this.watchIds[role]==null)return;navigator.geolocation.clearWatch(this.watchIds[role]);delete this.watchIds[role];delete this.afterFirstFix[role];delete this.firstFixSent[role];delete this.lastSentAt[role];store.setLocationStatus(role,false,null)}
}
export const telemetry=new Telemetry();

