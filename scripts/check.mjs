import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=fs.readFileSync('dist/index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new Function(script);
for(const match of html.matchAll(/<script src="([^"]+)"/g)) assert(fs.existsSync('dist/'+match[1]),'Missing asset '+match[1]);
const context={};vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('function normalizeItemCode'),html.indexOf('let movementBook')),context);
vm.runInContext(html.slice(html.indexOf('function validateBackup'),html.indexOf('async function previewBackup')),context);
const data={items:[{id:'R-SP20001',name:'Test',qty:5}],tx:[{id:'t1',item:'R-SP20001',type:'in',qty:5,date:'2026-11-13'}]};
assert.equal(context.validateBackup({format:'gigroup-backup',version:1,data}).items[0].qty,5);
assert.throws(()=>context.validateBackup({items:[{id:'x',name:'X',qty:-1}],tx:[]}));
assert.throws(()=>context.validateBackup({items:data.items,tx:[...data.tx,...data.tx]}));
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));assert.equal(config.outputDirectory,'dist');
assert(html.includes('Import Stock In'));assert(html.includes('Import Stock Out'));assert(html.includes('Every row is a separate movement'));
console.log('PASS: JavaScript syntax, local assets, backup validation, Vercel configuration, Stock In/Out import presence.');

// Execute the complete startup script so initialization errors cannot ship.
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
const nodes=new Map([...ids].map(id=>[id,{innerHTML:'',textContent:'',value:id==='entrystate'?'active':id==='filter'?'all':'',classList:{toggle(){}},addEventListener(){},querySelector(){return {}},close(){},showModal(){}}]));
const localRecords=new Map();
const startup={document:{getElementById:id=>nodes.get(id)||null,addEventListener(){}},window:{addEventListener(){}},localStorage:{getItem:key=>localRecords.get(key)||null,setItem:(key,value)=>localRecords.set(key,value)},structuredClone,Intl,Date};
vm.createContext(startup);
vm.runInContext(script,startup,{timeout:3000});
const sapScript=fs.readFileSync('dist/sap-completion.js','utf8');new Function(sapScript);vm.runInContext(sapScript,startup,{timeout:3000});
const pwaScript=fs.readFileSync('dist/pwa.js','utf8');new Function(pwaScript);vm.runInContext(pwaScript,startup,{timeout:3000});
assert.equal((nodes.get('nav').innerHTML.match(/<button/g)||[]).length,7,'Sidebar must initialize with seven sections');
assert.equal(typeof nodes.get('cancelentryform').onsubmit,'function','Cancellation handler must initialize');
vm.runInContext("go('Stock In');go('Stock Out');go('Inventory')",startup,{timeout:3000});
console.log('PASS: complete app startup, sidebar sections, cancellation handler and section navigation.');

const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));
assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
for(const icon of manifest.icons){const bytes=fs.readFileSync('dist'+icon.src);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);}
assert(html.includes('crossorigin="use-credentials"'));assert(html.includes('id="mobilemenubutton"'));assert(fs.existsSync('dist/offline.html'));
new Function(fs.readFileSync('dist/sw.js','utf8'));
console.log('PASS: PWA manifest, standalone mode, PNG dimensions, install controls and service worker syntax.');
