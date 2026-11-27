import { validateState } from './state.mjs';
const round=n=>Math.round((n+Number.EPSILON)*1e8)/1e8;
const fail=message=>{const e=Error(message);e.status=422;throw e};
export function previewHistoryStock(data,id,mode='strict'){
 if(!['strict','available'].includes(mode))fail('Invalid deduction mode.');
 const batch=(data.movementImports||[]).find(b=>b.id===id);
 if(!batch||batch.type!=='out'||batch.historyOnly!==true)fail('Select an existing history-only Stock Out import.');
 if(batch.stockAppliedAt)fail('Physical stock has already been deducted for this import.');
 const entries=data.tx.filter(t=>t.importBatch===id);
 if(!entries.length||entries.length!==batch.added)fail('Import records are incomplete. No stock was changed.');
 const errors=[],groups=new Map(),skippedEntries=[];let cancelledSkipped=0,alreadyApplied=0;
 const skip=(t,reason)=>skippedEntries.push({id:t.id,item:t.item,quantity:t.qty,reason});
 for(const t of entries){
  if(t.cancelledAt){cancelledSkipped++;skip(t,'Cancelled');continue}
  if(t.type!=='out')fail('Import contains a different movement type.');
  if(t.affectsStock!==false){if(t.affectsStock===true&&t.physicalAppliedAt&&(t.audit||[]).some(a=>a.action==='history-stock-applied')){alreadyApplied++;skip(t,'Already deducted');continue}fail('This batch includes a record that already affects physical stock. Nothing was deducted.')}
  if(!Number.isFinite(t.qty)||t.qty<=0)fail('Invalid imported quantity.');
  if(!groups.has(t.item))groups.set(t.item,{quantity:0,ids:[]});const g=groups.get(t.item);g.quantity=round(g.quantity+t.qty);g.ids.push(t.id);
 }
 const changes=[],skippedItems=[],eligibleIds=[];
 for(const [item,g]of groups){
  const i=data.items.find(x=>x.id===item),after=i?round(i.qty-g.quantity):null;
  const reason=!i?'Inventory item is missing':i.qty<=0?'Zero available stock':after<0?'Insufficient stock for this item’s remaining entries':'';
  if(reason){const skipped={item,description:i?.name||'',uom:i?.uom||'',before:i?.qty??null,quantity:g.quantity,after,reason};skippedItems.push(skipped);for(const t of entries.filter(t=>g.ids.includes(t.id)))skip(t,reason);if(mode==='strict')errors.push(item+': '+reason+'; needs '+g.quantity+'; available '+(i?.qty??'missing')+'.');continue}
  changes.push({item,description:i.name,uom:i.uom,before:i.qty,quantity:g.quantity,after});eligibleIds.push(...g.ids);
 }
 if(!changes.length)errors.push('No eligible stock to deduct. Zero-stock, insufficient and already-deducted entries remain unchanged.');
 return {mode,batch:{id:batch.id,file:batch.file,time:batch.time,added:batch.added},totalEntries:entries.length,entries:eligibleIds.length,eligibleIds,skipped:skippedEntries.length,cancelledSkipped,alreadyApplied,skippedEntries,skippedItems,changes,errors};
}
export function applyHistoryStock(data,id,userId,at=new Date().toISOString(),mode='strict'){
 const preview=previewHistoryStock(data,id,mode);if(preview.errors.length)fail(preview.errors.join('\n'));
 const next=structuredClone(data),selected=new Set(preview.eligibleIds);
 for(const c of preview.changes)next.items.find(i=>i.id===c.item).qty=c.after;
 for(const t of next.tx.filter(t=>selected.has(t.id))){
  const before={id:t.id,item:t.item,qty:t.qty,type:t.type,affectsStock:false,status:t.status};
  t.affectsStock=true;t.physicalAppliedAt=at;
  t.audit=[...(t.audit||[]),{action:'history-stock-applied',at,by:userId,reason:'Existing history import applied to physical stock once.',before,after:{...before,affectsStock:true}}];
 }
 const batch=next.movementImports.find(b=>b.id===id);batch.stockPartiallyAppliedAt=at;batch.stockAppliedBy=userId;
 if(!next.tx.some(t=>t.importBatch===id&&!t.cancelledAt&&t.affectsStock===false))batch.stockAppliedAt=at;
 next.historyStockApplications=[...(next.historyStockApplications||[]),{batchId:id,at,by:userId,mode,changes:preview.changes,entryIds:preview.eligibleIds,entries:preview.entries,skipped:preview.skipped}];
 validateState(next);return {data:next,preview};
}
