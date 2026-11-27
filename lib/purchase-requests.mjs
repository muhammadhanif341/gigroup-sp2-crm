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
  const text = (record,key,max) => {
    const value = record?.[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid('Check ' + key + '.');
    return value.trim();
  };
  const reason=text(body,'reason',500);
  const source=body.lines === undefined ? [body] : body.lines;
  if (!Array.isArray(source) || !source.length) invalid('Add at least one item.');
  const lines=source.map(line=>{
    const item=text(line,'item',180), uom=text(line,'uom',24);
    if (!Number.isFinite(line.qty) || line.qty<=0) invalid('Enter a positive quantity for every item.');
    return {item,qty:line.qty,uom};
  });
  const first=lines[0], encoded=JSON.stringify(lines);
  const result=await pool.query(`INSERT INTO crm_purchase_requests(id,item,qty,uom,reason,requester_id,requester,lines)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(id) DO NOTHING RETURNING number`,
    [body.id,first.item,first.qty,first.uom,reason,user.id,user.name,encoded]);
  if (!result.rowCount) {
    const existing=await pool.query(`SELECT number FROM crm_purchase_requests WHERE id=$1 AND reason=$2 AND requester_id=$3
      AND COALESCE(lines,jsonb_build_array(jsonb_build_object('item',item,'qty',qty,'uom',uom)))=$4::jsonb`,
      [body.id,reason,user.id,encoded]);
    if (!existing.rowCount) invalid('Request ID already used. Refresh the list.',409);
  }
  return {ok:true};
}
