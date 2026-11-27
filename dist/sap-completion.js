// SAP completion changes posting status only; it never adjusts physical inventory.
let sapCompletionBook=null,sapCompletionCSV=null,sapCompletionRows=[],sapCompletionDrafts=[],sapCompletionPlan=null,sapCompletionFile='',sapCompletionSignature='',sapCompletionGeneration=0;
const sapCompletionFields=[['item','Item No. *',['itemno','itemnumber','itemcode','material','materialnumber']],['description','Description',['description','itemdescription','materialdescription']],['qty','SAP issued Quantity *',['quantity','qty','issuedquantity']],['uom','UoM *',['uomcode','uom','unit','baseunitofmeasure']],['department_id','Department ID *',['department','departmentid','deptid']],['applicant_name','Applicant Name *',['applicantname','applicant']],['entry_id','CRM Entry ID (if included)',['crmentryid','entryid','crmreference']]];
function openSAPCompletion(){sapCompletionGeneration++;sapCompletionBook=null;sapCompletionCSV=null;sapCompletionRows=[];sapCompletionDrafts=[];sapCompletionPlan=null;sapCompletionSignature='';$('sapcompletionfile').value='';$('sapdocumentref').value='';$('sappostingdate').value='';$('sapcompletionoptions').classList.add('hidden');$('applysapcompletion').disabled=true;$('sapcompletionmessage').textContent='Select your SAP export to preview matches.';$('sapcompletiondialog').showModal()}
async function readSAPCompletionFile(file){const generation=++sapCompletionGeneration;sapCompletionPlan=null;sapCompletionDrafts=[];$('applysapcompletion').disabled=true;$('sapcompletionoptions').classList.add('hidden');if(!file)return;if(file.size>10*1024*1024||!/\.(xlsx|xls|csv)$/i.test(file.name)){$('sapcompletionmessage').textContent='Choose an Excel or CSV file up to 10 MB.';return}try{const data=await file.arrayBuffer();if(generation!==sapCompletionGeneration)return;sapCompletionFile=file.name;sapCompletionCSV=null;if(/\.csv$/i.test(file.name)){sapCompletionCSV=parseMovementCSV(new TextDecoder('utf-8').decode(data));sapCompletionBook={SheetNames:['CSV'],Sheets:{}}}else sapCompletionBook=XLSX.read(data,{type:'array',cellDates:true,cellFormula:false,cellHTML:false,sheetRows:10002});$('sapcompletionsheet').innerHTML=sapCompletionBook.SheetNames.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');selectSAPCompletionSheet()}catch(e){$('sapcompletionmessage').textContent='Unable to read file: '+e.message}}
function selectSAPCompletionSheet(){sapCompletionPlan=null;$('applysapcompletion').disabled=true;try{let rows=sapCompletionCSV;if(!rows){const sheet=sapCompletionBook.Sheets[$('sapcompletionsheet').value],range=XLSX.utils.decode_range(sheet['!ref']||'A1');if(range.e.r>10000||range.e.c>199)throw Error('Maximum 10,000 rows and 200 columns.');rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''})}if(rows.length<2||rows.length>10001||rows.some(r=>r.length>200))throw Error('Use a header row followed by up to 10,000 data rows.');const headers=rows[0].map(String),norm=v=>v.trim().toLowerCase().replace(/[^a-z0-9]/g,'');sapCompletionRows=rows.slice(1).map((cells,index)=>({cells,row:index+2})).filter(r=>r.cells.some(v=>String(v).trim()));$('sapcompletionmapping').innerHTML=sapCompletionFields.map(([key,label,aliases])=>{const found=aliases.map(alias=>headers.findIndex(h=>norm(h)===alias)).find(index=>index>=0)??-1;return `<div><label for="sapmap-${key}">${label}</label><select id="sapmap-${key}" onchange="prepareSAPMatches()"><option value="">Select column</option>${headers.map((h,index)=>`<option value="${index}" ${found===index?'selected':''}>${esc(h)}</option>`).join('')}</select></div>`}).join('');$('sapcompletionoptions').classList.remove('hidden');$('sapcompletionmessage').textContent=sapCompletionFile+' · '+sapCompletionRows.length+' issued rows. Review matches before confirming.';prepareSAPMatches()}catch(e){$('sapcompletionmessage').textContent=e.message}}
function parseSAPRows(rows,mapping){const result={rows:[],errors:[]};for(const r of rows){const text=k=>mapping[k]===undefined||mapping[k]===''?'':String(r.cells[Number(mapping[k])]??'').trim(),item=normalizeItemCode(text('item')),qty=parseImportNumber(text('qty')),department=text('department_id'),uom=text('uom'),applicant_name=text('applicant_name');if(!/^R-SP2\S+$/.test(item)||!Number.isFinite(qty)||qty<=0||!department||!uom||!applicant_name){result.errors.push('File row '+r.row+': item number, positive issued quantity, Department, UoM and Applicant Name are required.');continue}result.rows.push({row:r.row,item,qty,uom,applicant_name,department_id:department,description:text('description'),entry_id:text('entry_id')})}return result}
function sapApplicantKey(value){return String(value||'').trim().replace(/\s+/g,' ').toUpperCase()}
function sapCandidates(database,row){return database.tx.filter(tx=>tx.type==='out'&&!tx.cancelledAt&&sapRemainingQuantity(tx)>0&&normalizeItemCode(tx.item)===row.item&&String(tx.department_id||'').trim().toUpperCase()===row.department_id.toUpperCase()&&String(tx.uom||database.items.find(i=>normalizeItemCode(i.id)===row.item)?.uom||'').trim().toUpperCase()===row.uom.toUpperCase()&&sapApplicantKey(tx.applicant_name)===sapApplicantKey(row.applicant_name)&&Math.abs(sapRemainingQuantity(tx)-row.qty)<1e-8&&(!row.entry_id||tx.id===row.entry_id))}
function makeSAPDrafts(database,rows){
 const assigned=new Set();
 return rows.map(row=>{
  const candidates=sapCandidates(database,row).filter(tx=>!assigned.has(tx.id)).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id).localeCompare(String(b.id)));
  const allocations={};
  if(candidates.length){const selected=candidates[0];allocations[selected.id]=row.qty;assigned.add(selected.id)}
  return {...row,allocations};
 });
}
async function prepareSAPMatches(){const generation=++sapCompletionGeneration;sapCompletionPlan=null;sapCompletionDrafts=[];sapCompletionSignature='';$('applysapcompletion').disabled=true;$('sapcompletionerrors').textContent='';$('sapcompletionmatches').innerHTML='';const mapping=Object.fromEntries(sapCompletionFields.map(([k])=>[k,$('sapmap-'+k).value]));if(['item','qty','uom','department_id','applicant_name'].some(k=>mapping[k]==='')){$('sapcompletionsummary').textContent='Map the five required columns to continue.';return}const selected=Object.values(mapping).filter(v=>v!=='');if(new Set(selected).size!==selected.length){$('sapcompletionsummary').textContent='Map each column only once.';return}const parsed=parseSAPRows(sapCompletionRows,mapping);if(parsed.errors.length){$('sapcompletionerrors').textContent=parsed.errors.slice(0,50).join('\n');return}const canonical=JSON.stringify(parsed.rows.map(r=>[r.item,r.department_id.toUpperCase(),r.uom.toUpperCase(),r.qty,r.entry_id,sapApplicantKey(r.applicant_name)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));if(generation!==sapCompletionGeneration)return;sapCompletionSignature=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');sapCompletionDrafts=makeSAPDrafts(db,parsed.rows);renderSAPMatches();refreshSAPCompletion()}
function renderSAPMatches(){$('sapcompletionmatches').innerHTML=sapCompletionDrafts.map((row,index)=>{const candidates=sapCandidates(db,row);return `<section style="padding:14px;margin:12px 0;border:1px solid #dce5e7;border-radius:9px"><strong>File row ${row.row}: ${esc(row.item)} · SAP issued ${row.qty} ${esc(row.uom)} · ${esc(row.department_id)} · ${esc(row.applicant_name)}</strong><p class="importhelp">${esc(row.description)}<br>${candidates.length===1?'One pending match suggested. Confirm the entry below.':candidates.length>1?'Multiple exact matches: the oldest unused entry is suggested. Review the selected entry before applying.':'No matching pending entry. No new Stock Out will be created.'}</p>${candidates.map(tx=>`<label style="padding:9px;background:#24282d;color:#e5edf5;border-radius:5px;display:flex;justify-content:space-between;gap:12px;align-items:center"><span>${esc(tx.date)} · ${esc(tx.person||'')} · Applicant: ${esc(tx.applicant_name||'')} · ${esc(tx.production_line||'')}<br>Entry QTY ${tx.qty} · SAP issued ${sapIssuedQuantity(tx)} · Remaining ${sapRemainingQuantity(tx)}<br><small>${esc(tx.id)}</small></span><input aria-label="SAP issued quantity for file row ${row.row}, entry ${esc(tx.id)}" type="number" min="0" max="${sapRemainingQuantity(tx)}" step="any" style="width:130px" value="${row.allocations[tx.id]||0}" data-row="${index}" data-entry="${esc(tx.id)}" oninput="setSAPAllocation(this)"></label>`).join('')}</section>`}).join('')}
function setSAPAllocation(input){const row=sapCompletionDrafts[Number(input.dataset.row)];if(!row)return;row.allocations[input.dataset.entry]=input.value===''?0:Number(input.value);refreshSAPCompletion()}
function buildSAPCompletionPlan(database,drafts,batchKey){const result={errors:[],changes:[],complete:0,partial:0,alreadyApplied:false};if((database.sapCompletionBatches||[]).some(b=>b.key===batchKey)){result.alreadyApplied=true;return result}const totals=new Map();for(const row of drafts){let assigned=0;for(const [id,value]of Object.entries(row.allocations)){const qty=Number(value);if(!Number.isFinite(qty)||qty<0){result.errors.push('File row '+row.row+': invalid allocation.');continue}if(qty===0)continue;if(Math.abs(qty-row.qty)>1e-8){result.errors.push('File row '+row.row+': select one exact-quantity matching entry.');continue}const tx=database.tx.find(t=>t.id===id);if(!tx||!sapCandidates(database,row).some(t=>t.id===id)){result.errors.push('File row '+row.row+': selected entry is no longer a matching Pending entry.');continue}assigned=stockNumber(assigned+qty);totals.set(id,stockNumber((totals.get(id)||0)+qty))}if(Math.abs(assigned-row.qty)>1e-8)result.errors.push('File row '+row.row+': allocate exactly '+row.qty+' '+row.uom+' to matching entries; currently '+assigned+'.')}for(const [id,amount]of totals){const tx=database.tx.find(t=>t.id===id),remaining=sapRemainingQuantity(tx);if(amount>remaining+1e-8){result.errors.push(tx.item+': allocation exceeds remaining quantity '+remaining+'.');continue}const issued=stockNumber(sapIssuedQuantity(tx)+amount),status=stockNumber(tx.qty-issued)===0?'Complete':'Partial';result.changes.push({id,amount,issued,status,sourceRows:drafts.filter(r=>(r.allocations[id]||0)>0).map(r=>r.row)});result[status==='Complete'?'complete':'partial']++}if(!drafts.length)result.errors.push('No Goods Issue rows found.');return result}
function refreshSAPCompletion(){sapCompletionPlan=null;$('applysapcompletion').disabled=true;if(!sapCompletionDrafts.length||!sapCompletionSignature)return;const reference=$('sapdocumentref').value.trim(),key=reference?'GI:'+reference.toUpperCase():'CONTENTS:'+sapCompletionSignature,plan=buildSAPCompletionPlan(db,sapCompletionDrafts,key);$('sapcompletionerrors').textContent=plan.errors.slice(0,50).join('\n');$('sapcompletionsummary').textContent=plan.alreadyApplied?'This Goods Issue batch was already applied. Nothing will be changed.':`${plan.complete} entries → Complete · ${plan.partial} → Partial · ${plan.errors.length} errors. Physical stock stays unchanged. Remaining Pending entries stay Pending.`;if(!plan.alreadyApplied&&!plan.errors.length&&plan.changes.length){plan.snapshot=JSON.stringify(db);plan.key=key;plan.reference=reference;plan.postingDate=$('sappostingdate').value;plan.signature=sapCompletionSignature;plan.filename=sapCompletionFile;sapCompletionPlan=plan;$('applysapcompletion').disabled=false}}
function applySAPCompletionPlan(database,plan,at=new Date().toISOString()){if(plan.alreadyApplied||plan.errors.length||!plan.changes.length)throw Error('There is no valid completion plan to apply.');if((database.sapCompletionBatches||[]).some(b=>b.key===plan.key))throw Error('This Goods Issue batch was already applied.');const next=structuredClone(database);for(const change of plan.changes){const tx=next.tx.find(t=>t.id===change.id);if(!tx||tx.cancelledAt||change.amount>sapRemainingQuantity(tx)+1e-8)throw Error('The selected pending entries changed. Refresh matching first.');const before=transactionSnapshot(tx);tx.sapIssuedQty=change.issued;tx.status=change.status;tx.sapPostings=tx.sapPostings||[];tx.sapPostings.push({batchKey:plan.key,document:plan.reference,postingDate:plan.postingDate,qty:change.amount,sourceFile:plan.filename,sourceRows:change.sourceRows,recordedAt:at});tx.audit=tx.audit||[];tx.audit.push({action:'sap-complete',at,reason:'SAP Goods Issue '+(plan.reference||plan.filename),before,after:transactionSnapshot(tx)})}next.sapCompletionBatches=next.sapCompletionBatches||[];next.sapCompletionBatches.push({key:plan.key,signature:plan.signature,document:plan.reference,postingDate:plan.postingDate,sourceFile:plan.filename,at,changes:plan.changes});return next}
async function applySAPCompletion(){if(!sapCompletionPlan)return;if(JSON.stringify(db)!==sapCompletionPlan.snapshot){sapCompletionPlan=null;$('applysapcompletion').disabled=true;$('sapcompletionmessage').textContent='CRM data changed. Refresh this page and upload the completion file again.';return}try{const next=applySAPCompletionPlan(db,sapCompletionPlan);await cloudSave(next);const message=`SAP posting recorded: ${sapCompletionPlan.complete} Complete, ${sapCompletionPlan.partial} Partial. Physical stock unchanged.`;sapCompletionPlan=null;$('sapcompletiondialog').close();go('Stock Out');toast(message)}catch(e){$('sapcompletionmessage').textContent='Nothing applied: '+e.message}}
function exportSAPPending(){const rows=db.tx.filter(t=>t.type==='out'&&!t.cancelledAt&&sapRemainingQuantity(t)>0),headers=['Sr #','Item No.','Description','Quantity','UOM','Dept ID','Dept Desc','Prod Line','Receiver Name','Applicant Name','Date','Status','CRM Entry ID'],cell=value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'},data=rows.map((t,index)=>[serial(index),t.item,t.description||'',sapRemainingQuantity(t),t.uom,t.department_id,t.dept,t.production_line,t.person,t.applicant_name,t.date,t.status||'Pending',t.id]),blob=new Blob(['\uFEFF'+[headers,...data].map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='GIGROUP-SAP-Pending.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

// Read-only Goods Issue reports, sourced from recorded SAP postings.
function sapDocumentKey(value){return String(value||'').trim().toUpperCase()}
function sapGoodsIssueRows(database,documentNumber){
 const key=sapDocumentKey(documentNumber),rows=[];
 if(!key)return rows;
 for(const tx of database.tx||[]){
  if(tx.type!=='out')continue;
  const item=(database.items||[]).find(i=>i.id===tx.item)||{};
  for(const posting of tx.sapPostings||[]){
   if(sapDocumentKey(posting.document)!==key||!Number.isFinite(Number(posting.qty))||Number(posting.qty)<=0)continue;
   rows.push({item:tx.item,description:tx.description||item.name||'',qty:Number(posting.qty),uom:tx.uom||item.uom||'',department:tx.department_id||'',dept:tx.dept||'',line:tx.production_line||'',receiver:tx.person||'',applicant:tx.applicant_name||'',date:tx.date||'',postingDate:posting.postingDate||'',status:tx.status||'',entryId:tx.id});
  }
 }
 return rows;
}
function sapReportEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function sapGoodsIssueMarkup(documentNumber,rows){
 const e=sapReportEscape;
 const headings=['Sr #','Item No.','Description','Issued Qty','UOM','Dept ID','Dept Desc','Prod Line','Receiver Name','Applicant Name','Stock Out Date','SAP Posting Date'];
 return `<h1>GIGROUP — SAP Goods Issue</h1><p><strong>Document number: ${e(documentNumber)}</strong></p><p>${rows.length} posting rows · Printed: ${e(new Date().toLocaleString())}</p><table><thead><tr>${headings.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr>${[String(i+1).padStart(2,'0'),r.item,r.description,Number(r.qty.toFixed(8)),r.uom,r.department,r.dept,r.line,r.receiver,r.applicant,r.date,r.postingDate].map((v,j)=>`<td${j===1?' class="itemcode"':''}>${e(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><p>Quantities shown are issued under this SAP document only.</p><div class="sap-signature" style="margin:36px 0 0 auto;width:300px;max-width:100%;text-align:right;break-inside:avoid;page-break-inside:avoid"><p style="font-size:12px;line-height:1.8"><strong>Warehouse Administrator <span lang="ar" dir="rtl">مسؤل المخازن</span></strong></p><p style="margin-top:24px;font-size:12px">Signature: <span style="display:inline-block;width:180px;border-bottom:1px solid currentColor">&nbsp;</span></p></div>`;
}
function openSAPGoodsIssueReport(){
 let dialog=$('sapgoodsissuereport');
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='sapgoodsissuereport';dialog.setAttribute('aria-label','SAP Goods Issue report');dialog.style.cssText='width:min(1200px,96vw);max-height:92vh';
  dialog.innerHTML='<h2>SAP Goods Issue report</h2><label for="sapreportdocument">SAP Goods Issue document number</label><select id="sapreportdocument"></select><p id="sapreportmessage" role="status"></p><div id="sapreportpreview" style="overflow:auto;max-height:55vh"></div><div class="actions"><button type="button" id="sapreportclose">Close</button><button type="button" class="primary" id="sapreportprint">Print / Save PDF</button></div>';
  document.body.appendChild(dialog);
  $('sapreportdocument').onchange=renderSAPGoodsIssueReport;
  $('sapreportclose').onclick=()=>dialog.close();
  $('sapreportprint').onclick=printSAPGoodsIssueReport;
 }
 const documents=new Map();
 for(const tx of db.tx||[])for(const posting of tx.sapPostings||[]){const key=sapDocumentKey(posting.document);if(key)documents.set(key,String(posting.document).trim())}
 $('sapreportdocument').innerHTML='<option value="">Select document number</option>'+[...documents].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).map(([key,label])=>`<option value="${sapReportEscape(key)}">${sapReportEscape(label)}</option>`).join('');
 renderSAPGoodsIssueReport();dialog.showModal();
}
function renderSAPGoodsIssueReport(){
 const number=$('sapreportdocument').value,rows=sapGoodsIssueRows(db,number);
 $('sapreportprint').disabled=!rows.length;
 $('sapreportmessage').textContent=number?(rows.length?`${rows.length} SAP posting rows. Physical stock stays unchanged.`:'No recorded SAP postings found for this document.'):'Select a saved document number. Imports without a document number cannot be listed here.';
 $('sapreportpreview').innerHTML=rows.length?sapGoodsIssueMarkup(number,rows):'';
}
function printSAPGoodsIssueReport(){
 const number=$('sapreportdocument').value,rows=sapGoodsIssueRows(db,number);if(!rows.length)return;
 const popup=window.open('','_blank');
 if(!popup){$('sapreportmessage').textContent='Allow pop-ups for this CRM, then select Print / Save PDF again.';return}
 popup.opener=null;
 popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GIGROUP Goods Issue ${sapReportEscape(number)}</title><style>body{font:12px Arial,sans-serif;color:#111;background:#fff;margin:24px}h1{font-size:22px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#eef2f4}.itemcode{white-space:nowrap}thead{display:table-header-group}tr{break-inside:avoid}button{padding:12px 20px;cursor:pointer}@media print{@page{size:A4 landscape;margin:10mm}body{margin:0;font-size:9px}h1{font-size:18px}th,td{padding:4px}button{display:none}}</style></head><body><button onclick="window.print()">Print / Save PDF</button>${sapGoodsIssueMarkup(number,rows)}</body></html>`);
 popup.document.close();popup.focus();
}
if(typeof document!=='undefined' && typeof document.createElement==='function' && typeof MutationObserver==='function'){
 const anchor=document.getElementById('sappendingexport');
 if(anchor){const button=document.createElement('button');button.id='sapgoodsissuereportbutton';button.type='button';button.textContent='SAP GI Report / Print';button.onclick=openSAPGoodsIssueReport;anchor.after(button);const sync=()=>button.classList.toggle('hidden',anchor.classList.contains('hidden'));sync();new MutationObserver(sync).observe(anchor,{attributes:true,attributeFilter:['class']})}
}

// Add the inventory-only presentation after the existing theme.
if(typeof document!=='undefined' && typeof document.createElement==='function' && document.head){
 const inventoryStyle=document.createElement('link');inventoryStyle.rel='stylesheet';inventoryStyle.href='/inventory-cards.css';document.head.appendChild(inventoryStyle);
}

// Applicant groups are a read-only view of the currently filtered Stock Out rows.
let stockOutApplicantView='cards';
function groupStockOutApplicants(rows){
 const groups=new Map();
 for(const row of rows){
  const key=stockOutFilterKey(row.applicant_name);
  if(!groups.has(key))groups.set(key,{key,name:String(row.applicant_name||'').trim().replace(/\s+/g,' ')||'No applicant name',total:0,pending:0,partial:0,complete:0,other:0,cancelled:0,latest:''});
  const g=groups.get(key);g.total++;
  if(row.cancelledAt)g.cancelled++;
  else{const status=stockOutFilterKey(row.status,true);if(status==='value:pending')g.pending++;else if(status==='value:partial')g.partial++;else if(status==='value:complete')g.complete++;else g.other++}
  if(String(row.date||'')>g.latest)g.latest=String(row.date||'');
 }
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
}
function showStockOutApplicant(key){$('applicantfilter').value=key;stockOutApplicantView='list';renderTable()}
function showAllApplicantCards(){$('applicantfilter').value='all';stockOutApplicantView='cards';renderTable()}
function setStockOutApplicantView(view){stockOutApplicantView=view;renderTable()}
function renderStockOutApplicantCards(){
 const table=$('table');let panel=$('stockoutapplicantview');
 if(page!=='Stock Out'){if(panel)panel.hidden=true;table.classList.remove('applicant-cards-active');return}
 if(!panel){panel=document.createElement('section');panel.id='stockoutapplicantview';table.before(panel)}
 panel.hidden=false;
 const rows=visible(),groups=groupStockOutApplicants(rows),cards=stockOutApplicantView==='cards';
 table.classList.toggle('applicant-cards-active',cards);
 const e=sapReportEscape;
 panel.innerHTML=`<div class="applicant-viewbar"><div><strong>${cards?'Stock Out by applicant':'Stock Out entries'}</strong><small>${groups.length} applicants · ${rows.length} entries matching current filters</small></div><div class="applicant-viewbuttons"><button type="button" data-applicant-view="cards" aria-pressed="${cards}">Applicant cards</button><button type="button" data-applicant-view="list" aria-pressed="${!cards}">Entry list</button>${$('applicantfilter').value!=='all'?'<button type="button" data-all-applicants>All applicants</button>':''}</div></div>`+(cards?`<div class="applicant-card-grid">${groups.map(g=>`<article class="applicant-card"><div class="applicant-card-label">APPLICANT</div><h3>${e(g.name)}</h3><div class="applicant-total"><strong>${g.total}</strong><span>Stock Out entries</span></div><div class="applicant-counts"><span>Pending<strong>${g.pending}</strong></span><span>Partial<strong>${g.partial}</strong></span><span>Complete<strong>${g.complete}</strong></span></div>${g.other||g.cancelled?`<p class="applicant-extra">${g.other?`${g.other} other / no status`:''}${g.other&&g.cancelled?' · ':''}${g.cancelled?`${g.cancelled} cancelled`:''}</p>`:''}<p class="applicant-latest">Latest entry: ${e(g.latest||'—')}</p><button type="button" data-applicant-key="${e(g.key)}">View entries →</button></article>`).join('')}</div>${groups.length?'':'<div class="empty">No applicants match these filters.</div>'}`:'');
 panel.querySelectorAll('[data-applicant-view]').forEach(b=>b.onclick=()=>setStockOutApplicantView(b.dataset.applicantView));
 panel.querySelectorAll('[data-applicant-key]').forEach(b=>b.onclick=()=>showStockOutApplicant(b.dataset.applicantKey));
 const all=panel.querySelector('[data-all-applicants]');if(all)all.onclick=showAllApplicantCards;
}
if(typeof document!=='undefined' && typeof document.createElement==='function' && typeof renderTable==='function'){
 const renderEntries=renderTable;
 renderTable=function(){renderEntries();renderStockOutApplicantCards()};
}

// Shared department maintenance; historical movements retain their saved labels.
const originalDepartmentMaster=typeof departmentMaster==='undefined'?[]:structuredClone(departmentMaster);
let departmentEditIndex=-1,departmentEditSnapshot='';
function companyDepartments(){return db.departments??originalDepartmentMaster}
function syncCompanyDepartments(){
 const master=companyDepartments();
 departmentMaster.splice(0,departmentMaster.length,...structuredClone(master.filter(d=>d.active!==false)));
}
function departmentAdmin(){return typeof crmUser!=='undefined'&&crmUser?.role==='admin'}
function openDepartmentManager(){
 if(!departmentAdmin()){toast('Administrator access required.');return}
 let dialog=$('departmentmanager');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='departmentmanager';dialog.setAttribute('aria-label','Manage departments');dialog.style.cssText='width:min(900px,94vw);max-height:90vh';document.body.appendChild(dialog)}
 dialog.innerHTML='<h2>Manage Departments</h2><p class="importhelp">Changes apply to new selections on all devices. Existing Stock Out records keep their saved department and production line.</p><div class="actions"><button type="button" id="departmentadd">＋ Add department</button><button type="button" id="departmentclose">Close</button></div><div id="departmentlist"></div><form id="departmenteditform" hidden style="border-top:1px solid var(--line);margin-top:16px"><h3 id="departmentedittitle"></h3><label for="departmentdescription">Department description</label><input id="departmentdescription" required maxlength="150"><label for="departmentcode">Department ID</label><input id="departmentcode" required maxlength="60"><label for="departmentlines">Production lines — one per line</label><textarea id="departmentlines" required rows="7"></textarea><label for="departmentactive">Availability</label><select id="departmentactive"><option value="true">Active — available for new entries</option><option value="false">Inactive — keep historical records</option></select><p id="departmenterror" role="alert" style="color:#efaa90"></p><div class="actions"><button type="button" id="departmentcancel">Cancel edit</button><button type="submit" class="primary" id="departmentsave">Save department</button></div></form>';
 $('departmentadd').onclick=()=>editCompanyDepartment(-1);$('departmentclose').onclick=()=>dialog.close();$('departmentcancel').onclick=()=>{$('departmenteditform').hidden=true};$('departmenteditform').onsubmit=saveCompanyDepartment;
 renderDepartmentList();dialog.showModal();
}
function renderDepartmentList(){
 const e=sapReportEscape;
 $('departmentlist').innerHTML=companyDepartments().map((d,i)=>`<div style="padding:15px 0;border-top:1px solid var(--line);overflow-wrap:anywhere"><strong>${e(d.description)}</strong><p class="importhelp">${e(d.id)} · ${d.active===false?'Inactive':'Active'} · ${d.lines.length} production lines</p><details><summary>View production lines</summary><ul>${d.lines.map(l=>`<li>${e(l)}</li>`).join('')}</ul></details><button type="button" data-department-index="${i}" style="margin-top:10px">Edit department / lines</button></div>`).join('')||'<p>No departments. Add the first department above.</p>';
 $('departmentlist').querySelectorAll('[data-department-index]').forEach(b=>b.onclick=()=>editCompanyDepartment(Number(b.dataset.departmentIndex)));
}
function editCompanyDepartment(index){
 departmentEditIndex=index;departmentEditSnapshot=JSON.stringify(companyDepartments());
 const d=companyDepartments()[index]||{description:'',id:'',lines:[],active:true};
 $('departmentedittitle').textContent=index<0?'Add department':'Edit department';$('departmentdescription').value=d.description;$('departmentcode').value=d.id;$('departmentlines').value=d.lines.join('\n');$('departmentactive').value=String(d.active!==false);$('departmenterror').textContent='';$('departmenteditform').hidden=false;$('departmentdescription').focus();
}
async function saveCompanyDepartment(event){
 event.preventDefault();if(!departmentAdmin())return;
 const button=$('departmentsave');button.disabled=true;$('departmenterror').textContent='';
 try{
  if(departmentEditSnapshot!==JSON.stringify(companyDepartments()))throw Error('Department list changed. Close and reopen Manage Departments.');
  const d={description:$('departmentdescription').value.trim(),id:$('departmentcode').value.trim(),lines:$('departmentlines').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),active:$('departmentactive').value==='true'};
  if(!d.description||!d.id||!d.lines.length)throw Error('Enter a description, ID and at least one production line.');
  if(d.lines.length>200||d.lines.some(l=>l.length>150))throw Error('Use up to 200 production lines, each up to 150 characters.');
  if(new Set(d.lines.map(departmentKey)).size!==d.lines.length)throw Error('Production lines must be unique within this department.');
  const list=structuredClone(companyDepartments());
  if(list.some((other,i)=>i!==departmentEditIndex&&(departmentKey(other.id)===departmentKey(d.id)||departmentKey(other.description)===departmentKey(d.description))))throw Error('This department ID or description already exists.');
  if(departmentEditIndex<0)list.push(d);else list[departmentEditIndex]=d;
  const next=structuredClone(db);next.departments=list;await cloudSave(next);syncCompanyDepartments();renderDepartmentList();$('departmenteditform').hidden=true;render();toast('Department saved to company database.');
 }catch(e){$('departmenterror').textContent=e.message}finally{button.disabled=false}
}
if(typeof document!=='undefined'&&typeof document.createElement==='function'&&typeof renderTable==='function'){
 const renderBeforeDepartments=renderTable;
 renderTable=function(){
  syncCompanyDepartments();renderBeforeDepartments();
  let button=$('managedepartmentsbutton');
  if(!button){const menu=document.querySelector('.toolsmenu');if(menu){button=document.createElement('button');button.id='managedepartmentsbutton';button.type='button';button.textContent='Manage Departments';button.onclick=openDepartmentManager;menu.appendChild(button)}}
  if(button)button.hidden=!departmentAdmin();
 };
}

// Close Tools after an action, an outside click, or keyboard dismissal.
if(typeof document!=='undefined' && typeof document.addEventListener==='function'){
 document.addEventListener('click',event=>{
  for(const menu of document.querySelectorAll('.workspace-tools[open]')){
   if(!menu.contains(event.target)||event.target.closest?.('.toolsmenu button, .toolsmenu a'))menu.open=false;
  }
 });
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  for(const menu of document.querySelectorAll('.workspace-tools[open]')){
   const focusInside=menu.contains(document.activeElement);menu.open=false;
   if(focusInside)menu.querySelector('summary')?.focus();
  }
 });
}
