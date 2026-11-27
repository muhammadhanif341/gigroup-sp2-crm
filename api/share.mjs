import {Pool} from 'pg';
import {shareAllowed,shareData} from '../lib/share-readonly.mjs';
let pool;
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Vary','X-Share-Key');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Read-only access. Changes are not permitted.'})}
 if(!shareAllowed(req.headers['x-share-key']))return res.status(403).json({error:'This viewing link is invalid or has been disabled.'});
 try{
  if(!process.env.DATABASE_URL)throw Error('Database unavailable');
  if(!pool){pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});pool.on('error',()=>{})}
  const {rows}=await pool.query('SELECT data,updated_at FROM crm_state WHERE id=1');
  return res.status(200).json({...shareData(rows[0]?.data||{}),updatedAt:rows[0]?.updated_at});
 }catch{return res.status(503).json({error:'Company data could not load. Please retry.'})}
}
