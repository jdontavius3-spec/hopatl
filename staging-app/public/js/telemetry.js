import {store} from './store.js';
class Telemetry {
 constructor(){this.watchIds={};this.afterFirstFix={};this.firstFixSent={};this.lastSentAt={}}
 startLiveGPS(role=store.getState().activeMode,onFirstFix=null){
  if(onFirstFix)this.afterFirstFix[role]=onFirstFix;
  if(this.watchIds[role]!=null)return;
  if(!navigator.geolocation){store.setLocationStatus(role,false,'This browser has no geolocation support.');return}
  this.firstFixSent[role]=false;
  this.lastSentAt[role]=0;
  store.setLocationStatus(role,false,null);
  this.watchIds[role]=navigator.geolocation.watchPosition(async pos=>{
   const c=pos.coords,fix={lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,speed:c.speed==null?null:c.speed*2.23694,heading:c.heading,timestamp:new Date(pos.timestamp).toISOString(),source:'live-gps'};
   if(this.firstFixSent[role]&&Date.now()-this.lastSentAt[role]<5000)return;
   const sent=await store.recordGPS(role,fix);
   if(sent){this.lastSentAt[role]=Date.now();if(!this.firstFixSent[role]){this.firstFixSent[role]=true;await store.setLocationStatus(role,true,null);const callback=this.afterFirstFix[role];delete this.afterFirstFix[role];callback?.(fix)}}
  },err=>{if(this.watchIds[role]!=null)navigator.geolocation.clearWatch(this.watchIds[role]);delete this.watchIds[role];delete this.afterFirstFix[role];store.setLocationStatus(role,false,`${err.message} Allow location access and retry.`)},{enableHighAccuracy:true,timeout:20000,maximumAge:0});
 }
 stopLiveGPS(role=store.getState().activeMode){if(this.watchIds[role]==null)return;navigator.geolocation.clearWatch(this.watchIds[role]);delete this.watchIds[role];delete this.afterFirstFix[role];delete this.firstFixSent[role];delete this.lastSentAt[role];store.setLocationStatus(role,false,null)}
}
export const telemetry=new Telemetry();
