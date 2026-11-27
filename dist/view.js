const key=new URLSearchParams(location.hash.slice(1)).get('key')||'';
let data={items:[],tx:[]},tab='inventory',pageIndex=0,busy=false;const size=24,$=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){
 const q=$('search').value.trim().toLowerCase(),status=$('status').value;
 $('status').hidden=tab!=='out';
 const items=new Map(data.items.map(i=>[i.id,i]));
 const rows=(tab==='inventory'?data.items:data.tx.filter(t=>t.type===tab&&!t.cancelledAt)).filter(r=>(tab!=='out'||status==='all'||String(r.status||'').toLowerCase().replace('completed','complete')===status.toLowerCase())&&[r.id,r.item,r.name,r.description,items.get(r.item)?.name,r.location,r.applicant_name,r.person,r.dept,r.department_id].join(' ').toLowerCase().includes(q));
 const pages=Math.max(1,Math.ceil(rows.length/size));pageIndex=Math.min(pageIndex,pages-1);
 $('count').textContent=rows.length+' matching records';$('pagination').textContent=`Page ${pageIndex+1} of ${pages}`;$('prev').disabled=!pageIndex;$('next').disabled=pageIndex+1>=pages;
 $('cards').innerHTML=rows.slice(pageIndex*size,(pageIndex+1)*size).map(r=>{const item=tab==='inventory'?r:items.get(r.item)||{};const detail=(label,value)=>`<div><small>${label}</small>${esc(value)}</div>`;return `<article class="card"><button class="code" data-code="${esc(item.id||r.item)}">${esc(item.id||r.item)}</button><h3>${esc(r.description||item.name)}</h3><div class="qty">${esc(r.qty)} <small>${esc(r.uom||item.uom)}</small></div><div class="details">${tab==='inventory'?detail('Physical stock',Number(r.qty)<=Number(r.min||0)?'Low stock':'In stock')+detail('Location',r.location||''):detail('Date',r.date)+detail('Status',r.status||'—')+detail('Department ID',r.department_id)+detail('Department',r.dept)+detail('Production line',r.production_line)+detail('Receiver',r.person)+detail('Applicant',r.applicant_name)}</div></article>`}).join('');
 $('cards').querySelectorAll('[data-code]').forEach(b=>b.onclick=()=>{$('search').value=b.dataset.code;pageIndex=0;render()});
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
}
async function load(){if(busy)return;busy=true;$('refresh').disabled=true;try{
 if(!key)throw Error('Open the complete viewing link supplied by the owner.');
 const r=await fetch('/api/share',{headers:{'X-Share-Key':key},cache:'no-store',credentials:'same-origin'});const result=await r.json();if(!r.ok)throw Error(result.error||'Could not load records.');data=result;
 $('stats').innerHTML=[['Inventory items',data.items.length],['Stock In entries',data.tx.filter(t=>t.type==='in'&&!t.cancelledAt).length],['Stock Out entries',data.tx.filter(t=>t.type==='out'&&!t.cancelledAt).length],['SAP Pending',data.tx.filter(t=>t.type==='out'&&!t.cancelledAt&&/pending|partial/i.test(t.status||'')).length]].map(([l,n])=>`<div class="stat"><span class="muted">${l}</span><strong>${n}</strong></div>`).join('');$('notice').textContent='Read-only access · Add, edit and import are unavailable.';$('updated').textContent='Last refreshed: '+new Date().toLocaleString();render();
 }catch(e){$('notice').textContent=e.message}finally{busy=false;$('refresh').disabled=false}}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;pageIndex=0;render()});$('search').oninput=$('status').onchange=()=>{pageIndex=0;render()};$('prev').onclick=()=>{pageIndex--;render()};$('next').onclick=()=>{pageIndex++;render()};$('refresh').onclick=load;setInterval(()=>{if(!document.hidden)load()},60000);load();
