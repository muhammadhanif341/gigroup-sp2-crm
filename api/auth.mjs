import { toNodeHandler } from 'better-auth/node';
import { backend } from '../lib/backend.mjs';
export const config={api:{bodyParser:false}};
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const path=new URL(req.url,'https://gigroup-sp2-crm.vercel.app').pathname;
  if(!['/api/auth/sign-in/email','/api/auth/sign-out','/api/auth/get-session','/api/auth/change-password','/api/auth/ok'].includes(path)) return res.status(404).json({error:'Not available. Ask your administrator for an account.'});
  try { const {auth}=await backend(); return await toNodeHandler(auth)(req,res); }
  catch { return res.status(503).json({error:'Authentication is temporarily unavailable. Please retry.'}); }
}
