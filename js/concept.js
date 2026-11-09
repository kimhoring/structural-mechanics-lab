'use strict';
/* 기초 개념 페이지와 홈 화면의 설명 그림 */

const Concept = (() => {
  const $ = id => document.getElementById(id);
  const T = (g, x, y, s, a = {}) => svgText(g, x, y, s, Object.assign({ 'text-anchor': 'middle', 'font-size': 14 }, a));
  const beam = (g, x1, x2, y, h = 12) => svgEl('rect', { x: x1, y: y - h / 2, width: x2 - x1, height: h, rx: 3, class: 'beam-rect' }, g);

  function hero() {
    const svg = $('hero-fig'); clearSvg(svg);
    const g = svgEl('g', {}, svg);
    const x1 = 50, x2 = 410, by = 92;
    // 분포하중
    svgEl('rect', { x: x1, y: by - 46, width: x2 - x1, height: 34, style: 'fill:var(--load);opacity:.1' }, g);
    svgEl('line', { x1, y1: by - 46, x2, y2: by - 46, style: 'stroke:var(--load);stroke-width:2.5' }, g);
    for (let i = 0; i <= 12; i++) { const x = x1 + (x2 - x1) * i / 12; drawArrow(g, x, by - 46, x, by - 8, { color: 'var(--load)', width: 1.8, head: 7 }); }
    T(g, 230, by - 54, 'w (등분포하중)', { style: 'fill:var(--load)', 'font-weight': 700, 'font-size': 13 });
    // 처진 보
    const path = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40; path.push(`${i ? 'L' : 'M'}${x1 + (x2 - x1) * t},${by + 26 * 16 / 5 * (t - 2 * t ** 3 + t ** 4) * 0.35}`); }
    beam(g, x1, x2, by);
    const p = svgEl('path', { d: path.join(' '), style: 'fill:none;stroke:var(--defl);stroke-width:3;stroke-dasharray:6 5' }, g);
    svgEl('animate', { attributeName: 'opacity', values: '0.2;1;0.2', dur: '2.6s', repeatCount: 'indefinite' }, p);
    svgEl('polygon', { points: `${x1},${by + 6} ${x1 - 12},${by + 26} ${x1 + 12},${by + 26}`, class: 'sup-fill' }, g);
    svgEl('polygon', { points: `${x2},${by + 6} ${x2 - 12},${by + 22} ${x2 + 12},${by + 22}`, class: 'sup-fill' }, g);
    svgEl('circle', { cx: x2 - 6, cy: by + 26, r: 3.5, class: 'sup-fill' }, g);
    svgEl('circle', { cx: x2 + 6, cy: by + 26, r: 3.5, class: 'sup-fill' }, g);
    // SFD
    const sy = 185;
    svgEl('line', { x1, y1: sy, x2, y2: sy, class: 'axis-strong' }, g);
    svgEl('polygon', { points: `${x1},${sy} ${x1},${sy - 30} 230,${sy}`, style: 'fill:var(--pos-fill);stroke:var(--pos);stroke-width:2' }, g);
    svgEl('polygon', { points: `230,${sy} ${x2},${sy + 30} ${x2},${sy}`, style: 'fill:var(--neg-fill);stroke:var(--neg);stroke-width:2' }, g);
    T(g, 20, sy + 5, 'V', { 'font-weight': 800, style: 'fill:var(--pos)' });
    // BMD (인장측 아래)
    const my = 230;
    const mp = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40; mp.push(`${x1 + (x2 - x1) * t},${my + 4 * t * (1 - t) * 50}`); }
    svgEl('polygon', { points: `${x1},${my} ${mp.join(' ')} ${x2},${my}`, style: 'fill:var(--pos-fill);stroke:var(--neg);stroke-width:2' }, g);
    svgEl('line', { x1, y1: my, x2, y2: my, class: 'axis-strong' }, g);
    T(g, 20, my + 5, 'M', { 'font-weight': 800, style: 'fill:var(--neg)' });
    T(g, 230, my + 64, 'Mmax = wL²/8', { 'font-size': 12, class: 'svg-muted' });
    svgEl('line', { x1: 230, y1: sy - 4, x2: 230, y2: my + 50, style: 'stroke:var(--accent);stroke-width:1.5;stroke-dasharray:4 4' }, g);
    T(g, 290, sy - 10, 'V = 0 → M 최대', { 'font-size': 12, style: 'fill:var(--accent)', 'font-weight': 700 });
  }

  function supportsFig() {
    const svg = $('fig-supports'); clearSvg(svg);
    const items = [
      { cx: 150, type: 'roller', title: '롤러 (Roller)', n: '반력 1개', d: '수평 이동·회전 가능, 수직만 막음' },
      { cx: 450, type: 'pin', title: '핀 / 힌지 (Pin)', n: '반력 2개', d: '회전만 가능, 이동은 막음' },
      { cx: 750, type: 'fixed', title: '고정 (Fixed)', n: '반력 3개', d: '이동·회전 모두 막음' },
    ];
    for (const it of items) {
      const g = svgEl('g', {}, svg), by = 80, x = it.cx;
      if (it.type === 'fixed') {
        beam(g, x - 10, x + 120, by);
        svgEl('line', { x1: x - 10, y1: by - 40, x2: x - 10, y2: by + 40, class: 'ground', 'stroke-width': 3 }, g);
        for (let y = by - 38; y <= by + 40; y += 9) svgEl('line', { x1: x - 10, y1: y, x2: x - 20, y2: y - 8, class: 'ground', 'stroke-width': 1.3 }, g);
        drawArrow(g, x + 6, by + 85, x + 6, by + 14, { color: 'var(--react)', width: 3 });
        drawArrow(g, x - 90, by, x - 26, by, { color: 'var(--react)', width: 3 });
        drawArcArrow(g, x - 10, by, 30, false, { color: 'var(--react)', width: 3 });
        T(g, x + 22, by + 76, 'V', { style: 'fill:var(--react)', 'font-weight': 800 });
        T(g, x - 80, by - 8, 'H', { style: 'fill:var(--react)', 'font-weight': 800 });
        T(g, x - 50, by - 34, 'M', { style: 'fill:var(--react)', 'font-weight': 800 });
      } else {
        beam(g, x - 110, x + 110, by);
        if (it.type === 'pin') {
          svgEl('polygon', { points: `${x},${by + 6} ${x - 16},${by + 32} ${x + 16},${by + 32}`, class: 'sup-fill' }, g);
          drawHatch(g, x - 24, by + 32, x + 24);
          drawArrow(g, x - 90, by + 22, x - 22, by + 22, { color: 'var(--react)', width: 3 });
          T(g, x - 80, by + 14, 'H', { style: 'fill:var(--react)', 'font-weight': 800 });
        } else {
          svgEl('polygon', { points: `${x},${by + 6} ${x - 15},${by + 26} ${x + 15},${by + 26}`, class: 'sup-fill' }, g);
          svgEl('circle', { cx: x - 8, cy: by + 31, r: 4.5, class: 'sup-fill' }, g);
          svgEl('circle', { cx: x + 8, cy: by + 31, r: 4.5, class: 'sup-fill' }, g);
          drawHatch(g, x - 24, by + 36, x + 24);
          drawArrow(g, x + 50, by + 30, x + 90, by + 30, { color: 'var(--muted)', width: 1.5, head: 8, dash: '4 3' });
          T(g, x + 70, by + 50, '이동 가능', { 'font-size': 11, class: 'svg-muted' });
        }
        drawArrow(g, x, by + 112, x, by + 46, { color: 'var(--react)', width: 3 });
        T(g, x + 16, by + 104, 'V', { style: 'fill:var(--react)', 'font-weight': 800 });
      }
      T(g, it.cx + (it.type === 'fixed' ? 50 : 0), 20, it.title, { 'font-weight': 800, 'font-size': 16 });
      T(g, it.cx + (it.type === 'fixed' ? 50 : 0), 214, `${it.n} · ${it.d}`, { 'font-size': 13, class: 'svg-muted' });
    }
  }

  function signFig() {
    const svg = $('fig-sign'); clearSvg(svg);
    const g = svgEl('g', {}, svg);
    // 왼쪽: 단면력 부호
    T(g, 200, 22, '(+) 전단력과 (+) 휨모멘트', { 'font-weight': 800, 'font-size': 15 });
    const by = 110;
    svgEl('rect', { x: 30, y: by - 12, width: 130, height: 24, rx: 3, class: 'beam-rect' }, g);
    svgEl('rect', { x: 240, y: by - 12, width: 130, height: 24, rx: 3, class: 'beam-rect' }, g);
    drawArrow(g, 182, by - 52, 182, by - 4, { color: 'var(--pos)', width: 3 });
    drawArrow(g, 218, by + 52, 218, by + 4, { color: 'var(--pos)', width: 3 });
    T(g, 200, by - 58, 'V', { style: 'fill:var(--pos)', 'font-weight': 800 });
    drawArcArrow(g, 160, by, 26, false, { color: 'var(--neg)', width: 3 });
    drawArcArrow(g, 240, by, 26, true, { color: 'var(--neg)', width: 3 });
    T(g, 120, by - 36, 'M', { style: 'fill:var(--neg)', 'font-weight': 800 });
    T(g, 280, by - 36, 'M', { style: 'fill:var(--neg)', 'font-weight': 800 });
    T(g, 95, by + 50, '왼쪽 부분', { 'font-size': 12, class: 'svg-muted' });
    T(g, 305, by + 50, '오른쪽 부분', { 'font-size': 12, class: 'svg-muted' });
    T(g, 200, 220, '잘린 면에서 두 조각은 크기가 같고 방향이 반대인 힘을 주고받습니다', { 'font-size': 12, class: 'svg-muted' });

    // 오른쪽: 웃는 보 / 찡그린 보
    const curve = (cx, cy, up) => {
      const pts = [];
      for (let i = 0; i <= 30; i++) { const t = i / 30 - 0.5; pts.push([cx + t * 180, cy + (up ? -1 : 1) * (0.25 - t * t) * 120]); }
      const top = pts.map(([x, y]) => `${x},${y - 10}`), bot = pts.map(([x, y]) => `${x},${y + 10}`).reverse();
      svgEl('polygon', { points: top.concat(bot).join(' '), class: 'beam-rect' }, g);
      return pts;
    };
    curve(560, 75, false);
    T(g, 560, 30, 'M (+) : 아래로 처짐 · 웃는 모양 ∪', { 'font-weight': 800, style: 'fill:var(--pos)' });
    drawArrow(g, 530, 132, 495, 128, { color: 'var(--tension)', width: 2, head: 8 });
    drawArrow(g, 590, 132, 625, 128, { color: 'var(--tension)', width: 2, head: 8 });
    T(g, 560, 152, '아래쪽: 늘어남 (인장)', { 'font-size': 12, style: 'fill:var(--tension)', 'font-weight': 700 });
    T(g, 560, 65, '위쪽: 눌림 (압축)', { 'font-size': 12, style: 'fill:var(--comp)', 'font-weight': 700 });

    curve(780, 205, true);
    T(g, 780, 150, 'M (−) : 위로 볼록 · 찡그린 모양 ∩', { 'font-weight': 800, style: 'fill:var(--neg)' });
    T(g, 780, 248, '위쪽 인장 · 아래쪽 압축 (캔틸레버, 연속보 지점부)', { 'font-size': 12, class: 'svg-muted' });
  }

  function mini(kind, what) {
    const s = svgEl('svg', { viewBox: '0 0 140 46' });
    const y0 = 23;
    svgEl('line', { x1: 6, y1: y0, x2: 134, y2: y0, class: 'axis-strong', 'stroke-width': 1 }, s);
    const st = c => `fill:none;stroke:${c};stroke-width:2.4;stroke-linejoin:round`;
    if (what === 'load') {
      if (kind === 'none') T(s, 70, 28, '하중 없음', { 'font-size': 12, class: 'svg-muted' });
      if (kind === 'udl') { svgEl('rect', { x: 10, y: 6, width: 120, height: 12, style: 'fill:var(--load);opacity:.15' }, s); for (let x = 10; x <= 130; x += 15) drawArrow(s, x, 6, x, 22, { color: 'var(--load)', width: 1.4, head: 6 }); }
      if (kind === 'point') drawArrow(s, 70, 2, 70, 22, { color: 'var(--load)', width: 2.5, head: 8 });
      if (kind === 'moment') drawArcArrow(s, 70, y0, 11, true, { color: 'var(--defl)', width: 2, head: 7 });
      return s;
    }
    const pts = {
      V: { none: '10,13 130,13', udl: '10,6 130,40', point: '10,12 70,12 70,34 130,34', moment: '10,13 130,13' },
      M: { none: '10,40 130,8', udl: null, point: '10,40 70,8 130,30', moment: '10,30 70,8 70,40 130,16' },
    };
    if (what === 'M' && kind === 'udl') {
      const p = []; for (let i = 0; i <= 20; i++) { const t = i / 20; p.push(`${10 + 120 * t},${38 - 30 * Math.sin(Math.PI * t * 0.9)}`); }
      svgEl('polyline', { points: p.join(' '), style: st('var(--neg)') }, s);
    } else svgEl('polyline', { points: pts[what][kind], style: st(what === 'V' ? 'var(--pos)' : 'var(--neg)') }, s);
    return s;
  }

  function shapeTable() {
    const box = $('shape-table'); box.innerHTML = '';
    const rows = [
      ['none', '하중이 없는 구간', '수평선 (일정)', '1차 직선 (기울어진 선)'],
      ['udl', '등분포하중 구간', '1차 직선 (기울기 = −w)', '2차 포물선 (볼록한 곡선)'],
      ['point', '집중하중 위치', '계단처럼 점프 (하중 크기만큼)', '뾰족하게 꺾임'],
      ['moment', '모멘트 하중 위치', '변화 없음', '계단처럼 점프 (모멘트 크기만큼)'],
    ];
    ['상황', '하중', '전단력도 V', '휨모멘트도 M'].forEach(t => box.insertAdjacentHTML('beforeend', `<div class="th">${t}</div>`));
    for (const [k, name, v, m] of rows) {
      const c0 = document.createElement('div'); c0.innerHTML = `<b>${name}</b>`; box.appendChild(c0);
      const c1 = document.createElement('div'); c1.appendChild(mini(k, 'load')); box.appendChild(c1);
      const c2 = document.createElement('div'); c2.appendChild(mini(k, 'V')); c2.insertAdjacentHTML('beforeend', `<small>${v}</small>`); box.appendChild(c2);
      const c3 = document.createElement('div'); c3.appendChild(mini(k, 'M')); c3.insertAdjacentHTML('beforeend', `<small>${m}</small>`); box.appendChild(c3);
    }
  }

  function deflFig() {
    const svg = $('fig-defl'); clearSvg(svg);
    const g = svgEl('g', {}, svg);
    const draw = (cx, sag, title, w, h, note) => {
      const x1 = cx - 170, x2 = cx + 110, by = 70;
      svgEl('line', { x1, y1: by, x2, y2: by, style: 'stroke:var(--zero);stroke-width:2;stroke-dasharray:6 5' }, g);
      const pts = [];
      for (let i = 0; i <= 30; i++) { const t = i / 30; pts.push(`${x1 + (x2 - x1) * t},${by + sag * Math.sin(Math.PI * t)}`); }
      svgEl('polyline', { points: pts.join(' '), style: 'fill:none;stroke:var(--defl);stroke-width:7;stroke-linecap:round' }, g);
      svgEl('polygon', { points: `${x1},${by + 4} ${x1 - 10},${by + 20} ${x1 + 10},${by + 20}`, class: 'sup-fill' }, g);
      svgEl('polygon', { points: `${x2},${by + 4} ${x2 - 10},${by + 20} ${x2 + 10},${by + 20}`, class: 'sup-fill' }, g);
      drawArrow(g, (x1 + x2) / 2, by - 50, (x1 + x2) / 2, by + sag - 6, { color: 'var(--load)', width: 3 });
      // 단면
      svgEl('rect', { x: cx + 150 - w / 2, y: 80 - h / 2, width: w, height: h, style: 'fill:var(--beam)' }, g);
      T(g, cx + 150, 80 + h / 2 + 18, '단면', { 'font-size': 11, class: 'svg-muted' });
      T(g, cx - 30, 150, title, { 'font-weight': 800 });
      T(g, cx - 30, 172, note, { 'font-size': 12, class: 'svg-muted' });
    };
    draw(220, 46, '눕힌 판: I 작음 → 많이 처짐', 60, 14, 'I = bh³/12 에서 h가 작다');
    draw(660, 10, '세운 판: I 큼 → 조금 처짐', 14, 60, '높이 h가 2배면 I는 8배!');
  }

  function tcFig() {
    const svg = $('fig-tc'); clearSvg(svg);
    const g = svgEl('g', {}, svg);
    // 인장
    T(g, 220, 26, '인장 (Tension) — 당겨서 늘어남', { 'font-weight': 800, style: 'fill:var(--tension)', 'font-size': 16 });
    const bar = svgEl('rect', { x: 120, y: 90, width: 200, height: 18, rx: 4, style: 'fill:var(--tension)' }, g);
    svgEl('animate', { attributeName: 'width', values: '200;225;200', dur: '2s', repeatCount: 'indefinite' }, bar);
    svgEl('animate', { attributeName: 'x', values: '120;107.5;120', dur: '2s', repeatCount: 'indefinite' }, bar);
    drawArrow(g, 100, 99, 30, 99, { color: 'var(--tension)', width: 4, head: 14 });
    drawArrow(g, 340, 99, 410, 99, { color: 'var(--tension)', width: 4, head: 14 });
    T(g, 220, 150, '예: 밧줄, 현수교 케이블, 트러스 하현재', { 'font-size': 13, class: 'svg-muted' });
    T(g, 220, 175, '부재력 부호 (+)', { 'font-size': 13, 'font-weight': 700, style: 'fill:var(--tension)' });
    // 압축
    T(g, 680, 26, '압축 (Compression) — 밀려서 줄어듦', { 'font-weight': 800, style: 'fill:var(--comp)', 'font-size': 16 });
    const bar2 = svgEl('rect', { x: 580, y: 90, width: 200, height: 18, rx: 4, style: 'fill:var(--comp)' }, g);
    svgEl('animate', { attributeName: 'width', values: '200;176;200', dur: '2s', repeatCount: 'indefinite' }, bar2);
    svgEl('animate', { attributeName: 'x', values: '580;592;580', dur: '2s', repeatCount: 'indefinite' }, bar2);
    drawArrow(g, 500, 99, 570, 99, { color: 'var(--comp)', width: 4, head: 14 });
    drawArrow(g, 860, 99, 790, 99, { color: 'var(--comp)', width: 4, head: 14 });
    svgEl('path', { d: 'M580,99 Q680,60 780,99', style: 'fill:none;stroke:var(--comp);stroke-width:1.5;stroke-dasharray:5 4;opacity:.7' }, g);
    T(g, 680, 62, '좌굴(옆으로 휨) 주의', { 'font-size': 12, style: 'fill:var(--comp)' });
    T(g, 680, 150, '예: 기둥, 아치, 트러스 상현재', { 'font-size': 13, class: 'svg-muted' });
    T(g, 680, 175, '부재력 부호 (−)', { 'font-size': 13, 'font-weight': 700, style: 'fill:var(--comp)' });
    svgEl('line', { x1: 450, y1: 40, x2: 450, y2: 200, class: 'axis' }, g);
  }

  /* 홈 화면: 등분포하중 단순보가 하중을 받아 휘는 3D 장면을 반복 재생 */
  function hero3D() {
    if (typeof Viewer3D === 'undefined' || !Viewer3D.has()) return;
    const svg = $('hero-fig');
    const box = document.createElement('div');
    box.className = 'v3d hero-3d';
    box.innerHTML = '<div class="v3d-legend"><span>압축</span><i class="cbar"></i><span>인장</span></div><div class="v3d-hint">단순보 · 등분포하중 · 드래그해서 돌려 보세요</div>';
    svg.replaceWith(box);
    const b = Beam3D.make(box);
    if (!b) return;
    const L = 10, w = 5, EI = 48585;
    const nodes = [], defl = [];
    for (let i = 0; i <= 100; i++) { const x = L * i / 100; nodes.push(x); defl.push(-w * x * (L ** 3 - 2 * L * x * x + x ** 3) / (24 * EI) * 1000); }
    const model = {
      L, nodes, defl, Rmax: 25, Mabs: w * L * L / 8, sec: { type: 'H', h: 400, B: 200 },
      sups: [{ x: 0, type: 'pin', R: 25, Mr: 0 }, { x: L, type: 'roller', R: 25, Mr: 0 }],
      loads: [{ type: 'dist', x1: 0, x2: L, w1: w, w2: w }],
      deflAt: x => -w * x * (L ** 3 - 2 * L * x * x + x ** 3) / (24 * EI) * 1000,
      Mat: x => w * x * (L - x) / 2,
    };
    b.update(model, { animate: true });
    const home = $('page-home');
    const kick = () => { if (home.classList.contains('active')) { b.start(); } };
    setInterval(() => { if (home.classList.contains('active') && !document.hidden) { b.play(); } }, 5200);
    window.addEventListener('hashchange', kick);
    setTimeout(kick, 0); // 첫 페이지 표시(app.js) 이후에 시작
  }

  function init() { hero(); hero3D(); supportsFig(); signFig(); shapeTable(); deflFig(); tcFig(); }
  return { init };
})();
