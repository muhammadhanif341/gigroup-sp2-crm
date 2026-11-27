import {createHash,timingSafeEqual} from 'node:crypto';
const allowedHash='92fe4fa182307a73eb08909d3ed403bac0ef674d11c4b3d206e973e5ba7d77cf';
export const shareExpiresAt=1795199650161;
export function shareAllowed(token,now=Date.now()){
 if(now>=shareExpiresAt)return false;
 if(typeof token!=='string'||token.length>200)return false;
 return timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(allowedHash,'hex'));
}
export function shareData(data){
 const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
 return {items:(data.items||[]).map(i=>pick(i,['id','name','qty','uom','location','min'])),tx:(data.tx||[]).map(t=>pick(t,['id','item','description','type','qty','uom','date','dept','department_id','production_line','person','applicant_name','status','cancelledAt','sapIssuedQty']))};
}
