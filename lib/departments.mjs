export const departmentMaster=[{"description":"CUPS SECTION","id":"D003","lines":["CUP MOULD INDOMI","CUP MOULD 8-OZ","CUP MOULD 6-OZ","CUP PRINTING INDOMI"]},{"description":"EPS SECTION","id":"D004","lines":["EPS EXPANSSION","EPS BLOCK MOLD","EPS CUTTING","T SHAPE INSERT MOLD","BOILER 3 Ton","BOILER 5 Ton","General"]},{"description":"FILLER SECTION","id":"D005","lines":["FILLER MACH"]},{"description":"FOAM SECTION","id":"D006","lines":["FOAM EXTRUDER","IRWIN MACH 1","IRWIN MACH 2","TONGSHING MACH 1","TONGSHING MACH 2","REC ROOM FOAM","General"]},{"description":"PAPER SECTION","id":"D007","lines":["PAPER CUPS"]},{"description":"PC BOARD SECTION","id":"D008","lines":["POLY CARBONATE MACH"]},{"description":"PE-FOAM SECTION","id":"D009","lines":["EXTRUDER 185MM","OFFLINE LAMINATION","REC PE-FOAM","THICKNESS MACH","AIR COMPR / M"]},{"description":"PRINT SECTION","id":"D010","lines":["FLEXO 4 COLOR","FLEXO 6 COLOR","ROTO 9 COLOR","SLITTER TIWAN","SLITTER CHINA","LAMINATION LINE","SOLVENTLESS LAMINATION","General"]},{"description":"SAND PANEL SECTION","id":"D012","lines":["SAND PANEL MACH"]},{"description":"XPS SECTION","id":"D015","lines":["XPS EXTRUDERDER","REC ROOM XPS","General"]},{"description":"WORK SHOP","id":"Main G2","lines":["AIR COMPR GA90 / H","AIR COMPR GA110 / H","G PACK WSHOP"]},{"description":"GRNERAL ALL","id":"G&A","lines":["ادارية وبيعية جدة 2 & 3"]}];
export const departmentKey=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
export function validateDepartmentSelection(value,previous,master=departmentMaster){
 if(previous&&['dept','department_id','production_line'].every(k=>(value[k]??'')===(previous[k]??'')))return value;
 const dep=master.find(d=>d.active!==false&&departmentKey(d.description)===departmentKey(value.dept));
 if(!dep)throw Error('Select a department description from the company list.');
 if(departmentKey(value.department_id)!==departmentKey(dep.id))throw Error('Department ID does not match the selected department.');
 const line=dep.lines.find(l=>departmentKey(l)===departmentKey(value.production_line));
 if(!line)throw Error('Select a production line belonging to the selected department.');
 return {dept:dep.description,department_id:dep.id,production_line:line};
}

export function validateDepartmentMaster(master){
 if(!Array.isArray(master)||master.length>500)throw Error('Invalid department list (maximum 500).');
 const ids=new Set(),names=new Set();
 const valid=(v,max)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=max;
 for(const d of master){
  if(!d||!valid(d.id,60)||!valid(d.description,150)||!Array.isArray(d.lines)||!d.lines.length||d.lines.length>200||(d.active!==undefined&&typeof d.active!=='boolean'))throw Error('Each department needs an ID, description and 1–200 production lines.');
  if(ids.has(departmentKey(d.id))||names.has(departmentKey(d.description)))throw Error('Department IDs and descriptions must be unique.');
  ids.add(departmentKey(d.id));names.add(departmentKey(d.description));const lines=new Set();
  for(const line of d.lines){if(!valid(line,150)||lines.has(departmentKey(line)))throw Error('Production lines must be non-empty and unique within a department.');lines.add(departmentKey(line))}
 }
}
