/* Shared company data: only acknowledged server saves are committed to the screen. */
let crmRevision=0, crmUser=null, crmReady=false, crmBusy=false, crmConfirmed=null;
const crmLegacy=structuredClone(db);
let crmSetupKey=new URLSearchParams(location.hash.slice(1)).get('setup')||'';
if(crmSetupKey) history.replaceState(null,'',location.pathname+location.search);
async function crmRequest(action,options={}) {
  const response=await fetch('/api/crm?action='+action,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...options.headers}});
  const result=await response.json().catch(()=>({error:'Unexpected server response. Please refresh.'}));
  if(!response.ok){const e=Error(result.error||'Request failed.');e.status=response.status;throw e}return result;
}
function crmStatus(text){document.getElementById('cloudstatus').textContent=text}
async function cloudSave(next,kind='save') {
  if(!crmReady||!crmUser){if(crmConfirmed)db=structuredClone(crmConfirmed);throw Error('Reload company data before saving another entry.');}
  if(crmBusy)throw Error('A save is already in progress. Please wait.');
  crmBusy=true;crmStatus('Saving…');document.documentElement.classList.add('crmsaving');
  try {
    const candidate=structuredClone(next);
    const response=await crmRequest('state',{method:'PUT',body:JSON.stringify({revision:crmRevision,kind,data:candidate})});
    crmRevision=response.revision;db=candidate;crmConfirmed=structuredClone(candidate);crmStatus('Saved · Shared company data');
  } catch(e) {
    if(crmConfirmed)db=structuredClone(crmConfirmed);
    if ([400, 403, 413, 415, 422, 429].includes(e.status)) {
      crmStatus('Changes were rejected · Review the message and correct the entry');
      render();
      throw e;
    }
    // A failed response can be an acknowledged server commit whose response was lost.
    // Require a fresh load before another write; never retry a movement blindly.
    crmReady=false;crmStatus('Save not confirmed · Reload company data');
    document.getElementById('cloudreload').hidden=false;
    const dialog = document.querySelector('dialog[open]');
    if (dialog && !dialog.querySelector('[data-reload-company]')) {
      const reload = document.createElement('button');
      reload.type = 'button';
      reload.dataset.reloadCompany = '';
      reload.textContent = 'Reload saved records and close edit';
      reload.onclick = () => crmReload();
      dialog.append(reload);
      dialog.addEventListener('close', () => reload.remove(), {once: true});
    }
    render();throw e;
  } finally {crmBusy=false;document.documentElement.classList.remove('crmsaving')}
}
function crmPanel(title,body){document.getElementById('cloudgate').innerHTML=`<div class="cloudcard"><div class="eyebrow">GIGROUP STORE DESK</div><h1>${title}</h1>${body}<p id="cloudmessage" role="alert"></p></div>`;document.documentElement.classList.add('crmblocked')}
function crmShowLogin(setup=false){
  crmPanel(setup?'Create owner account':'Sign in',`<p>${setup?'Choose your administrator email and password. This setup works once.':'Use your company account on any device.'}</p><form id="cloudlogin">${setup?'<label for="cloudname">Your name</label><input id="cloudname" name="name" required maxlength="100" autocomplete="name">':''}<label for="cloudemail">Email</label><input id="cloudemail" name="email" type="email" required autocomplete="username"><label for="cloudpassword">Password ${setup?'(at least 8 characters)':''}</label><input id="cloudpassword" name="password" type="password" required minlength="${setup?8:1}" maxlength="128" autocomplete="${setup?'new-password':'current-password'}"><button class="primary" style="margin-top:22px;width:100%">${setup?'Create owner account':'Sign in'}</button></form>`);
  document.getElementById('cloudlogin').onsubmit=async event=>{
    event.preventDefault();const form=event.target,button=form.querySelector('button'),body=Object.fromEntries(new FormData(form));button.disabled=true;
    try {
      if(setup){await crmRequest('setup',{method:'POST',body:JSON.stringify({...body,token:crmSetupKey})});crmSetupKey=''}
      const response=await fetch('/api/auth/sign-in/email',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:body.email,password:body.password})});
      const result=await response.json();if(!response.ok)throw Error(result.message||result.error||'Sign in failed.');form.reset();await crmStart();
    }catch(e){document.getElementById('cloudmessage').textContent=e.message}finally{button.disabled=false}
  };
}
async function crmStart(){
  try {
    const setup=await crmRequest('setup');
    if(!setup.configured){
      if(crmSetupKey)crmShowLogin(true);
      else crmPanel('Owner setup required','<p>Open the private owner setup link provided by your administrator.</p><button onclick="location.reload()">Retry</button>');
      return;
    }
    let me;try{me=await crmRequest('me')}catch(e){if(e.status===401){crmShowLogin();return}throw e}
    crmUser=me.user;document.getElementById('clouduser').textContent=crmUser.name+' · '+crmUser.role;
    const result=await crmRequest('state');db=result.data;crmRevision=result.revision;crmConfirmed=structuredClone(db);crmReady=true;
    if(!db.items.length&&!db.tx.length&&(crmLegacy.items.length||crmLegacy.tx.length)&&crmUser.role==='admin'){
      crmPanel('Transfer your existing records',`<p>This browser has <strong>${crmLegacy.items.length} inventory items</strong> and <strong>${crmLegacy.tx.length} stock entries</strong>. The company database is empty.</p><p>Transfer these records once so your other devices can use them. Physical quantities and history stay the same.</p><button id="cloudtransfer" class="primary">Transfer to company database</button><button id="cloudempty" style="margin-top:12px">Start with empty company records</button>`);
      document.getElementById('cloudtransfer').onclick=async()=>{const b=document.getElementById('cloudtransfer');b.disabled=true;try{await cloudSave(crmLegacy,'migrate');crmUnlock()}catch(e){document.getElementById('cloudmessage').textContent=e.message;b.disabled=false}};
      document.getElementById('cloudempty').onclick=crmUnlock;
      return;
    }
    crmUnlock();
  }catch(e){crmPanel('Connection needs attention',`<p>${esc(e.message)}</p><button onclick="crmStart()">Retry connection</button>`)}
}
function crmUnlock(){document.body.dataset.role=crmUser.role;document.documentElement.classList.remove('crmblocked');document.getElementById('cloudgate').innerHTML='';document.getElementById('cloudreload').hidden=true;crmStatus('Shared company data · Connected');render();crmRenderTeam()}
async function crmReload(){if(crmBusy)return;crmReady=false;try{const result=await crmRequest('state');db=result.data;crmRevision=result.revision;crmConfirmed=structuredClone(db);crmReady=true;document.querySelectorAll('dialog[open]').forEach(d=>d.close());crmUnlock()}catch(e){toast(e.message)}}
async function crmLogout(){
  if(crmBusy)return;
  try{const r=await fetch('/api/auth/sign-out',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error('Sign out failed. Please retry.');crmReady=false;crmUser=null;crmConfirmed=null;document.querySelectorAll('dialog[open]').forEach(d=>d.close());db={items:[],tx:[]};render();crmShowLogin()}catch(e){toast(e.message)}
}
async function crmRenderTeam(){
  if(page!=='Team'||!crmUser)return;
  const panel=document.getElementById('team');
  if(crmUser.role!=='admin'){panel.innerHTML='<div class="panelhead"><h2>Company access</h2></div><p style="padding:22px">Ask the administrator to manage employee accounts.</p>';return}
  try{
    const {members}=await crmRequest('members');
    panel.innerHTML=`<div class="panelhead"><h2>Employee accounts</h2><button class="primary" onclick="crmAddMember()">＋ Add employee</button></div>${members.map(m=>`<div class="member"><div><strong>${esc(m.name)}</strong><div class="role">${esc(m.email)} · ${esc(m.role)} · ${m.active?'Active':'Disabled'}</div></div>${m.role==='admin'?'<span class="pill">Administrator</span>':`<button data-id="${esc(m.id)}" data-active="${!m.active}" onclick="crmToggleMember(this)">${m.active?'Disable access':'Enable access'}</button>`}</div>`).join('')}`;
  }catch(e){panel.textContent=e.message}
}
function crmAddMember(){
  const dialog=document.getElementById('cloudmemberdialog');dialog.innerHTML='<form id="cloudmemberform"><h2>Add employee</h2><label>Name</label><input name="name" required maxlength="100"><label>Email</label><input name="email" type="email" required><label>Password (at least 8 characters)</label><input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"><label>Role</label><select name="role"><option value="storekeeper">Storekeeper — new movements, view stock</option><option value="manager">Manager — inventory, edit, SAP completion</option></select><p id="cloudmembererror" role="alert"></p><div class="actions"><button type="button" onclick="this.closest(\'dialog\').close()">Cancel</button><button class="primary">Create account</button></div></form>';
  document.getElementById('cloudmemberform').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('.primary');b.disabled=true;try{await crmRequest('members',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});e.target.reset();dialog.close();await crmRenderTeam();toast('Employee account created.')}catch(err){document.getElementById('cloudmembererror').textContent=err.message}finally{b.disabled=false}};dialog.showModal();
}
async function crmToggleMember(button){button.disabled=true;try{await crmRequest('members',{method:'PATCH',body:JSON.stringify({id:button.dataset.id,active:button.dataset.active==='true'})});await crmRenderTeam()}catch(e){toast(e.message);button.disabled=false}}
window.crmRenderTeam=crmRenderTeam;
setInterval(async()=>{
  if(!crmReady||crmBusy||document.hidden||document.querySelector('dialog[open]'))return;
  const requestedRevision=crmRevision;try{const r=await crmRequest('state&revision='+requestedRevision);if(!crmBusy&&crmReady&&crmRevision===requestedRevision&&!r.unchanged&&r.revision>crmRevision){db=r.data;crmRevision=r.revision;crmConfirmed=structuredClone(db);render();crmStatus('Updated from company database')}}catch(e){crmStatus('Connection interrupted · Saved records remain on server');if(e.status===401){crmReady=false;db={items:[],tx:[]};render();crmShowLogin()}}
},15000);
window.addEventListener('online',()=>{if(crmReady)crmReload()});
crmStart();
let historyStockPreview=null;
async function openHistoryStock(){
 const dialog=$('historystockdialog');historyStockPreview=null;
 dialog.innerHTML='<h2>Apply imported Stock Out to inventory</h2><p class="importhelp">Use this only when the quantities in a history-only import have NOT already been deducted from your physical inventory. Existing entries stay in place. Each entry can reduce stock once. Zero-stock and insufficient entries stay pending for physical deduction. Complete and SAP-posted entries are included when stock is sufficient; their SAP status and Edit/Cancel locks stay unchanged.</p><label for="historybatch">History-only Stock Out import</label><select id="historybatch" onchange="previewHistoryStockBatch()"><option value="">Choose an import…</option></select><label for="historymode">Deduction mode</label><select id="historymode" onchange="previewHistoryStockBatch()"><option value="available">Deduct items with enough stock — skip zero/insufficient stock</option><option value="strict">Apply only when every remaining entry qualifies</option></select><div id="historypreview"></div><p id="historyerror" role="alert" style="color:#b44335;white-space:pre-wrap"></p><label class="importcheck"><input id="historyconfirm" type="checkbox" onchange="$(\'historyapply\').disabled=!this.checked||!historyStockPreview||historyStockPreview.errors.length>0"><span>The entries selected for deduction have not previously reduced the physical quantities shown above.</span></label><div class="actions"><button onclick="$(\'historystockdialog\').close()">Close</button><button id="historyapply" class="primary" disabled onclick="applyHistoryStockBatch()">Deduct from physical inventory once</button></div>';
 dialog.showModal();
 try{const {batches}=await crmRequest('history-stock');$('historybatch').innerHTML='<option value="">Choose an import…</option>'+batches.slice().reverse().map(b=>`<option value="${esc(b.id)}" ${b.stockAppliedAt?'disabled':''}>${esc(b.file)} · ${esc(new Date(b.time).toLocaleString())} · ${b.added} rows${b.stockAppliedAt?' · Already deducted':b.stockPartiallyAppliedAt?' · Partly deducted; remaining entries only':''}</option>`).join('');if(!batches.length)$('historyerror').textContent='No history-only Stock Out imports were found.'}catch(e){$('historyerror').textContent=e.message}
}
async function previewHistoryStockBatch(){
 historyStockPreview=null;$('historyapply').disabled=true;$('historyconfirm').checked=false;$('historypreview').innerHTML='';$('historyerror').textContent='';
 const id=$('historybatch').value,mode=$('historymode').value;if(!id)return;
 try{const p=await crmRequest('history-stock&batch='+encodeURIComponent(id)+'&mode='+encodeURIComponent(mode));if($('historybatch').value!==id||$('historymode').value!==mode)return;historyStockPreview=p;$('historypreview').innerHTML=`<p>${p.entries} entries to deduct · ${p.changes.length} eligible items · ${p.skipped} entries skipped (including ${p.alreadyApplied} already deducted). No new Stock Out entries will be created.</p><div class="tablewrap" style="max-height:40vh"><table><thead><tr><th>Item No.</th><th>Description</th><th>Available</th><th>Deduct</th><th>After</th><th>UOM</th></tr></thead><tbody>${p.changes.map(c=>`<tr><td>${esc(c.item)}</td><td>${esc(c.description)}</td><td>${c.before}</td><td>${c.quantity}</td><td>${c.after}</td><td>${esc(c.uom)}</td></tr>`).join('')}</tbody></table></div>${p.skippedEntries.length?'<details style="margin-top:15px"><summary>Skipped entries — no deduction</summary><div class="tablewrap" style="max-height:25vh"><table><thead><tr><th>Item</th><th>Quantity</th><th>Reason</th></tr></thead><tbody>'+p.skippedEntries.map(t=>'<tr><td>'+esc(t.item)+'</td><td>'+t.quantity+'</td><td>'+esc(t.reason)+'</td></tr>').join('')+'</tbody></table></div></details>':''}`;$('historyerror').textContent=p.errors.join('\n')}catch(e){$('historyerror').textContent=e.message}
}
async function applyHistoryStockBatch(){
 const p=historyStockPreview;if(!p||p.errors.length||!$('historyconfirm').checked||crmBusy)return;
 crmBusy=true;$('historyapply').disabled=true;document.documentElement.classList.add('crmsaving');
 try{await crmRequest('history-stock',{method:'POST',body:JSON.stringify({revision:p.revision,batchId:p.batch.id,mode:p.mode})});historyStockPreview=null;$('historystockdialog').close();crmBusy=false;await crmReload();toast(p.entries+' eligible entries deducted once. '+p.skipped+' entries skipped; existing records retained.')}catch(e){historyStockPreview=null;$('historyerror').textContent=e.message+' Preview the import again before retrying.';crmReady=false;$('cloudreload').hidden=false;crmStatus('Reload company data before another save.')}finally{crmBusy=false;document.documentElement.classList.remove('crmsaving')}
}
