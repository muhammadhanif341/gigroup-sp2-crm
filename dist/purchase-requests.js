let purchaseListVersion = 0;
let purchasePrintRows = new Map();
function purchaseItemsTable(row) {
  const rows=(row.lines || [row]).map(line=>{
    const master=db.items.find(item=>item.id===line.item);
    return `<tr><td>${esc(master ? master.id+' — '+master.name : line.item)}</td><td>${esc(line.qty)}</td><td>${esc(line.uom)}</td></tr>`;
  });
  return `<table><thead><tr><th>Item code / description</th><th>Quantity</th><th>Unit</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}
async function loadPurchases(quiet=false) {
  const version = ++purchaseListVersion;
  const list = $('purchase-list');
  if(!quiet) list.textContent = 'Loading requests…';
  try {
    const {requests} = await crmRequest('purchase-requests');
    if (version !== purchaseListVersion || page !== 'Purchase Requests') return;
    purchasePrintRows=new Map(requests.map(row=>[row.id,row]));
    const canReview = ['admin','manager'].includes(crmUser.role);
    list.innerHTML = requests.map(row => `<article class="member">
      <h3>PR-${esc(row.number)} · ${esc(row.status)}</h3>
      ${purchaseItemsTable(row)}
      <p>${esc(row.reason)}</p><small>Requested by ${esc(row.requester)} · ${esc(new Date(row.created_at).toLocaleDateString())}</small>
      <button type="button" data-print-pr="${esc(row.id)}">Print / Save PDF</button>
      ${row.reviewer ? `<p>Reviewed by ${esc(row.reviewer)} · ${esc(new Date(row.reviewed_at).toLocaleDateString())}</p>` : ''}
      ${canReview && row.status==='Pending' ? `<p><button data-id="${esc(row.id)}" data-decision="Approved">Approve</button> <button data-id="${esc(row.id)}" data-decision="Rejected">Reject</button></p>` : ''}
    </article>`).join('') || '<p>No purchase requests yet.</p>';
  } catch (error) { if(version===purchaseListVersion) list.textContent=error.message; }
}
function newPurchase() {
  const form=$('purchase-form');
  form.reset();
  $('purchase-lines').replaceChildren();
  resetPurchaseDraft();
  form.dataset.id=crypto.randomUUID();
  $('purchase-error').textContent='';
  $('purchase-items').innerHTML=db.items.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');
  $('purchase-dialog').showModal();
}
function showPurchaseDescription(field) {
  const item = db.items.find(entry => entry.id.toUpperCase() === field.value.trim().toUpperCase());
  if (!item) return;
  field.dataset.itemCode = item.id;
  field.value = item.name || item.id;
  field.closest('fieldset').querySelector('[name=uom]').value = item.uom;
}
function purchaseEditor(title, saved) {
  const editor=$('purchase-line-template').content.firstElementChild.cloneNode(true);
  const item=editor.querySelector('[name=item]');
  editor.querySelector('legend').textContent=title;
  if (saved) {
    item.value=saved.label;
    if(saved.code) item.dataset.itemCode=saved.code;
    editor.querySelector('[name=qty]').value=saved.qty;
    editor.querySelector('[name=uom]').value=saved.uom;
  }
  item.oninput=event=>{
    delete item.dataset.itemCode;
    if (!event.inputType || event.inputType==='insertReplacementText') showPurchaseDescription(item);
  };
  item.onchange=()=>{if(!item.dataset.itemCode) showPurchaseDescription(item)};
  return editor;
}
function readPurchaseEditor(editor) {
  for (const field of editor.querySelectorAll('input')) {
    if (field.type!=='number') field.value=field.value.trim();
    if (!field.reportValidity()) return null;
  }
  const item=editor.querySelector('[name=item]');
  return {label:item.value,code:item.dataset.itemCode,qty:Number(editor.querySelector('[name=qty]').value),uom:editor.querySelector('[name=uom]').value};
}
function resetPurchaseDraft() {
  const editor=purchaseEditor('Item details');
  $('purchase-draft').replaceChildren(editor);
  editor.querySelector('input').focus();
}
function purchaseCard(saved) {
  const card=document.createElement('div');
  card.className='pr-card';
  card.purchaseLine=saved;
  const summary=()=>{
    card.innerHTML=`<strong>${esc(saved.label)}</strong><span>${esc(saved.qty)} ${esc(saved.uom)}</span><button type="button" data-edit>Edit</button><button type="button" data-remove>Remove</button>`;
    card.querySelector('[data-remove]').onclick=()=>card.remove();
    card.querySelector('[data-edit]').onclick=()=>{
      const editor=purchaseEditor('Edit item',saved);
      card.replaceChildren(editor);
      const save=document.createElement('button'), cancel=document.createElement('button');
      save.type=cancel.type='button';
      save.textContent='Save changes';cancel.textContent='Cancel edit';
      save.onclick=()=>{
        const revised=readPurchaseEditor(editor);
        if(revised) card.replaceWith(purchaseCard(revised));
      };
      cancel.onclick=summary;
      card.append(save,cancel);
      editor.querySelector('input').focus();
    };
  };
  summary();
  return card;
}
$('purchase-add-line').onclick=()=>{
  const line=readPurchaseEditor($('purchase-draft').firstElementChild);
  if(!line) return;
  $('purchase-lines').append(purchaseCard(line));
  resetPurchaseDraft();
};
$('purchase-form').onsubmit=async event=>{
  event.preventDefault();
  const form=event.target, button=form.querySelector('[type=submit]');
  if(button.disabled) return;
  button.disabled=true;
  try {
    const entries=[];
    for(const card of $('purchase-lines').children) {
      const editor=card.querySelector('fieldset');
      const line=editor ? readPurchaseEditor(editor) : card.purchaseLine;
      if(!line) return;
      entries.push(line);
    }
    const draft=$('purchase-draft').firstElementChild;
    if (!entries.length || Array.from(draft.querySelectorAll('input')).some(field=>field.value || field.validity.badInput)) {
      const line=readPurchaseEditor(draft);
      if(!line) return;
      entries.push(line);
    }
    if(!form.elements.reason.reportValidity()) return;
    const lines=entries.map(line=>({item:line.code || line.label,qty:line.qty,uom:line.uom}));
    const body={id:form.dataset.id,reason:form.elements.reason.value,lines};
    await crmRequest('purchase-requests',{method:'POST',body:JSON.stringify(body)});
    $('purchase-dialog').close();
    await loadPurchases();
  } catch(error){$('purchase-error').textContent=error.message}
  finally {button.disabled=false}
};
$('purchase-list').onclick=async event=>{
  const print=event.target.closest('button[data-print-pr]');
  if(print){printPurchase(purchasePrintRows.get(print.dataset.printPr));return}
  const button=event.target.closest('button[data-decision]');
  if(!button || !window.confirm(button.textContent+' this purchase request?')) return;
  button.disabled=true;
  try {
    await crmRequest('purchase-requests',{method:'PATCH',body:JSON.stringify({id:button.dataset.id,status:button.dataset.decision})});
  } catch(error){toast(error.message)}
  await loadPurchases();
};

function printPurchase(row) {
  if (!row) return;
  const sheet = window.open('', '_blank');
  if (!sheet) { toast('Allow pop-ups to print this request.'); return; }
  sheet.opener = null;

  const date = value => new Date(value).toLocaleDateString('en-GB', {timeZone:'Asia/Riyadh'});
  const fields = [
    ['Request number', 'PR-' + row.number], ['Request date', date(row.created_at)],
    ['Applicant', row.requester], ['Status', row.status],
    ['Reason for purchase', row.reason]
  ];
  if (row.reviewer) fields.push(['Reviewed by', row.reviewer], ['Review date', date(row.reviewed_at)]);
  sheet.document.write(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Purchase Request PR-${esc(row.number)}</title>
    <style>@page{size:A4;margin:18mm}body{max-width:760px;margin:30px auto;padding:0 16px;color:#192830;font:15px/1.6 Arial,sans-serif}h1{margin:4px 0 24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ccd3d6;padding:10px;overflow-wrap:anywhere}th{width:35%}td{white-space:pre-wrap}footer{margin-top:48px}@media print{body{margin:0;padding:0}button{display:none}}</style>
    <strong>GIGROUP STORE DESK</strong><h1>Purchase Request</h1>
    <table>${fields.map(([label,value])=>`<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')}</table>
    ${purchaseItemsTable(row)}
    <footer>Handed to purchaser ____________________ &nbsp; Date ______________</footer>
    <p><button onclick="window.print()">Print / Save PDF</button></p></html>`);
  sheet.document.close();
  sheet.focus();
  sheet.print();
}
