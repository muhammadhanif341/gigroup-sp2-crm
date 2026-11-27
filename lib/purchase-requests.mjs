const invalid = (message, status = 422) => { throw Object.assign(new Error(message), {status}); };

export async function purchaseRequests(pool, user, method, body) {
  if (method === 'GET') {
    const own = user.role === 'applicant';
    const {rows} = await pool.query('SELECT * FROM crm_purchase_requests' +
      (own ? ' WHERE requester_id=$1' : '') + ' ORDER BY number DESC', own ? [user.id] : []);
    return {requests: rows};
  }
  if (!['POST','PATCH'].includes(method)) invalid('Unsupported request.', 405);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.id)) invalid('Invalid request ID.');
  if (method === 'PATCH') {
    if (!['admin','manager'].includes(user.role)) invalid('Manager approval required.', 403);
    if (!['Approved','Rejected'].includes(body.status)) invalid('Choose Approve or Reject.');
    const result = await pool.query(`UPDATE crm_purchase_requests SET status=$2, reviewer=$3, reviewed_at=now()
      WHERE id=$1 AND status='Pending' RETURNING number`, [body.id,body.status,user.name]);
    if (!result.rowCount) invalid('Request already reviewed or unavailable. Refresh the list.',409);
    return {ok:true};
  }
  const text = (key,max) => {
    const value = body[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid('Check ' + key + '.');
    return value.trim();
  };
  const item=text('item',180), uom=text('uom',24), reason=text('reason',500);
  if (!Number.isFinite(body.qty) || body.qty<=0) invalid('Enter a positive quantity.');
  const result = await pool.query(`INSERT INTO crm_purchase_requests(id,item,qty,uom,reason,requester_id,requester)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING number`,
    [body.id,item,body.qty,uom,reason,user.id,user.name]);
  if (!result.rowCount) {
    const existing=await pool.query('SELECT number FROM crm_purchase_requests WHERE id=$1 AND item=$2 AND qty=$3 AND uom=$4 AND reason=$5 AND requester_id=$6',[body.id,item,body.qty,uom,reason,user.id]);
    if (!existing.rowCount) invalid('Request ID already used. Refresh the list.',409);
  }
  return {ok:true};
}
