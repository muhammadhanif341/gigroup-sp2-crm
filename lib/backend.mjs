import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
let runtime;
export function backend() {
  if (runtime) return runtime;
  runtime = initialize().catch(e => { runtime = null; throw e; });
  return runtime;
}
async function initialize() {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) throw Error('Database or authentication configuration is missing.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 12000, idleTimeoutMillis: 15000 });
  pool.on('error', () => console.error('Database connection interrupted.'));
  const auth = betterAuth({
    database: pool,
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: false },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 40 },
    advanced: { useSecureCookies: true },
  });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(712834201)');
    const migrations = await getMigrations(auth.options);
    await migrations.runMigrations();
    await client.query(`CREATE TABLE IF NOT EXISTS crm_state (id integer PRIMARY KEY CHECK (id=1), revision integer NOT NULL DEFAULT 0, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO crm_state(id,data) VALUES(1,'{"items":[],"tx":[]}') ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS crm_members (user_id text PRIMARY KEY, role text NOT NULL CHECK(role IN ('admin','manager','storekeeper')), active boolean NOT NULL DEFAULT true);
      DO $migration$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm_members'::regclass AND conname='crm_members_role_check' AND position('applicant' in pg_get_constraintdef(oid))=0) THEN
          ALTER TABLE crm_members DROP CONSTRAINT crm_members_role_check;
          ALTER TABLE crm_members ADD CONSTRAINT crm_members_role_check CHECK(role IN ('admin','manager','storekeeper','applicant'));
        END IF;
      END $migration$;
      CREATE TABLE IF NOT EXISTS crm_audit (id bigserial PRIMARY KEY, user_id text, kind text NOT NULL, revision integer, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS crm_purchase_requests (id uuid PRIMARY KEY, number bigserial UNIQUE NOT NULL,
        item text NOT NULL, qty numeric NOT NULL CHECK(qty>0), uom text NOT NULL, reason text NOT NULL,
        requester_id text NOT NULL, requester text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected')), reviewer text, reviewed_at timestamptz);
      CREATE TABLE IF NOT EXISTS crm_limits (key text PRIMARY KEY, bucket bigint NOT NULL, count integer NOT NULL);
    `);
  } finally { await client.query('SELECT pg_advisory_unlock(712834201)').catch(() => {}); client.release(); }
  return { pool, auth };
}
export function requestHeaders(req) {
  const h = new Headers();
  for (const [k,v] of Object.entries(req.headers)) if (v != null) h.set(k, Array.isArray(v) ? v.join(', ') : v);
  return h;
}
export async function member(req, runtime) {
  const session = await runtime.auth.api.getSession({ headers: requestHeaders(req) });
  if (!session) { const e = Error('Please sign in.'); e.status = 401; throw e; }
  const { rows } = await runtime.pool.query('SELECT role FROM crm_members WHERE user_id=$1 AND active=true', [session.user.id]);
  if (!rows.length) { const e = Error('Your account does not have company access.'); e.status = 403; throw e; }
  return { id: session.user.id, name: session.user.name, email: session.user.email, role: rows[0].role };
}
export async function limit(pool, key, max) {
  const window = Math.floor(Date.now() / 60000);
  const { rows } = await pool.query('INSERT INTO crm_limits(key,bucket,count) VALUES($1,$2,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN crm_limits.bucket=$2 THEN crm_limits.count+1 ELSE 1 END, bucket=$2 RETURNING count', [key, window]);
  if (rows[0].count > max) { const e = Error('Too many attempts. Please wait a minute.'); e.status = 429; throw e; }
}
