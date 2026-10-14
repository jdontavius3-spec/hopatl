import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
const port=4242;
const origin=`http://127.0.0.1:${port}`;
test('trip token pairs rider and pilot GPS through connection and completion',async t=>{
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(origin)).ok){ready=true;break}}catch{}await sleep(100)}assert.ok(ready,'local server starts');
 const post=(path,payload={},token=null)=>{const headers={Origin:origin,'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;return fetch(`${origin}${path}`,{method:'POST',headers,body:JSON.stringify(payload)})};
 const get=(path,token)=>fetch(`${origin}${path}`,{headers:{Authorization:`Bearer ${token}`}});
 const initialFix={lat:37.78,lng:-122.41,accuracy:5,source:'live-gps'};
 assert.equal((await post('/api/trip/create',{})).status,422,'trip creation requires the first GPS fix');
 const created=await (await post('/api/trip/create',{initialFix})).json();assert.ok(created.tripId);assert.ok(created.riderToken);assert.match(created.pilotJoinCode,/^[A-F0-9]{10}$/);assert.equal(created.state.tripState,'REQUESTED');
 assert.equal((await get('/api/trip/state','invalid')).status,401,'private state requires a scoped token');
 assert.equal((await post('/api/trip/join',{code:'0000000000'})).status,401,'wrong pilot code is rejected');
 const joined=await (await post('/api/trip/join',{code:created.pilotJoinCode})).json();assert.ok(joined.pilotToken);assert.equal(joined.tripId,created.tripId);
 assert.equal((await post('/api/trip/join',{code:created.pilotJoinCode})).status,401,'pilot invite is one use');
 const fix=(role,lat,lng,token)=>post('/api/telemetry/location',{role,lat,lng,accuracy:5,speed:0,heading:null,source:'live-gps'},token);
 assert.equal((await fix('pilot',37.78,-122.41,created.riderToken)).status,401,'rider token cannot send pilot locations');
 assert.equal((await fix('pilot',37.78,-122.41,joined.pilotToken)).status,200);
 assert.equal((await post('/api/trip/state',{tripState:'ACTIVE'},created.riderToken)).status,409,'only the paired pilot can connect');
 assert.equal((await post('/api/trip/state',{tripState:'ACTIVE'},joined.pilotToken)).status,200);
 for(const role of ['rider','pilot']){const token=role==='rider'?created.riderToken:joined.pilotToken;assert.equal((await fix(role,37.7801,-122.4101,token)).status,200);if(role==='pilot')await sleep(1200);assert.equal((await fix(role,37.78011,-122.41011,token)).status,200)}
 const state=await (await get('/api/trip/state',created.riderToken)).json();assert.equal(state.state.tripState,'ACTIVE');assert.equal(state.shared.fixCounts.rider,2);assert.equal(state.shared.fixCounts.pilot,2);assert.ok(state.state.tripDistanceMiles>0);
 assert.equal((await post('/api/trip/state',{tripState:'COMPLETED'},created.riderToken)).status,409);
 assert.equal((await post('/api/trip/state',{tripState:'COMPLETED'},joined.pilotToken)).status,200);
 assert.equal((await post('/api/trip/reset',{},joined.pilotToken)).status,200);
});
