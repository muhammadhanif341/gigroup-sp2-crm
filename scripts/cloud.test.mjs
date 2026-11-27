import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const html=fs.readFileSync('dist/index.html','utf8'),main=html.match(/<script>([\s\S]*?)<\/script>/)[1],cloud=fs.readFileSync('dist/cloud.js','utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function client(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:id==='filter'?'all':id==='entrystate'?'active':'',classList:{toggle(){},add(){},remove(){}},addEventListener(){},querySelector(){return {}},close(){},showModal(){}});return nodes.get(id)};
 const records=new Map();let interval,mode='ok',pendingPoll;
 const original={items:[{id:'R-SP20001',name:'Bearing',qty:10,uom:'PCS',min:0}],tx:[]};
 const c={structuredClone,Intl,Date,URL,URLSearchParams,location:{hash:'',pathname:'/',search:''},history:{replaceState(){}},setInterval:f=>interval=f,setTimeout(){},document:{getElementById:node,addEventListener(){},querySelector(){return null},querySelectorAll(){return []},body:{dataset:{},classList:{remove(){},toggle(){}},append(){}},documentElement:{classList:{add(){},remove(){}}}},window:{addEventListener(){}},localStorage:{getItem:k=>records.get(k)||null,setItem:(k,v)=>records.set(k,v)},fetch:async(url,options)=>{
  const action=new URL(url,'https://example.com').searchParams.get('action');
  if(action==='setup')return {ok:true,json:async()=>({configured:true})};
  if(action==='me')return {ok:true,json:async()=>({user:{id:'u1',name:'Owner',role:'admin'}})};
  if(action==='state'){
   if(options.method==='PUT'){if(mode==='conflict')return {ok:false,status:409,json:async()=>({error:'Another device saved newer records.'})};return {ok:true,json:async()=>({revision:1})}}
   if(mode==='poll')return await new Promise(resolve=>pendingPoll=resolve);
   return {ok:true,json:async()=>({revision:0,data:structuredClone(original)})};
  }
  throw Error('Unexpected request '+url);
 }};
 vm.createContext(c);vm.runInContext(main,c);vm.runInContext(fs.readFileSync('dist/sap-completion.js','utf8'),c);vm.runInContext(cloud,c);for(let i=0;i<8;i++)await flush();
 return {c,nodes,setMode:v=>mode=v,interval:()=>interval(),resolvePoll:value=>pendingPoll({ok:true,json:async()=>value})};
}
test('company data loads before shared editing is enabled',async()=>{const {c}=await client();assert.equal(vm.runInContext('crmReady',c),true);assert.equal(vm.runInContext('db.items[0].qty',c),10)});
test('server acknowledgement commits a save with its revision',async()=>{const {c}=await client();await vm.runInContext('cloudSave({items:[{id:"R-SP20001",name:"Bearing",qty:8,uom:"PCS",min:0}],tx:[]})',c);assert.equal(vm.runInContext('crmRevision',c),1);assert.equal(vm.runInContext('db.items[0].qty',c),8)});
test('conflict restores confirmed state and blocks writes until reload',async()=>{const {c,setMode,nodes}=await client();setMode('conflict');await assert.rejects(vm.runInContext('db.items[0].qty=3;cloudSave(db)',c),/Another device/);assert.equal(vm.runInContext('db.items[0].qty',c),10);assert.equal(vm.runInContext('crmReady',c),false);assert.equal(nodes.get('cloudreload').hidden,false)});
test('a slow older poll cannot replace a newly saved revision',async()=>{const h=await client();h.setMode('poll');const polling=h.interval();await flush();h.setMode('ok');await vm.runInContext('cloudSave({items:[{id:"R-SP20001",name:"Bearing",qty:8,uom:"PCS",min:0}],tx:[]})',h.c);h.resolvePoll({revision:0,data:{items:[],tx:[]}});await polling;assert.equal(vm.runInContext('crmRevision',h.c),1);assert.equal(vm.runInContext('db.items[0].qty',h.c),8)});
