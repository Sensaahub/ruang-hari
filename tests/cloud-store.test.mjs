import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudStore} from '../web/cloud-store.js';
const tick=()=>new Promise(r=>setImmediate(r));
const task=(title='a')=>({id:'1',title});
const validate=t=>t&&typeof t.id==='string'&&typeof t.title==='string';
function fixture(storage=new Map()){
  let remote={revision:0,tasks:[],mutation_id:null},serial=0,offline=false,writes=0;
  const transport={
    read:async()=>{if(offline)throw Error('offline');return structuredClone(remote);},
    write:async(user,f)=>{writes++;if(offline)throw Error('offline');if(remote.mutation_id===f.id)return structuredClone(remote);if(f.revision!==remote.revision)throw Object.assign(Error('conflict'),{code:'40001'});remote={revision:remote.revision+1,tasks:structuredClone(f.tasks),mutation_id:f.id};return structuredClone(remote);}
  };
  const options={transport,storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},validate,newId:()=>`m${++serial}`};
  return {options,storage,get remote(){return remote;},set remote(v){remote=v;},set offline(v){offline=v;},get writes(){return writes;},store:new CloudStore(options)};
}
test('two devices never silently overwrite conflicting board edits',async()=>{
  const f=fixture(),a=f.store,b=new CloudStore({...f.options,newId:()=> 'device-b'});
  await a.connect({id:'u'});await b.connect({id:'u'});
  a.save([task('A')]);await tick();
  b.save([task('B')]);await tick();await tick();
  assert.equal(b.phase,'conflict');assert.equal(b.locked,true);assert.equal(f.remote.tasks[0].title,'A');assert.equal(b.tasks[0].title,'B');
  b.resolve('local');await tick();assert.equal(f.remote.tasks[0].title,'B');assert.equal(f.remote.revision,2);
  await a.refresh();assert.equal(a.tasks[0].title,'B');
});
test('offline pending edits survive reopening and sync on reconnect',async()=>{
  const f=fixture();await f.store.connect({id:'u'});f.offline=true;f.store.save([task('offline')]);await tick();
  assert.equal(f.store.phase,'offline');const restored=new CloudStore(f.options);await restored.connect({id:'u'});assert.equal(restored.tasks[0].title,'offline');assert.equal(restored.locked,false);
  f.offline=false;await restored.refresh();await tick();assert.equal(restored.phase,'synced');assert.equal(f.remote.tasks[0].title,'offline');
});
test('lost acknowledgement retries the same durable mutation without duplication',async()=>{
  const f=fixture();const write=f.options.transport.write;let lose=true;
  f.options.transport.write=async(...args)=>{const row=await write(...args);if(lose){lose=false;throw Error('lost response');}return row;};
  await f.store.connect({id:'u'});f.store.save([task('saved')]);await tick();assert.equal(f.remote.revision,1);assert.equal(f.store.phase,'offline');
  await f.store.refresh();assert.equal(f.store.phase,'synced');assert.equal(f.remote.revision,1);
});
test('edits during an in-flight write are preserved and sent next',async()=>{
  const f=fixture(),write=f.options.transport.write;let release;
  f.options.transport.write=async(...args)=>{await new Promise(r=>release=r);return write(...args);};
  await f.store.connect({id:'u'});f.store.save([task('first')]);f.store.save([task('second')]);release();await tick();assert.equal(f.remote.tasks[0].title,'first');assert.equal(f.store.tasks[0].title,'second');release();await tick();assert.equal(f.remote.tasks[0].title,'second');assert.equal(f.store.phase,'synced');
});
test('late response for previous account cannot change the active account',async()=>{
  const f=fixture();let release;f.options.transport.read=async user=>user.id==='a'?new Promise(r=>release=r):{revision:0,tasks:[task('B')],mutation_id:null};
  const pending=f.store.connect({id:'a'});await f.store.connect({id:'b'});release({revision:9,tasks:[task('A')],mutation_id:null});await pending;
  assert.equal(f.store.user.id,'b');assert.equal(f.store.tasks[0].title,'B');
});
test('quota failure rejects edit before changing the accepted tasks',async()=>{
  const f=fixture();await f.store.connect({id:'u'});f.options.storage.setItem=()=>{throw Error('quota');};
  assert.throws(()=>f.store.save([task('not durable')]),/quota/);assert.deepEqual(f.store.tasks,[]);assert.equal(f.writes,0);
});
test('choosing server after conflict discards only the explicit local snapshot',async()=>{
  const f=fixture();await f.store.connect({id:'u'});f.offline=true;f.store.save([task('local')]);await tick();f.remote={revision:1,tasks:[task('remote')],mutation_id:'other'};f.offline=false;await f.store.refresh();assert.equal(f.store.phase,'conflict');f.store.resolve('remote');assert.equal(f.store.tasks[0].title,'remote');assert.equal(f.store.record.pending,false);
});
test('missing account cache and unavailable server lock editing',async()=>{
  const f=fixture();f.offline=true;await f.store.connect({id:'new'});assert.equal(f.store.locked,true);assert.throws(()=>f.store.save([task()]));
});
test('stale refresh response cannot produce a false conflict after a write',async()=>{
  const f=fixture();await f.store.connect({id:'u'});const previous=structuredClone(f.remote);let release;
  f.options.transport.read=()=>new Promise(r=>release=r);
  const refresh=f.store.refresh();f.store.save([task('new')]);await tick();
  release(previous);await refresh;assert.equal(f.store.phase,'synced');assert.equal(f.store.tasks[0].title,'new');
});
