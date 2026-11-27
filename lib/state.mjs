import { validateDepartmentSelection, validateDepartmentMaster, departmentMaster } from './departments.mjs';
import { isDeepStrictEqual } from 'node:util';
export const emptyState = () => ({ items: [], tx: [] });
const fail = message => { const e = Error(message); e.status = 422; throw e; };
const locked = t => /^(complete|completed)$/i.test(String(t.status || '').trim()) || (Number(t.sapIssuedQty) > 0 && Number(t.sapIssuedQty) >= t.qty - 1e-8);
export function validateState(data) {
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.tx) || data.items.length > 30000 || data.tx.length > 60000) fail('Invalid inventory or movement list.');
  if(data.departments!==undefined){try{validateDepartmentMaster(data.departments)}catch(e){fail(e.message)}}
  const ids = new Set(), tids = new Set();
  for (const i of data.items) {
    if (!i || typeof i.id !== 'string' || !/^R-SP2[^\s]{1,60}$/i.test(i.id) || ids.has(i.id) || typeof i.name !== 'string' || !Number.isFinite(i.qty) || i.qty < 0 || (i.min != null && (!Number.isFinite(i.min) || i.min < 0))) fail('Invalid or duplicate inventory item.');
    ids.add(i.id);
  }
  for (const t of data.tx) {
    if (!t || typeof t.id !== 'string' || tids.has(t.id) || !ids.has(t.item) || !['in', 'out'].includes(t.type) || !Number.isFinite(t.qty) || t.qty <= 0 || typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isFinite(Date.parse(t.date)) || (t.sapIssuedQty != null && (!Number.isFinite(t.sapIssuedQty) || t.sapIssuedQty < 0 || t.sapIssuedQty > t.qty + 1e-8))) fail('Invalid movement record.');
    tids.add(t.id);
  }
  if (Buffer.byteLength(JSON.stringify(data)) > 3500000) fail('This list is too large for a single save. Contact the administrator.');
}
function contribution(t) { return !t.cancelledAt && t.affectsStock !== false ? (t.type === 'in' ? t.qty : -t.qty) : 0; }
export function validateTransition(previous, next, role, kind) {
  validateState(next);
  if (!['admin', 'manager', 'storekeeper'].includes(role)) fail('Write access denied.');
  if(!isDeepStrictEqual(previous.departments,next.departments)){
    if(role!=='admin')fail('Only the administrator can manage departments.');
    if(previous.departments!==undefined&&next.departments===undefined)fail('Department master cannot be discarded.');
  }
  if (kind === 'migrate') {
    if (role !== 'admin' || previous.items.length || previous.tx.length) fail('Initial transfer requires an empty company database and administrator access.');
    return;
  }
  if (kind === 'opening' && role !== 'admin') fail('Only the administrator can correct opening stock.');
  const items = new Map(next.items.map(i => [i.id, i]));
  for (const i of previous.items) {
    if (!items.has(i.id)) fail('Inventory items cannot be removed by a shared save.');
    if (role === 'storekeeper' && !isDeepStrictEqual({ ...i, qty: 0 }, { ...items.get(i.id), qty: 0 })) fail('Only a manager or administrator can change inventory details.');
  }
  if (role === 'storekeeper' && items.size !== previous.items.length) fail('Only a manager or administrator can add inventory items.');
  const txs = new Map(next.tx.map(t => [t.id, t])), delta = new Map();
  const previousTxById=new Map(previous.tx.map(t=>[t.id,t]));
  for(const t of next.tx){const old=previousTxById.get(t.id);if(t.type==='out'&&(!old?!t.importBatch:['dept','department_id','production_line'].some(k=>(old[k]??'')!==(t[k]??'')))){try{validateDepartmentSelection(t,old,next.departments??departmentMaster)}catch(e){fail(e.message)}}}
  for (const old of previous.tx) {
    const current = txs.get(old.id);
    if (!current) fail('Movement records cannot be deleted. Cancel an unlocked entry instead.');
    if ((locked(old) || old.cancelledAt) && !isDeepStrictEqual(old, current)) fail('Complete or cancelled entries are locked.');
    if (old.type !== current.type || old.affectsStock !== current.affectsStock) fail('Movement type and historical stock mode cannot be changed.');
    if ((old.sapIssuedQty || 0) > (current.sapIssuedQty || 0)) fail('SAP posted quantity cannot decrease.');
    if (old.sapIssuedQty > 0 && (current.cancelledAt || current.item !== old.item || current.department_id !== old.department_id || current.uom !== old.uom)) fail('SAP posted entries cannot change item, department or UOM, or be cancelled.');
    if (role === 'storekeeper' && !isDeepStrictEqual(old, current)) fail('A manager or administrator must edit, cancel or complete existing entries.');
    delta.set(old.item, (delta.get(old.item) || 0) - contribution(old));
  }
  const oldIds=new Set(previous.tx.map(t=>t.id));
  for (const t of next.tx) {
    if(!oldIds.has(t.id)&&t.affectsStock===false) fail('New Stock In/Out imports must update physical stock. Refresh the app and import again.');
    delta.set(t.item, (delta.get(t.item) || 0) + contribution(t));
  }
  if (kind !== 'opening') for (const i of previous.items) {
    if (Math.abs(items.get(i.id).qty - i.qty - (delta.get(i.id) || 0)) > 1e-7) fail('Physical stock must match its recorded movements. Use opening correction for a reviewed adjustment.');
  }
}
