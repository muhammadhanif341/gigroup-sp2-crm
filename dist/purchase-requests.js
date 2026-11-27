let purchaseListVersion = 0;
async function loadPurchases() {
  const version = ++purchaseListVersion;
  const list = $('purchase-list');
  list.textContent = 'Loading requests…';
  try {
    const {requests} = await crmRequest('purchase-requests');
    if (version !== purchaseListVersion || page !== 'Purchase Requests') return;
    const canReview = ['admin','manager'].includes(crmUser.role);
    list.innerHTML = requests.map(row => `<article class="member">
      <h3>PR-${esc(row.number)} · ${esc(row.item)}</h3>
      <p>${esc(row.qty)} ${esc(row.uom)} · <strong>${esc(row.status)}</strong></p>
      <p>${esc(row.reason)}</p><small>Requested by ${esc(row.requester)} · ${esc(new Date(row.created_at).toLocaleDateString())}</small>
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
  const button=event.target.closest('button[data-decision]');
  if(!button || !window.confirm(button.textContent+' this purchase request?')) return;
  button.disabled=true;
  try {
    await crmRequest('purchase-requests',{method:'PATCH',body:JSON.stringify({id:button.dataset.id,status:button.dataset.decision})});
  } catch(error){toast(error.message)}
  await loadPurchases();
};
