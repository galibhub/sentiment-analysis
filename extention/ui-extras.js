(() => {
  const $ = (id) => document.getElementById(id);
  const input = $('maxComments');
  const chips = document.querySelectorAll('.chip');

  const syncChips = () =>
    chips.forEach((c) => c.classList.toggle('active', c.dataset.v === String(input.value)));

  chips.forEach((c) =>
    c.addEventListener('click', () => {
      input.value = c.dataset.v;
      syncChips();
    })
  );

  input.addEventListener('input', syncChips);
  input.addEventListener('change', () => {
    let v = parseInt(input.value, 10);
    if (isNaN(v)) v = 1000;
    input.value = Math.min(5000, Math.max(1, v));
    syncChips();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('analyze').click();
  });
  syncChips();

  // Live percentages next to the donut (watches the count cards popup.js updates)
  const count = (id) => parseInt(($(id).textContent || '0').replace(/\D/g, ''), 10) || 0;
  const update = () => {
    const vals = { pos: count('pos'), neu: count('neu'), neg: count('neg') };
    const total = vals.pos + vals.neu + vals.neg;
    Object.entries(vals).forEach(([k, v]) => {
      const pct = total ? Math.round((v / total) * 100) : 0;
      $(k + 'Pct').textContent = pct + '%';
      $(k + 'Bar').style.width = pct + '%';
    });
  };
  const obs = new MutationObserver(update);
  ['pos', 'neu', 'neg'].forEach((id) =>
    obs.observe($(id), { childList: true, characterData: true, subtree: true })
  );
  update();

  // Theme colour follows the dominant sentiment (green / red / grey)
  const setTheme = () => {
    const mood = ($('mood').textContent || '').toLowerCase();
    let theme = ['positive', 'negative', 'neutral'].find((t) => mood.includes(t));
    if (!theme) {
      const p = count('pos'), n = count('neu'), g = count('neg');
      if (p + n + g === 0) return;
      theme = p >= n && p >= g ? 'positive' : g >= n ? 'negative' : 'neutral';
    }
    document.body.dataset.theme = theme;
  };
  ['mood', 'pos', 'neu', 'neg'].forEach((id) =>
    new MutationObserver(setTheme).observe($(id), { childList: true, characterData: true, subtree: true })
  );
  $('analyze').addEventListener('click', () => delete document.body.dataset.theme);
})();