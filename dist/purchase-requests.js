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
  addPurchaseLine();
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
function numberPurchaseLines() {
  const lines=$('purchase-lines').children;
  Array.from(lines).forEach((line,index)=>{
    line.querySelector('legend').textContent='Item '+(index+1);
    line.querySelector('[data-remove-line]').hidden=lines.length===1;
  });
}
function addPurchaseLine() {
  const line=$('purchase-line-template').content.firstElementChild.cloneNode(true);
  const field=line.querySelector('[name=item]');
  field.oninput=event=>{
    delete field.dataset.itemCode;
    if (!event.inputType || event.inputType==='insertReplacementText') showPurchaseDescription(field);
  };
  field.onchange=()=>{if(!field.dataset.itemCode) showPurchaseDescription(field)};
  line.querySelector('[data-remove-line]').onclick=()=>{line.remove();numberPurchaseLines()};
  $('purchase-lines').append(line);
  numberPurchaseLines();
  field.focus();
}
$('purchase-add-line').onclick=addPurchaseLine;
$('purchase-form').onsubmit=async event=>{
  event.preventDefault();
  const form=event.target, button=form.querySelector('[type=submit]');
  if(button.disabled) return;
  button.disabled=true;
  try {
    const lines=Array.from($('purchase-lines').children,line=>{
      const item=line.querySelector('[name=item]');
      return {item:item.dataset.itemCode || item.value,qty:Number(line.querySelector('[name=qty]').value),uom:line.querySelector('[name=uom]').value};
    });
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
