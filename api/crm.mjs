import { timingSafeEqual } from 'node:crypto';
import { backend, member, limit, requestHeaders } from '../lib/backend.mjs';
import { previewHistoryStock, applyHistoryStock } from '../lib/history-stock.mjs';
import { validateTransition } from '../lib/state.mjs';
function error(message, status=400) { const e=Error(message); e.status=status; throw e; }
const json=(res,status,data)=>res.status(status).json(data);
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Vary','Cookie');
  try {
    const url=new URL(req.url,'https://gigroup-sp2-crm.vercel.app'), action=url.searchParams.get('action')||'state';
    const write=!['GET','HEAD'].includes(req.method);
    if (write && req.headers.origin !== process.env.BETTER_AUTH_URL) error('Request origin is not allowed.',403);
    if (write && !String(req.headers['content-type']||'').startsWith('application/json')) error('JSON requests are required.',415);
    const rt=await backend(), {pool,auth}=rt;
    if (action==='health' && req.method==='GET') { await pool.query('SELECT 1'); return json(res,200,{database:'connected',authentication:'ready'}); }
    if (action==='setup' && req.method==='GET') {
      const {rows}=await pool.query("SELECT EXISTS(SELECT 1 FROM crm_members WHERE role='admin') AS ready");
      return json(res,200,{configured:rows[0].ready});
    }
    const body=req.body||{};
    if (action==='setup' && req.method==='POST') {
      await limit(pool,'setup',6);
      const a=Buffer.from(String(body.token||'')), b=Buffer.from(process.env.CRM_SETUP_TOKEN||'');
      if (!b.length || a.length!==b.length || !timingSafeEqual(a,b)) error('Invalid owner setup key.',403);
      const c=await pool.connect();
      try {
        await c.query('SELECT pg_advisory_lock(712834202)');
        const exists=await c.query("SELECT 1 FROM crm_members WHERE role='admin'");
        if(exists.rowCount) error('Owner account is already configured.',409);
        // Sign up is reachable only through this guarded setup or an authenticated administrator.
        const result=await auth.api.signUpEmail({body:{name:body.name,email:body.email,password:body.password}});
        const user=result.user || result.data?.user;
        if(!user?.id) error('Could not create owner account. Use a different email or check the password.',422);
        await c.query("INSERT INTO crm_members(user_id,role) VALUES($1,'admin')",[user.id]);
        return json(res,201,{ok:true});
      } finally { await c.query('SELECT pg_advisory_unlock(712834202)').catch(()=>{}); c.release(); }
    }
    const user=await member(req,rt);
    if(action==='me' && req.method==='GET') return json(res,200,{user});
    if(action==='history-stock') {
      if(user.role!=='admin') error('Administrator access required.',403);
      if(req.method==='GET') {
        const {rows}=await pool.query('SELECT revision,data FROM crm_state WHERE id=1');
        const row=rows[0],batchId=url.searchParams.get('batch');
        return json(res,200,batchId?{revision:row.revision,...previewHistoryStock(row.data,batchId,url.searchParams.get('mode')==='available'?'available':'strict')}:{revision:row.revision,batches:(row.data.movementImports||[]).filter(b=>b.type==='out'&&b.historyOnly===true).map(b=>({id:b.id,file:b.file,time:b.time,added:b.added,stockAppliedAt:b.stockAppliedAt||null,stockPartiallyAppliedAt:b.stockPartiallyAppliedAt||null}))});
      }
      if(req.method==='POST') {
        await limit(pool,'history-stock:'+user.id,8);
        if(!Number.isInteger(body.revision)||typeof body.batchId!=='string')error('Invalid import selection.');
        const c=await pool.connect();
        try {
          await c.query('BEGIN');
          const {rows}=await c.query('SELECT revision,data FROM crm_state WHERE id=1 FOR UPDATE');
          if(rows[0].revision!==body.revision)error('Company stock changed. Preview this import again before applying.',409);
          const applied=applyHistoryStock(rows[0].data,body.batchId,user.id,new Date().toISOString(),body.mode==='available'?'available':'strict');
          const {rows:updated}=await c.query('UPDATE crm_state SET data=$1,revision=revision+1,updated_at=now() WHERE id=1 RETURNING revision',[JSON.stringify(applied.data)]);
          await c.query('INSERT INTO crm_audit(user_id,kind,revision) VALUES($1,$2,$3)',[user.id,'history-stock:'+body.batchId,updated[0].revision]);
          await c.query('COMMIT');return json(res,200,{revision:updated[0].revision,entries:applied.preview.entries});
        } catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
      }
    }
    if(action==='members') {
      if(user.role!=='admin') error('Administrator access required.',403);
      if(req.method==='GET') {
        const {rows}=await pool.query('SELECT u.id,u.name,u.email,m.role,m.active FROM "user" u JOIN crm_members m ON m.user_id=u.id ORDER BY u."createdAt"');
        return json(res,200,{members:rows});
      }
      if(req.method==='POST') {
        await limit(pool,'member:'+user.id,8);
        if(!['manager','storekeeper'].includes(body.role)) error('Select Manager or Storekeeper.');
        const result=await auth.api.signUpEmail({body:{name:body.name,email:body.email,password:body.password}});
        const added=result.user || result.data?.user;
        if(!added?.id) error('Account could not be created. The email may already exist.',422);
        await pool.query('INSERT INTO crm_members(user_id,role) VALUES($1,$2)',[added.id,body.role]);
        return json(res,201,{ok:true});
      }
      if(req.method==='PATCH') {
        if(body.id===user.id) error('You cannot disable your own administrator account.');
        await pool.query("UPDATE crm_members SET active=$1 WHERE user_id=$2 AND role<>'admin'",[body.active===true,body.id]);
        return json(res,200,{ok:true});
      }
    }
    if(action==='state' && req.method==='GET') {
      const {rows}=await pool.query('SELECT revision,data FROM crm_state WHERE id=1');
      if(url.searchParams.get('revision')===String(rows[0].revision)) return json(res,200,{revision:rows[0].revision,unchanged:true});
      return json(res,200,rows[0]);
    }
    if(action==='state' && req.method==='PUT') {
      await limit(pool,'save:'+user.id,45);
      if(!Number.isInteger(body.revision) || !['save','opening','migrate'].includes(body.kind)) error('Invalid save request.');
      const c=await pool.connect();
      try {
        await c.query('BEGIN');
        const {rows}=await c.query('SELECT revision,data FROM crm_state WHERE id=1 FOR UPDATE');
        if(rows[0].revision!==body.revision) error('Another device saved newer records. Reload the current data and retry your entry.',409);
        validateTransition(rows[0].data,body.data,user.role,body.kind);
        const {rows:updated}=await c.query('UPDATE crm_state SET data=$1,revision=revision+1,updated_at=now() WHERE id=1 RETURNING revision',[JSON.stringify(body.data)]);
        await c.query('INSERT INTO crm_audit(user_id,kind,revision) VALUES($1,$2,$3)',[user.id,body.kind,updated[0].revision]);
        await c.query('COMMIT');
        return json(res,200,{revision:updated[0].revision});
      } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    }
    error('Unsupported request.',405);
  } catch(e) {
    const status=Number.isInteger(e.status)?e.status:Number.isInteger(e.statusCode)?e.statusCode:503;
    if(status===503) console.error('CRM request failed',e.code||e.name);
    return json(res,status,{error:status!==503?e.message:'The server could not finish this request. Please retry.'});
  }
}
