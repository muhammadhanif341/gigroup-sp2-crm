// Run in the Console on your OLD CRM page, in the browser containing your records.
// Reads only GIGROUP CRM local data. Downloads a JSON file; no network transmission.
(() => {
  const raw = localStorage.getItem('gigroup-preview-v1');
  if (!raw) throw new Error('No GIGROUP records in this browser on this URL.');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.items) || !Array.isArray(data.tx)) throw new Error('Invalid CRM data.');
  const blob = new Blob([JSON.stringify({format:'gigroup-backup',version:1,exportedAt:new Date().toISOString(),data},null,2)],{type:'application/json'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'GIGROUP-full-backup-' + new Date().toISOString().slice(0,10) + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href),1000);
  console.log('Backup downloaded:',data.items.length,'items,',data.tx.length,'movements.');
})();
