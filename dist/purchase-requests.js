let purchaseListVersion = 0;
let purchasePrintRows = new Map();
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
      <h3>PR-${esc(row.number)} · ${esc(row.item)}</h3>
      <p>${esc(row.qty)} ${esc(row.uom)} · <strong>${esc(row.status)}</strong></p>
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
  delete form.elements.namedItem('item').dataset.itemCode;
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
  field.form.elements.uom.value = item.uom;
}
const purchaseItemField = $('purchase-form').elements.namedItem('item');
purchaseItemField.oninput = event => {
  delete purchaseItemField.dataset.itemCode;
  if (!event.inputType || event.inputType === 'insertReplacementText') {
    showPurchaseDescription(purchaseItemField);
  }
};
purchaseItemField.onchange = () => {
  if (!purchaseItemField.dataset.itemCode) showPurchaseDescription(purchaseItemField);
};
$('purchase-form').onsubmit=async event=>{
  event.preventDefault();
  const form=event.target, button=form.querySelector('[type=submit]');
  if(button.disabled) return;
  button.disabled=true;
  try {
    const body=Object.fromEntries(new FormData(form));
    body.item=form.elements.namedItem('item').dataset.itemCode || body.item;
    body.id=form.dataset.id; body.qty=Number(body.qty);
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
  const item = db.items.find(entry => entry.id === row.item);
  const date = value => new Date(value).toLocaleDateString('en-GB', {timeZone:'Asia/Riyadh'});
  const fields = [
    ['Request number', 'PR-' + row.number], ['Request date', date(row.created_at)],
    ['Applicant', row.requester], ['Status', row.status],
    ['Item code / description', item ? item.id + ' — ' + item.name : row.item],
    ['Requested quantity', row.qty + ' ' + row.uom], ['Reason for purchase', row.reason]
  ];
  if (row.reviewer) fields.push(['Reviewed by', row.reviewer], ['Review date', date(row.reviewed_at)]);
  sheet.document.write(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Purchase Request PR-${esc(row.number)}</title>
    <style>@page{size:A4;margin:18mm}body{max-width:760px;margin:30px auto;padding:0 16px;color:#192830;font:15px/1.6 Arial,sans-serif}h1{margin:4px 0 24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ccd3d6;padding:10px;overflow-wrap:anywhere}th{width:35%}td{white-space:pre-wrap}footer{margin-top:48px}@media print{body{margin:0;padding:0}button{display:none}}</style>
    <strong>GIGROUP STORE DESK</strong><h1>Purchase Request</h1>
    <table>${fields.map(([label,value])=>`<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')}</table>
    <footer>Handed to purchaser ____________________ &nbsp; Date ______________</footer>
    <p><button onclick="window.print()">Print / Save PDF</button></p></html>`);
  sheet.document.close();
  sheet.focus();
  sheet.print();
}
