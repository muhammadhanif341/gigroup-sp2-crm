(() => {
  const key = 'gigroup.theme';
  function apply(light) {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]').content = light ? '#f5f6f8' : '#111315';
    document.querySelectorAll('[data-dark-mode]').forEach(button => { button.setAttribute('aria-pressed', String(!light)); });
  }
  let initial = false;
  try { initial = localStorage.getItem(key) === 'light'; } catch {}
  apply(initial);
  document.addEventListener('DOMContentLoaded', () => apply(document.documentElement.dataset.theme === 'light'));
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-dark-mode]')) return;
    const light = document.documentElement.dataset.theme !== 'light';
    apply(light);
    try { localStorage.setItem(key, light ? 'light' : 'dark'); } catch {}
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.newValue === 'light');
  });
})();