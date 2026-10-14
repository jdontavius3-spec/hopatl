import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0;background:#160b20}.leaflet-container{background:#160b20}.leaflet-control-attribution{font-size:9px!important}</style><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script></head><body><div id="map"></div><script>
const map=L.map('map',{zoomControl:false,attributionControl:true}).setView([33.749,-84.388],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);const markers={};
function point(key,coords,color,label){if(!coords||!Number.isFinite(coords.lat)||!Number.isFinite(coords.lng))return null;const latlng=[coords.lat,coords.lng];if(!markers[key])markers[key]=L.circleMarker(latlng,{radius:key==='pilot'||key==='rider'?8:5,color,fillColor:color,fillOpacity:.95,weight:2}).addTo(map);else markers[key].setLatLng(latlng);markers[key].bindTooltip(label);return latlng}
function update(d){let points=[];let origin=point('origin',d.origin,'#ffbd42','Pickup');if(origin)points.push(origin);(d.hops||[]).forEach((hop,i)=>{let p=point('hop'+i,hop,'#bc4cff','Hop '+(i+1));if(p)points.push(p)});let rider=point('rider',d.rider,'#ff2e9a','Rider live GPS');if(rider)points.push(rider);let pilot=point('pilot',d.pilot,'#20d4a0','Pilot live GPS');if(pilot)points.push(pilot);if(points.length>1)map.fitBounds(points,{padding:[26,26],maxZoom:14});else if(points.length===1)map.setView(points[0],15)}
window.updateRideMap=update;window.addEventListener('message',event=>{try{update(JSON.parse(event.data))}catch(_){}});window.updateRideMap(${JSON.stringify({})});
</script></body></html>`;

export default function LiveMap({ trip, shared }) {
  const ref = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const positions = JSON.stringify({
    origin: trip?.pickupCoordinates || null,
    hops: (trip?.routeQuote?.hops || []).map(hop => hop.destination).filter(Boolean),
    rider: shared?.liveLocations?.rider || null,
    pilot: shared?.liveLocations?.pilot || null,
  }).replace(/</g, '\\u003c');
  useEffect(() => {
    if (!loaded || !ref.current) return;
    ref.current.injectJavaScript(`window.updateRideMap && window.updateRideMap(${positions}); true;`);
  }, [loaded, positions]);
  return (
    <View style={styles.wrap}>
      <WebView ref={ref} source={{ html: page }} onLoadEnd={() => setLoaded(true)} originWhitelist={['*']} javaScriptEnabled domStorageEnabled style={styles.web} />
      <Text style={styles.legend}>● Rider GPS　 ● Pilot GPS　 ◉ Stops · OpenStreetMap</Text>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { height: 250, overflow: 'hidden', borderRadius: 13, borderWidth: 1, borderColor: '#48204c', marginTop: 9 }, web: { flex: 1, backgroundColor: '#160b20' }, legend: { backgroundColor: '#160b20', color: '#c4b5d3', fontSize: 10, textAlign: 'center', paddingVertical: 7 } });
