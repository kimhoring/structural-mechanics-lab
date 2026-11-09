'use strict';
/* 앱 셸: 해시 라우팅, 진도 기록, 사이드바, 테마 */
(() => {
  const $ = id => document.getElementById(id);
  const PAGES = {
    home: { title: '학습 홈', sub: '순서대로 따라가면 정역학 → 보 → 단면 → 트러스 → 기둥까지 다룹니다' },
    basics: { title: '기초 개념', sub: '지점·반력, 부호 규약, 하중–전단력–모멘트–처짐의 관계', mins: 15, topics: ['정정·부정정', '부호 규약', 'dM/dx = V'] },
    beam: { title: '보 해석', sub: '하중을 끌어 옮기면 반력·SFD·BMD·처짐·3D 변형이 즉시 바뀝니다', mins: 30, topics: ['반력', 'SFD·BMD', '처짐', '부정정보'] },
    section: { title: '단면과 응력', sub: '도심, 단면2차모멘트, 휨응력 σ = My/I, 전단응력 τ = VQ/Ib', mins: 25, topics: ['평행축 정리', '휨응력', '전단응력'] },
    guide: { title: '트러스 읽는 법', sub: '부재 기준·절점 기준으로 인장과 압축 읽기, 절점을 나누는 법과 절단 위치 고르는 법', mins: 20, topics: ['부재 vs 절점', '절점 순서', '절단 규칙'] },
    truss: { title: '트러스', sub: '부재력의 인장·압축, 절점법과 절단법을 단계별로 따라갑니다', mins: 30, topics: ['절점법', '절단법', '0부재', '3D 교량'] },
    column: { title: '기둥 좌굴', sub: '오일러 좌굴하중, 유효좌굴길이, 세장비와 설계 곡선', mins: 20, topics: ['Pcr = π²EI/(KL)²', '유효길이 K', '세장비'] },
    practice: { title: '연습문제', sub: '숫자가 매번 바뀌는 문제로 실력을 확인합니다', mins: 20, topics: ['자동 채점', '풀이 제공'] },
  };
  const ORDER = ['basics', 'beam', 'section', 'guide', 'truss', 'column', 'practice'];
  const DESC = {
    basics: '지점과 반력의 개수, 단면력의 부호, 그리고 하중을 적분하면 전단력, 전단력을 적분하면 모멘트가 된다는 핵심 관계를 그림으로 익힙니다.',
    beam: '단순보·캔틸레버·내민보·부정정보에 하중을 올리고, 3D 모델과 SFD·BMD·처짐 곡선, 단계별 풀이를 함께 봅니다.',
    section: 'H형강·T형·원형 단면의 성질을 평행축 정리 표로 계산하고, 응력 블록으로 휨응력과 전단응력 분포를 확인합니다.',
    guide: '트러스를 부재·절점·조각으로 떼어 놓고, 화살표가 몸 밖으로 나가면 인장, 들어오면 압축이라는 규칙 하나로 읽습니다. 절점 순서 고르기와 절단 위치 고르기를 직접 해 봅니다.',
    truss: '부재 색과 굵기로 인장·압축을 읽고, 절점법은 절점별로, 절단법은 자르는 위치를 바꿔 가며 풀이를 따라갑니다.',
    column: '지지 조건에 따라 좌굴 모양과 하중이 어떻게 달라지는지, 하중이 임계값에 다가갈 때 처짐이 커지는 모습을 봅니다.',
    practice: '반력, 최대 모멘트, 부재력, 단면 성질, 처짐, 좌굴하중 문제를 풀고 자동 채점과 풀이를 확인합니다.',
  };

  let visited = {};
  try { visited = JSON.parse(localStorage.getItem('sm-visited') || '{}') || {}; } catch (e) { visited = {}; }
  const saveVisited = () => { try { localStorage.setItem('sm-visited', JSON.stringify(visited)); } catch (e) { /* 무시 */ } };

  function renderPath() {
    $('path').innerHTML = ORDER.map((k, i) => {
      const p = PAGES[k], done = !!visited[k];
      return `<li class="${done ? 'done' : ''}"><a href="#${k}">
        <span class="num">${done ? '✓' : String(i + 1).padStart(2, '0')}</span>
        <div><h4>${p.title} <span class="status">${done ? '학습함' : `약 ${p.mins}분`}</span></h4>
        <p>${DESC[k]}</p><div class="topics">${p.topics.map(t => `<span>${t}</span>`).join('')}</div></div></a></li>`;
    }).join('');
    const n = ORDER.filter(k => visited[k]).length;
    const pct = Math.round(n / ORDER.length * 100);
    $('progress-pct').textContent = `${pct}%`;
    $('progress-bar').style.width = `${pct}%`;
    const next = ORDER.find(k => !visited[k]);
    const btn = $('continue-btn');
    btn.href = `#${next || 'practice'}`;
    btn.textContent = n === 0 ? '학습 시작하기' : next ? `이어서: ${PAGES[next].title}` : '연습문제 풀기';
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('done', !!visited[a.dataset.page]));
  }

  const refreshers = { beam: () => Beam.refresh(), truss: () => Truss.refresh(), guide: () => Guide.refresh() };

  function show() {
    const h = (location.hash || '#home').slice(1);
    const page = PAGES[h] ? h : 'home';
    Object.keys(PAGES).forEach(id => $('page-' + id).classList.toggle('active', id === page));
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
    $('page-title').textContent = PAGES[page].title;
    $('page-sub').textContent = PAGES[page].sub;
    document.title = page === 'home' ? '구조역학 시각화 랩' : `${PAGES[page].title} · 구조역학 시각화 랩`;
    if (page !== 'home' && !visited[page]) { visited[page] = true; saveVisited(); }
    renderPath();
    if (refreshers[page]) refreshers[page]();
    closeRail();
    window.scrollTo(0, 0);
  }

  // 사이드바 (모바일 서랍)
  const openRail = () => { $('rail').classList.add('open'); $('scrim').classList.add('show'); };
  function closeRail() { $('rail').classList.remove('open'); $('scrim').classList.remove('show'); }
  $('menu-btn').addEventListener('click', openRail);
  $('scrim').addEventListener('click', closeRail);

  // 목차 이동 (해시를 바꾸지 않고 스크롤)
  document.querySelectorAll('[data-jump]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const t = $(a.dataset.jump);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // 테마
  try { const t = localStorage.getItem('sm-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* 무시 */ }
  $('theme-btn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sm-theme', next); } catch (e) { /* 무시 */ }
  });

  const safe = (name, fn) => { try { fn(); } catch (err) { console.error(name, err); } };
  safe('concept', () => Concept.init());
  safe('beam', () => Beam.init());
  safe('section', () => Section.init());
  safe('truss', () => Truss.init());
  safe('guide', () => Guide.init());
  safe('column', () => Column.init());
  safe('quiz', () => Quiz.init());
  window.addEventListener('hashchange', show);
  show();
})();
