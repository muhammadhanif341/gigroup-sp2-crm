import fs from 'node:fs';
const path = 'dist/index.html';
let html = fs.readFileSync(path, 'utf8');
function replaceOnce(pattern, replacement) {
  if (!pattern.test(html)) throw Error('Unexpected Stock In form structure: ' + pattern);
  html = html.replace(pattern, replacement);
}
if (!html.includes('function openInventoryItemFromReceipt()')) {
  replaceOnce(/(<button\b[^>]*\bid="additembutton"[^>]*>)[^<]*(<\/button>)/, '$1+ Add New Item$2');
  const marker = "<p class=\"formintro\">${type==='in'";
  if (!html.includes(marker)) throw Error('Stock In entry form missing');
  html = html.replace(marker, () => "${type==='in'?'<button type=\"button\" onclick=\"openInventoryItemFromReceipt()\">+ Add New Item</button>':''}" + marker);
  replaceOnce(/function openForm\(type,id\)/, () => "function openInventoryItemFromReceipt() {\n  const modal = $('modal');\n  const receipt = Object.fromEntries(new FormData($('entryform')));\n  const previousEditId = editingTxId;\n  const previousSnapshot = editingSnapshot;\n  let savedItemCode = '';\n  const rememberSave = event => { savedItemCode = event.detail; };\n  modal.addEventListener('inventory-item-created', rememberSave);\n  modal.addEventListener('close', () => {\n    modal.removeEventListener('inventory-item-created', rememberSave);\n    openForm('in');\n    editingTxId = previousEditId;\n    editingSnapshot = previousSnapshot;\n    const fields = $('entryform').elements;\n    for (const name of ['date','qty','note']) fields.namedItem(name).value = receipt[name] ?? '';\n    $('f-item-suffix').value = savedItemCode ? savedItemCode.slice(5) : receipt.item_suffix;\n    syncManualItem();\n    $('f-qty').focus();\n  }, {once:true});\n  openForm('item');\n  $('f-code-suffix').value = receipt.item_suffix || '';\n  $('f-code-suffix').focus();\n}" + '\nfunction openForm(type,id)');
  replaceOnce(/await save\(\);\$\('modal'\)\.close\(\);render\(\);toast\('Entry saved to company database'\)/, () => "await save();if(formType==='item')$('modal').dispatchEvent(new CustomEvent('inventory-item-created',{detail:d.code}));$('modal').close();render();toast('Entry saved to company database')");
  fs.writeFileSync(path,html);
}
