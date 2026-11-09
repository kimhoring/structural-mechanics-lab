'use strict';
/* 페이지 전환(해시 라우팅)과 테마 */
(() => {
  const pages = ['home', 'concept', 'beam', 'truss'];

  function show() {
    const p = (location.hash || '#home').slice(1);
    const page = pages.includes(p) ? p : 'home';
    pages.forEach(id => document.getElementById('page-' + id).classList.toggle('active', id === page));
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
    if (page === 'truss') Truss.refresh();
    window.scrollTo(0, 0);
  }

  const btn = document.getElementById('theme-btn');
  let saved = null;
  try { saved = localStorage.getItem('sm-theme'); } catch (e) { /* 저장소 사용 불가 */ }
  if (saved) document.documentElement.dataset.theme = saved;
  btn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sm-theme', next); } catch (e) { /* 무시 */ }
  });

  Concept.init();
  Beam.init();
  Truss.init();
  window.addEventListener('hashchange', show);
  show();
})();
