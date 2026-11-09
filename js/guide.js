'use strict';
/* 트러스 읽는 법: 부재 기준 / 절점 기준 인장·압축, 절점으로 나누기, 절단 위치 고르기, 화살표 퀴즈.
   화살표 규칙(모든 그림 공통): 화살표는 그 '몸'(부재·절점·조각) 위에 그리고,
   자른 면에서 몸 밖으로 나가면 인장, 몸 안으로 들어가면 압축. */

const Guide = (() => {
  const $ = id => document.getElementById(id);
  const TC = f => Math.abs(f) < 1e-6 ? 0 : f > 0 ? 'T' : 'C';
  const COL = { T: 'var(--tension)', C: 'var(--comp)', 0: 'var(--zero)' };
  const colOf = f => COL[TC(f)];
  const word = f => TC(f) === 'T' ? '인장' : TC(f) === 'C' ? '압축' : '0부재';
  const sub = s => `<sub>${s}</sub>`;
  const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 트윈 (필요할 때만 프레임을 돌림) ---------- */
  const tweens = new Map();
  let rafOn = false;
  function tween(key, from, to, dur, set, draw) {
    if (reduce()) dur = 0;
    tweens.set(key, { from, to, dur, t0: performance.now(), set, draw });
    if (!rafOn) { rafOn = true; requestAnimationFrame(tick); }
  }
  function tick(now) {
    const draws = new Set();
    for (const [k, tw] of tweens) {
      const p = tw.dur ? Math.min(1, (now - tw.t0) / tw.dur) : 1;
      tw.set(tw.from + (tw.to - tw.from) * ease(p));
      draws.add(tw.draw);
      if (p >= 1) tweens.delete(k);
    }
    draws.forEach(d => d());
    if (tweens.size) requestAnimationFrame(tick); else rafOn = false;
  }

  /* 몸 위에 그리는 화살표 (흰 테두리로 굵은 선 위에서도 보이게) */
  function bodyArrow(p, x1, y1, x2, y2, color, o = {}) {
    const g = svgEl('g', { opacity: o.opac ?? 1 }, p);
    const w = o.width || 4, h = o.head || 13;
    drawArrow(g, x1, y1, x2, y2, { color: 'var(--surface)', width: w + 4, head: h + 5 });
    drawArrow(g, x1, y1, x2, y2, { color, width: w, head: h, dash: o.dash });
    return g;
  }
  const label = (p, x, y, s, o = {}) => svgText(p, x, y, s, Object.assign({ 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700 }, o));

  /* 8방향 이름 (수학 좌표 기준 벡터) */
  function dirName(ux, uy) {
    const a = (Math.atan2(uy, ux) * 180 / Math.PI + 360 + 22.5) % 360;
    const i = Math.floor(a / 45);
    return [['오른쪽', '→'], ['오른쪽 위', '↗'], ['위', '↑'], ['왼쪽 위', '↖'], ['왼쪽', '←'], ['왼쪽 아래', '↙'], ['아래', '↓'], ['오른쪽 아래', '↘']][i];
  }

  /* =========================================================
     예제 트러스 (경간 12 m, 패널 4개, 높이 3 m, 하현 절점 하중 10 kN)
     ========================================================= */
  const TYPES = { pratt: '프랫', howe: '하우', warren: '워렌' };
  let model = null, modelType = 'pratt';

  function buildModel(type) {
    const n = 4, d = 3, h = 3, P = 10, nodes = [], members = [];
    const add = (x, y, name) => (nodes.push({ x, y, name }), nodes.length - 1);
    const mem = (a, b) => members.push({ a, b });
    const Lw = [], U = [];
    for (let i = 0; i <= n; i++) Lw[i] = add(i * d, 0, 'L' + i);
    if (type === 'warren') {
      for (let i = 1; i <= n; i++) U[i] = add((i - 0.5) * d, h, 'U' + i);
      for (let i = 0; i < n; i++) mem(Lw[i], Lw[i + 1]);
      for (let i = 1; i < n; i++) mem(U[i], U[i + 1]);
      for (let i = 1; i <= n; i++) { mem(Lw[i - 1], U[i]); mem(U[i], Lw[i]); }
    } else {
      for (let i = 1; i < n; i++) U[i] = add(i * d, h, 'U' + i);
      for (let i = 0; i < n; i++) mem(Lw[i], Lw[i + 1]);
      for (let i = 1; i < n - 1; i++) mem(U[i], U[i + 1]);
      mem(Lw[0], U[1]); mem(U[n - 1], Lw[n]);
      for (let i = 1; i < n; i++) mem(U[i], Lw[i]);
      if (type === 'pratt') { mem(U[1], Lw[2]); mem(U[3], Lw[2]); }
      else { mem(Lw[1], U[2]); mem(Lw[3], U[2]); }
    }
    members.forEach(m => {
      const p = nodes[m.a], q = nodes[m.b];
      m.len = Math.hypot(q.x - p.x, q.y - p.y); m.ux = (q.x - p.x) / m.len; m.uy = (q.y - p.y) / m.len;
      m.name = p.name + q.name;
    });
    const pin = Lw[0], roller = Lw[n];
    const loads = nodes.map((nd, i) => (nd.y === 0 && i !== pin && i !== roller) ? P : 0);
    // 절점 평형 (인장 +)
    const j = nodes.length, m = members.length;
    const A = Array.from({ length: 2 * j }, () => new Array(m + 3).fill(0));
    const b = new Array(2 * j).fill(0);
    members.forEach((mb, k) => {
      A[2 * mb.a][k] += mb.ux; A[2 * mb.a + 1][k] += mb.uy;
      A[2 * mb.b][k] -= mb.ux; A[2 * mb.b + 1][k] -= mb.uy;
    });
    A[2 * pin][m] = 1; A[2 * pin + 1][m + 1] = 1; A[2 * roller + 1][m + 2] = 1;
    nodes.forEach((nd, i) => { b[2 * i + 1] = loads[i]; });
    const x = solveLinear(A, b);
    const F = x.slice(0, m).map(v => Math.abs(v) < 1e-9 ? 0 : v);
    const R = { Ax: Math.abs(x[m]) < 1e-9 ? 0 : x[m], Ay: x[m + 1], By: x[m + 2] };
    const inc = nodes.map((nd, i) => members.map((mb, k) => k).filter(k => members[k].a === i || members[k].b === i));
    return { type, nodes, members, pin, roller, loads, F, R, inc, P, Fmax: Math.max(...F.map(Math.abs)) };
  }
  const other = (mb, i) => mb.a === i ? mb.b : mb.a;
  /* 절점 i 에서 부재 k 쪽으로 향하는 단위벡터 (수학 좌표) */
  function away(i, k) { const mb = model.members[k], s = mb.a === i ? 1 : -1; return [mb.ux * s, mb.uy * s]; }

  /* 화면 좌표 (레슨 3·4 공통) */
  const SC = 70, OX = 80, OY = 300;
  const X = x => OX + x * SC, Y = y => OY - y * SC;
  const NP = i => [X(model.nodes[i].x), Y(model.nodes[i].y)];

  function drawSupports(g, pp, rp) {
    const [px, py] = pp, [rx, ry] = rp;
    svgEl('polygon', { points: `${px},${py + 6} ${px - 15},${py + 30} ${px + 15},${py + 30}`, class: 'sup-fill' }, g);
    drawHatch(g, px - 22, py + 30, px + 22);
    svgEl('polygon', { points: `${rx},${ry + 6} ${rx - 14},${ry + 24} ${rx + 14},${ry + 24}`, class: 'sup-fill' }, g);
    svgEl('circle', { cx: rx - 7, cy: ry + 29, r: 4.5, class: 'sup-fill' }, g);
    svgEl('circle', { cx: rx + 7, cy: ry + 29, r: 4.5, class: 'sup-fill' }, g);
    drawHatch(g, rx - 22, ry + 34, rx + 22);
  }
  function drawReaction(g, x, y, val, name, anchor) {
    drawArrow(g, x, y + 108, x, y + 42, { color: 'var(--react)', width: 3.2, head: 12 });
    svgText(g, x + (anchor === 'start' ? 9 : -9), y + 104, `${name} = ${fmt(val)} kN`, { 'text-anchor': anchor, 'font-size': 13, 'font-weight': 700, style: 'fill:var(--react)', class: 'val-label' });
  }
  function drawLoad(g, x, y, P) {
    drawArrow(g, x, y + 12, x, y + 64, { color: 'var(--load)', width: 3, head: 11 });
    svgText(g, x, y + 80, `${fmt(P)} kN`, { 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 700, style: 'fill:var(--load)', class: 'val-label' });
  }

  /* =========================================================
     레슨 1: 부재 하나 — 당기면 인장, 밀면 압축
     ========================================================= */
  const g1 = { mode: 'T', a: 0 };

  function drawG1() {
    const svg = $('g1-svg'); clearSvg(svg);
    const { mode, a } = g1, s = mode === 'T' ? 1 : -1, col = COL[mode];
    const cx = 450, L0 = 400, len = L0 + s * a * 46, thick = 26 - s * a * 7;
    const x1 = cx - len / 2, x2 = cx + len / 2;
    const fo = Math.min(1, a * 2.5);

    const bar = (g, xa, xb, y, roundL = true, roundR = true) => {
      const r = thick / 2;
      const d = `M ${xa + (roundL ? r : 0)} ${y - r} H ${xb - (roundR ? r : 0)} ${roundR ? `A ${r} ${r} 0 0 1 ${xb - r} ${y + r}` : `V ${y + r}`} H ${xa + (roundL ? r : 0)} ${roundL ? `A ${r} ${r} 0 0 1 ${xa + r} ${y - r}` : `V ${y - r}`} Z`;
      svgEl('path', { d, style: `fill:${col};fill-opacity:.16;stroke:${col};stroke-width:2` }, g);
    };
    const ticks = (g, xa, xb, y, n) => {
      for (let i = 1; i < n; i++) {
        const x = xa + (xb - xa) * i / n;
        svgEl('line', { x1: x, y1: y - thick / 2 + 5, x2: x, y2: y + thick / 2 - 5, style: `stroke:${col};stroke-width:1.6;opacity:.55` }, g);
      }
    };
    const endForces = (g, y) => {
      if (mode === 'T') {
        drawArrow(g, x1 - 6, y, x1 - 82, y, { color: col, width: 4, head: 14 });
        drawArrow(g, x2 + 6, y, x2 + 82, y, { color: col, width: 4, head: 14 });
      } else {
        drawArrow(g, x1 - 86, y, x1 - 8, y, { color: col, width: 4, head: 14 });
        drawArrow(g, x2 + 86, y, x2 + 8, y, { color: col, width: 4, head: 14 });
      }
      label(g, x1 - 46, y - 16, mode === 'T' ? '당김' : '밈', { style: `fill:${col}` });
      label(g, x2 + 46, y - 16, mode === 'T' ? '당김' : '밈', { style: `fill:${col}` });
    };

    // ① 부재 전체
    const y1 = 96;
    svgText(svg, 24, 34, '부재 전체', { 'font-size': 14, 'font-weight': 700, class: 'svg-muted' });
    svgEl('rect', { x: cx - L0 / 2, y: y1 - 13, width: L0, height: 26, rx: 13, style: 'fill:none;stroke:var(--muted);stroke-width:1.2;stroke-dasharray:5 5;opacity:.7' }, svg);
    const gA = svgEl('g', {}, svg);
    bar(gA, x1, x2, y1); ticks(gA, x1, x2, y1, 12);
    endForces(svgEl('g', { opacity: fo }, svg), y1);
    const dl = len - L0;
    if (Math.abs(dl) > 2) {
      const yy = y1 + 36;
      svgEl('line', { x1: cx + L0 / 2, y1: yy - 8, x2: cx + L0 / 2, y2: yy + 8, style: 'stroke:var(--muted);stroke-width:1.2' }, svg);
      svgEl('line', { x1: x2, y1: yy - 8, x2: x2, y2: yy + 8, style: `stroke:${col};stroke-width:1.6` }, svg);
      label(svg, cx + L0 / 2 + dl / 2, yy + 24, mode === 'T' ? '늘어남' : '줄어듦', { 'font-size': 12.5, style: `fill:${col}` });
      label(svg, cx - L0 / 2 + 70, yy + 24, '점선 = 원래 길이', { 'font-size': 12, 'font-weight': 500, class: 'svg-muted' });
    }

    // ② 가운데를 잘라 보면
    const y2 = 240, gap = 40 * a;
    svgText(svg, 24, 186, '가운데를 잘라 보면', { 'font-size': 14, 'font-weight': 700, class: 'svg-muted' });
    const gB = svgEl('g', {}, svg);
    bar(gB, x1, cx - gap / 2, y2, true, false); ticks(gB, x1, cx - gap / 2, y2, 6);
    bar(gB, cx + gap / 2, x2, y2, false, true); ticks(gB, cx + gap / 2, x2, y2, 6);
    const ef = svgEl('g', { opacity: fo }, svg); endForces(ef, y2);
    const ao = clamp((a - 0.25) / 0.5, 0, 1);
    const fL = cx - gap / 2, fR = cx + gap / 2;
    if (mode === 'T') {
      bodyArrow(svg, fL - 70, y2, fL - 1, y2, col, { opac: ao, width: 3.6 });
      bodyArrow(svg, fR + 70, y2, fR + 1, y2, col, { opac: ao, width: 3.6 });
    } else {
      bodyArrow(svg, fL - 1, y2, fL - 70, y2, col, { opac: ao, width: 3.6 });
      bodyArrow(svg, fR + 1, y2, fR + 70, y2, col, { opac: ao, width: 3.6 });
    }
    svgEl('line', { x1: cx, y1: y2 - 34, x2: cx, y2: y2 + 34, style: 'stroke:var(--muted);stroke-width:1.2;stroke-dasharray:3 4', opacity: ao }, svg);
    label(svg, cx, y2 - 40, '잘린 면', { 'font-size': 12, class: 'svg-muted', opacity: ao });
    const msg = mode === 'T' ? '잘린 면에서 화살표가 몸 밖으로 나갑니다 → 서로 잡아당기는 중 (인장)'
      : '잘린 면에서 화살표가 몸 안으로 들어갑니다 → 서로 밀어내는 중 (압축)';
    label(svg, cx, y2 + 62, msg, { 'font-size': 14, style: `fill:${col}`, opacity: ao });
  }

  function playG1() { tween('g1', 0, 1, 1300, v => { g1.a = v; }, drawG1); }

  /* =========================================================
     레슨 2: 같은 힘, 두 시점 — 부재 기준 vs 절점 기준
     ========================================================= */
  const g2 = { mode: 'T', e: 1, view: 'both' };

  function drawG2() {
    const svg = $('g2-svg'); clearSvg(svg);
    const { mode, e, view } = g2, col = COL[mode], T = mode === 'T';
    const y = 150, R = 24, stub = 72, sh = 64 * e;
    const A = 190 - sh, B = 710 + sh, mA = 190 + stub, mB = 710 - stub;
    const ao = clamp((e - 0.12) / 0.45, 0, 1);
    const dimM = view === 'joint' ? 0.18 : 1, dimJ = view === 'member' ? 0.18 : 1;

    // 다른 부재 토막 (트러스 속 절점임을 표시)
    for (const [cx, angs] of [[A, [125, 215]], [B, [55, -35]]]) {
      for (const d of angs) {
        const r = d * Math.PI / 180;
        svgEl('line', { x1: cx, y1: y, x2: cx + Math.cos(r) * 70, y2: y - Math.sin(r) * 70, style: 'stroke:var(--zero);stroke-width:10;stroke-linecap:round;opacity:.35' }, svg);
      }
    }
    // 부재
    const gm = svgEl('g', { opacity: dimM }, svg);
    svgEl('rect', { x: mA, y: y - 11, width: mB - mA, height: 22, rx: 3, style: `fill:${col};fill-opacity:${0.14 + 0.5 * (1 - e)};stroke:${col};stroke-width:2` }, gm);
    if (T) {
      bodyArrow(gm, mA + 74, y, mA + 3, y, col, { opac: ao });
      bodyArrow(gm, mB - 74, y, mB - 3, y, col, { opac: ao });
    } else {
      bodyArrow(gm, mA + 3, y, mA + 74, y, col, { opac: ao });
      bodyArrow(gm, mB - 3, y, mB - 74, y, col, { opac: ao });
    }
    label(gm, (mA + mB) / 2, y + 5, '부재', { 'font-size': 13, class: 'svg-muted', opacity: ao });
    // 절점 (원 + 부재 토막)
    for (const [cx, dir] of [[A, 1], [B, -1]]) {
      const gj = svgEl('g', { opacity: dimJ }, svg);
      svgEl('rect', { x: dir > 0 ? cx : cx - stub, y: y - 11, width: stub, height: 22, rx: 3, style: `fill:${col};fill-opacity:.14;stroke:${col};stroke-width:2` }, gj);
      svgEl('circle', { cx, cy: y, r: R, style: 'fill:var(--surface);stroke:var(--beam);stroke-width:3' }, gj);
      svgEl('circle', { cx, cy: y, r: 5, style: 'fill:var(--beam)' }, gj);
      const tip = cx + dir * (stub - 3), edge = cx + dir * (R + 3);
      if (T) bodyArrow(gj, edge, y, tip, y, col, { opac: ao, head: 12 });
      else bodyArrow(gj, tip, y, edge, y, col, { opac: ao, head: 12 });
    }
    // 위쪽 설명
    const lo = { 'font-size': 13.5, opacity: Math.max(ao, 0.001) };
    label(svg, A, 52, '절점 A가 받는 힘', Object.assign({ opacity: ao * dimJ }, lo));
    label(svg, (mA + mB) / 2, 52, '부재가 받는 힘', Object.assign({}, lo, { opacity: ao * dimM }));
    label(svg, B, 52, '절점 B가 받는 힘', Object.assign({}, lo, { opacity: ao * dimJ }));
    label(svg, A, 74, T ? `부재 쪽으로 끌려감 ${'→'}` : `부재에 밀려남 ${'←'}`, { 'font-size': 12.5, style: `fill:${col}`, opacity: ao * dimJ });
    label(svg, (mA + mB) / 2, 74, T ? '← 양끝이 바깥으로 당겨짐 →' : '→ 양끝이 안으로 눌림 ←', { 'font-size': 12.5, style: `fill:${col}`, opacity: ao * dimM });
    label(svg, B, 74, T ? `${'←'} 부재 쪽으로 끌려감` : `${'→'} 부재에 밀려남`, { 'font-size': 12.5, style: `fill:${col}`, opacity: ao * dimJ });
    // 틈: 작용·반작용
    const go = clamp((e - 0.55) / 0.35, 0, 1);
    for (const gx of [(A + stub + mA) / 2, (B - stub + mB) / 2]) {
      svgEl('path', { d: `M ${gx - 30} ${y + 30} q 0 12 12 12 h 36 q 12 0 12 -12`, style: 'fill:none;stroke:var(--muted);stroke-width:1.3', opacity: go }, svg);
      label(svg, gx, y + 62, '크기 같고 방향 반대', { 'font-size': 12, 'font-weight': 600, class: 'svg-muted', opacity: go });
      label(svg, gx, y + 78, '(작용·반작용)', { 'font-size': 11.5, 'font-weight': 500, class: 'svg-muted', opacity: go });
    }
    const msg = e < 0.12 ? '붙어 있을 때는 속에서 주고받는 힘이 보이지 않습니다. [떼어 놓기]로 벌려 보세요.'
      : T ? '인장: 부재는 양쪽으로 끌려 늘어나고, 절점은 부재 쪽으로 끌려갑니다. 화살표는 모두 자른 면에서 몸 밖으로.'
        : '압축: 부재는 양쪽에서 눌려 줄어들고, 절점은 부재에 밀려납니다. 화살표는 모두 자른 면에서 몸 안으로.';
    label(svg, 450, 268, msg, { 'font-size': 14, style: e < 0.12 ? 'fill:var(--muted)' : `fill:${col}` });
  }
  function playG2() {
    tween('g2', 0, 0, 0, v => { g2.e = v; }, drawG2);
    setTimeout(() => tween('g2', 0, 1, 1400, v => { g2.e = v; }, drawG2), 350);
  }

  /* =========================================================
     레슨 3: 절점으로 나누기 (게임)
     ========================================================= */
  const g3 = { e: 0, known: new Set(), sel: null, selM: null, msg: null, order: [], hint: null, shake: null, mode: 'goal', goal: null, plan: [] };
  const RJ = 9;

  const unknownOf = i => model.inc[i].filter(k => !g3.known.has(k));
  function solvable(i) {
    const u = unknownOf(i);
    if (u.length === 0 || u.length > 2) return false;
    if (u.length === 2) {
      const a = model.members[u[0]], b = model.members[u[1]];
      if (Math.abs(a.ux * b.uy - a.uy * b.ux) < 1e-6) return false;
    }
    return true;
  }

  function drawG3() {
    const svg = $('g3-svg'); clearSvg(svg);
    const e = g3.e, M = model;
    const g = svgEl('g', {}, svg);
    drawSupports(g, NP(M.pin), NP(M.roller));
    drawReaction(g, ...NP(M.pin), M.R.Ay, 'RA', 'start');
    drawReaction(g, ...NP(M.roller), M.R.By, 'RB', 'end');
    const stubL = RJ + 32 * e, gap = 24 * e;
    const hiJ = g3.selM !== null ? [M.members[g3.selM].a, M.members[g3.selM].b] : [];

    M.members.forEach((mb, k) => {
      const [x1, y1] = NP(mb.a), [x2, y2] = NP(mb.b);
      const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const off = e > 0.02 ? stubL + gap : 0;
      const ax = x1 + ux * off, ay = y1 + uy * off, bx = x2 - ux * off, by = y2 - uy * off;
      const known = g3.known.has(k), f = M.F[k], kd = TC(f);
      const mg = svgEl('g', { class: 'mb', 'data-m': k }, g);
      if (g3.goal === k) svgEl('line', { x1: ax, y1: ay, x2: bx, y2: by, style: 'stroke:var(--violet);stroke-width:24px;stroke-linecap:round;opacity:.3', class: g3.known.has(k) ? null : 'pulse' }, mg);
      if (g3.selM === k) svgEl('line', { x1: ax, y1: ay, x2: bx, y2: by, style: 'stroke:var(--hl);stroke-width:22px;stroke-linecap:round;opacity:.55' }, mg);
      const col = known ? colOf(f) : 'var(--zero)';
      const w = known ? 4 + 6 * Math.abs(f) / M.Fmax : 3;
      svgEl('line', { x1: ax, y1: ay, x2: bx, y2: by, style: `stroke:${col};stroke-width:${w}px;stroke-linecap:round;opacity:${known ? 1 - 0.5 * e : 0.7}` + (!known || !kd ? ';stroke-dasharray:7 6' : '') }, mg);
      svgEl('line', { x1: ax, y1: ay, x2: bx, y2: by, style: 'stroke:transparent;stroke-width:20px' }, mg);
      const vis = Math.hypot(bx - ax, by - ay);
      if (known && kd && e > 0.1) {
        const al = Math.min(32, vis * 0.3), o = clamp((e - 0.1) / 0.4, 0, 1);
        if (kd === 'T') {
          bodyArrow(mg, ax + ux * al, ay + uy * al, ax, ay, col, { opac: o, width: 3, head: 11 });
          bodyArrow(mg, bx - ux * al, by - uy * al, bx, by, col, { opac: o, width: 3, head: 11 });
        } else {
          bodyArrow(mg, ax, ay, ax + ux * al, ay + uy * al, col, { opac: o, width: 3, head: 11 });
          bodyArrow(mg, bx, by, bx - ux * al, by - uy * al, col, { opac: o, width: 3, head: 11 });
        }
      }
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const txt = known ? (kd ? `${fmt(Math.abs(f), 1)} ${kd}` : '0') : '?';
      const wb = txt.length * 7.4 + 10;
      svgEl('rect', { x: mx - wb / 2, y: my - 10, width: wb, height: 20, rx: 6, class: 'badge-bg' }, mg);
      svgText(mg, mx, my + 4.5, txt, { 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, style: `fill:${known ? col : 'var(--unknown)'}` });
    });

    M.nodes.forEach((nd, i) => {
      const [x, y] = NP(i);
      if (M.loads[i]) drawLoad(g, x, y, M.loads[i]);
    });

    M.nodes.forEach((nd, i) => {
      const [x, y] = NP(i);
      const jg = svgEl('g', { class: 'jt' + (g3.shake === i ? ' shake' : ''), 'data-j': i }, g);
      if (g3.hint === i) svgEl('circle', { cx: x, cy: y, r: 22, style: 'fill:var(--hl);opacity:.5', class: 'pulse' }, jg);
      if (g3.sel === i || hiJ.includes(i)) svgEl('circle', { cx: x, cy: y, r: 19, style: 'fill:none;stroke:var(--hl);stroke-width:5;opacity:.9' }, jg);
      if (e > 0.02) {
        M.inc[i].forEach(k => {
          const [dx, dy] = away(i, k), sx = dx, sy = -dy;
          const known = g3.known.has(k), f = M.F[k], kd = TC(f), col = known ? colOf(f) : 'var(--zero)';
          svgEl('line', { x1: x, y1: y, x2: x + sx * stubL, y2: y + sy * stubL, style: `stroke:${col};stroke-width:5px;stroke-linecap:round;opacity:${known ? 0.4 : 0.5}` }, jg);
          if (known && kd && e > 0.1) {
            const o = clamp((e - 0.1) / 0.4, 0, 1), r0 = RJ + 1, r1 = stubL;
            if (kd === 'T') bodyArrow(jg, x + sx * r0, y + sy * r0, x + sx * r1, y + sy * r1, col, { opac: o, width: 3, head: 10 });
            else bodyArrow(jg, x + sx * r1, y + sy * r1, x + sx * r0, y + sy * r0, col, { opac: o, width: 3, head: 10 });
          }
        });
      }
      svgEl('circle', { cx: x, cy: y, r: RJ, style: 'fill:var(--surface);stroke:var(--beam);stroke-width:2.5' }, jg);
      svgEl('circle', { cx: x, cy: y, r: 20, style: 'fill:transparent' }, jg);
      // 이름 + 미지수 배지
      const top = nd.y > 0, u = unknownOf(i).length;
      let bx, by, nx, ny, anc = 'middle';
      if (top) { bx = x; by = y - 34 - 8 * e; nx = x; ny = y - 54 - 8 * e; }
      else if (i === M.pin) { bx = x - 30; by = y - 2; nx = x - 30; ny = y + 24; }
      else if (i === M.roller) { bx = x + 30; by = y - 2; nx = x + 30; ny = y + 24; }
      else { bx = x - 22; by = y + 28; nx = x + 22; ny = y + 33; }
      const okJ = u === 0, can = solvable(i);
      svgEl('circle', { cx: bx, cy: by, r: 12, style: `fill:${okJ ? 'var(--surface-2)' : can ? 'var(--ok)' : 'var(--surface)'};stroke:${okJ ? 'var(--border)' : can ? 'var(--ok)' : 'var(--muted)'};stroke-width:1.5` }, jg);
      svgText(jg, bx, by + 4.5, okJ ? '✓' : String(u), { 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, style: `fill:${okJ ? 'var(--muted)' : can ? 'var(--surface)' : 'var(--muted)'};font-family:var(--font-ui)` });
      svgText(jg, nx, ny, nd.name, { 'text-anchor': anc, 'font-size': 12.5, 'font-weight': 700, class: 'svg-muted val-label' });
    });
    $('g3-tag').textContent = e > 0.5 ? '분해한 모습: 각 절점과 부재가 주고받는 힘' : '붙어 있는 모습';
  }

  function jointFBD(i) {
    const W = 300, H = 250, cx = 150, cy = 118, M = model;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'gd-fbd' });
    const occ = [];
    M.inc[i].forEach(k => {
      const [dx, dy] = away(i, k), sx = dx, sy = -dy, f = M.F[k], kd = TC(f), col = colOf(f);
      occ.push(sy);
      svgEl('line', { x1: cx, y1: cy, x2: cx + sx * 92, y2: cy + sy * 92, style: `stroke:${col};stroke-width:9;stroke-linecap:round;opacity:.22` }, svg);
      if (kd === 'T') bodyArrow(svg, cx + sx * 16, cy + sy * 16, cx + sx * 86, cy + sy * 86, col, { width: 3.4, head: 12 });
      else if (kd === 'C') bodyArrow(svg, cx + sx * 86, cy + sy * 86, cx + sx * 16, cy + sy * 16, col, { width: 3.4, head: 12 });
      const lx = clamp(cx + sx * 112, 44, W - 44), ly = clamp(cy + sy * 108 + 4, 14, H - 8);
      svgText(svg, lx, ly, `${M.members[k].name} ${kd ? fmt(Math.abs(f), 1) + kd : '0'}`, { 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 700, style: `fill:${col}`, class: 'val-label' });
    });
    if (M.loads[i]) {
      drawArrow(svg, cx, cy + 14, cx, cy + 82, { color: 'var(--load)', width: 3, head: 11 });
      svgText(svg, cx + 8, cy + 76, `${fmt(M.loads[i])} kN`, { 'font-size': 12.5, 'font-weight': 700, style: 'fill:var(--load)', class: 'val-label' });
    }
    const Rv = i === M.pin ? M.R.Ay : i === M.roller ? M.R.By : 0;
    if (Rv) {
      drawArrow(svg, cx, cy + 96, cx, cy + 14, { color: 'var(--react)', width: 3, head: 11 });
      svgText(svg, cx + 8, cy + 92, `R = ${fmt(Rv)} kN`, { 'font-size': 12.5, 'font-weight': 700, style: 'fill:var(--react)', class: 'val-label' });
    }
    svgEl('circle', { cx, cy, r: 11, style: 'fill:var(--surface);stroke:var(--beam);stroke-width:3' }, svg);
    svgText(svg, cx - 16, cy - 16, M.nodes[i].name, { 'text-anchor': 'end', 'font-size': 14, 'font-weight': 800 });
    return svg;
  }

  function memberStory(k) {
    const M = model, mb = M.members[k], f = M.F[k], kd = TC(f);
    const na = M.nodes[mb.a].name, nb = M.nodes[mb.b].name;
    if (!kd) return `<p><b>${mb.name}</b>는 이 하중에서 힘이 0인 <b>0부재</b>입니다. 양 끝 절점을 당기지도 밀지도 않습니다.</p>`;
    const [ax, ay] = away(mb.a, k), [bx, by] = away(mb.b, k);
    const dA = kd === 'T' ? dirName(ax, ay) : dirName(-ax, -ay);
    const dB = kd === 'T' ? dirName(bx, by) : dirName(-bx, -by);
    const cls = kd === 'T' ? 'res-T' : 'res-C';
    return `<div class="gd-story ${kd === 'T' ? 't' : 'c'}">
      <p><b>${mb.name}</b> = <span class="${cls}">${fmt(Math.abs(f), 1)} kN ${word(f)}</span></p>
      <ul>
        <li><b>부재 기준</b>: ${kd === 'T' ? '양 끝이 바깥으로 <b>당겨져</b> 늘어납니다. 화살표는 부재 끝에서 밖으로.' : '양 끝이 안으로 <b>눌려</b> 줄어듭니다. 화살표는 부재 끝에서 안으로.'}</li>
        <li><b>절점 ${na} 기준</b>: ${kd === 'T' ? `부재가 절점을 <b>끌어당겨</b> ${dA[0]}(${dA[1]})으로 힘을 받습니다. 화살표가 절점에서 <b>나갑니다</b>.` : `부재가 절점을 <b>밀어서</b> ${dA[0]}(${dA[1]})으로 힘을 받습니다. 화살표가 절점으로 <b>들어옵니다</b>.`}</li>
        <li><b>절점 ${nb} 기준</b>: ${kd === 'T' ? `${dB[0]}(${dB[1]})으로 끌려갑니다. 화살표가 절점에서 <b>나갑니다</b>.` : `${dB[0]}(${dB[1]})으로 밀립니다. 화살표가 절점으로 <b>들어옵니다</b>.`}</li>
      </ul>
      <p class="hint">세 그림의 화살표 방향이 달라 보여도 <b>같은 한 개의 힘</b>입니다. 어느 쪽 몸을 떼어 보느냐만 다릅니다.</p></div>`;
  }

  function sideG3() {
    if (g3.mode === 'goal') { goalSideG3(); return; }
    const M = model, total = M.members.length, done = g3.known.size;
    let h = `<div class="gd-progress"><span>풀린 부재</span><b>${done} / ${total}</b><div class="bar"><i style="width:${done / total * 100}%"></i></div></div>`;
    if (g3.msg) h += `<div class="gd-msg ${g3.msg.cls}">${g3.msg.html}</div>`;
    if (g3.selM !== null && g3.known.has(g3.selM)) h += memberStory(g3.selM);
    else if (g3.sel !== null) {
      const i = g3.sel, nd = M.nodes[i];
      h += `<div><h4>절점 ${nd.name}을 오려 낸 그림</h4><div id="g3-fbd-holder"></div></div><div><h4>이 절점이 받는 힘</h4><ul class="gd-lines">`;
      M.inc[i].forEach(k => {
        const f = M.F[k], kd = TC(f), [dx, dy] = away(i, k);
        const dn = kd === 'T' ? dirName(dx, dy) : dirName(-dx, -dy);
        const nm = M.members[k].name;
        h += `<li><span class="${kd === 'T' ? 'res-T' : kd === 'C' ? 'res-C' : 'res-0'}">${nm} ${kd ? word(f) : '0부재'}</span> — ${kd === 'T' ? `절점을 부재 쪽(${dn[1]})으로 <b>당김</b>` : kd === 'C' ? `절점을 ${dn[0]}(${dn[1]})으로 <b>밈</b>` : '힘 없음'}</li>`;
      });
      h += `</ul><p class="hint">부재를 클릭하면 같은 힘을 부재·양쪽 절점 기준으로 비교해 줍니다.</p></div>`;
    } else {
      h += `<ol class="gd-steps">
        <li>반력 R<sub>A</sub>, R<sub>B</sub>는 전체 평형으로 먼저 구해 두었습니다.</li>
        <li>절점은 부재들이 핀으로 모인 점입니다. 그 점을 <b>동그랗게 오려 낸다</b>고 생각하세요.</li>
        <li>오려 낸 절점에서 쓸 수 있는 식은 ΣF<sub>x</sub> = 0, ΣF<sub>y</sub> = 0 <b>두 개</b>뿐입니다.</li>
        <li>그래서 <b>모르는 부재가 2개 이하</b>인 절점(초록 숫자)만 풀 수 있습니다. 하나 풀면 옆 절점의 숫자가 줄어듭니다.</li>
      </ol>`;
    }
    $('g3-side').innerHTML = h;
    const holder = $('g3-fbd-holder');
    if (holder) holder.appendChild(jointFBD(g3.sel));
  }

  function clickJoint(i) {
    const M = model, u = unknownOf(i), nm = M.nodes[i].name;
    g3.selM = null; g3.hint = null;
    if (u.length === 0) {
      g3.sel = i;
      g3.msg = { cls: '', html: `절점 ${nm}에 연결된 부재는 모두 풀렸습니다. 이 절점은 <b>검산</b>에 씁니다.` };
    } else if (!solvable(i)) {
      g3.sel = null;
      g3.msg = { cls: 'bad', html: `절점 ${nm}: 모르는 부재가 <b>${u.length}개</b>라 식 2개로는 풀 수 없습니다. 초록 숫자가 붙은 절점을 고르세요.` };
      g3.shake = i; setTimeout(() => { g3.shake = null; drawG3(); }, 450);
    } else {
      u.forEach(k => g3.known.add(k));
      g3.order.push(i);
      g3.sel = i;
      const names = u.map(k => `F${sub(M.members[k].name)}`).join(', ');
      g3.msg = { cls: 'ok', html: `<b>${g3.order.length}번째 절점: ${nm}</b> — 모르는 힘 ${u.length}개(${names})를 ΣF<sub>x</sub>, ΣF<sub>y</sub>로 구했습니다.` +
        (g3.known.size === M.members.length ? '<br>모든 부재를 풀었습니다. 순서: ' + g3.order.map(j => M.nodes[j].name).join(' → ') : '') };
    }
    if (g3.mode === 'goal') goalHint3();
    drawG3(); sideG3();
  }

  function resetG3() { g3.known = new Set(); g3.sel = null; g3.selM = null; g3.msg = null; g3.order = []; g3.hint = null; drawG3(); sideG3(); }
  function hintG3() {
    const M = model;
    const order = M.nodes.map((n, i) => i).sort((a, b) => M.nodes[a].x - M.nodes[b].x || M.nodes[a].y - M.nodes[b].y);
    const i = order.find(solvable);
    if (i === undefined) { g3.msg = { cls: 'ok', html: '더 풀 절점이 없습니다. 모두 풀었어요.' }; sideG3(); return; }
    g3.hint = i;
    g3.msg = { cls: '', html: `깜빡이는 절점 <b>${M.nodes[i].name}</b>은 모르는 부재가 ${unknownOf(i).length}개입니다. 클릭해 보세요.` };
    drawG3(); sideG3();
  }
  function solveAllG3() {
    let guard = 0;
    while (g3.known.size < model.members.length && guard++ < 40) {
      const order = model.nodes.map((n, i) => i).sort((a, b) => model.nodes[a].x - model.nodes[b].x || model.nodes[a].y - model.nodes[b].y);
      const i = order.find(solvable);
      if (i === undefined) break;
      clickJoint(i);
    }
  }
  function explodeG3(to) { tween('g3', g3.e, to, 900, v => { g3.e = v; }, drawG3); syncExplodeBtn(to); }
  function syncExplodeBtn(to) { $('g3-explode').textContent = to > 0.5 ? '다시 붙이기' : '절점과 부재 떼어 놓기'; }

  /* =========================================================
     레슨 4: 절단으로 나누기 (가위)
     ========================================================= */
  const g4 = { cut: new Set(), e: 0, target: null, side: 0, reveal: false, preset: -1, bad: -1, mode: 'goal', goal: null, cands: [], ci: 0 };

  function analyzeCut() {
    const M = model, n = M.nodes.length;
    const par = [...Array(n).keys()];
    const find = a => par[a] === a ? a : (par[a] = find(par[a]));
    M.members.forEach((mb, k) => { if (!g4.cut.has(k)) par[find(mb.a)] = find(mb.b); });
    const roots = [...new Set([...Array(n).keys()].map(find))];
    const comp = [...Array(n).keys()].map(i => roots.indexOf(find(i)));
    const res = { nComp: roots.length, comp, cuts: [...g4.cut] };
    if (roots.length === 2 && comp[M.pin] !== 0) res.comp = comp.map(c => 1 - c); // 0 = 핀(A) 쪽
    res.valid = roots.length === 2;
    res.crossing = res.cuts.filter(k => res.comp[M.members[k].a] !== res.comp[M.members[k].b]);
    res.wasted = res.cuts.filter(k => res.comp[M.members[k].a] === res.comp[M.members[k].b]);
    res.concurrent = false; res.parallel = false;
    if (res.valid && res.crossing.length === 3) {
      const L = res.crossing.map(k => M.members[k]);
      const cr = (p, q) => p.ux * q.uy - p.uy * q.ux;
      if (Math.abs(cr(L[0], L[1])) < 1e-6 && Math.abs(cr(L[1], L[2])) < 1e-6) res.parallel = true;
      else {
        const pairs = [[0, 1], [0, 2], [1, 2]].filter(([a, b]) => Math.abs(cr(L[a], L[b])) > 1e-6);
        const [a, b] = pairs[0], O = lineX(L[a], L[b]), c = 3 - a - b;
        const p = M.nodes[L[c].a];
        if (Math.abs((O[0] - p.x) * L[c].uy - (O[1] - p.y) * L[c].ux) < 1e-6) res.concurrent = true;
      }
    }
    res.ok = res.valid && res.wasted.length === 0 && res.crossing.length >= 2 && res.crossing.length <= 3 && !res.concurrent && !res.parallel;
    return res;
  }
  function lineX(m1, m2) {
    const p = model.nodes[m1.a], q = model.nodes[m2.a];
    const den = m1.ux * m2.uy - m1.uy * m2.ux;
    const t = ((q.x - p.x) * m2.uy - (q.y - p.y) * m2.ux) / den;
    return [p.x + m1.ux * t, p.y + m1.uy * t];
  }

  function drawG4() {
    const svg = $('g4-svg'); clearSvg(svg);
    const M = model, A = analyzeCut(), e = A.valid ? g4.e : 0;
    // 조각 이동량 (화면)
    const T = [[0, 0], [0, 0]];
    if (A.valid) {
      const cen = [0, 1].map(c => {
        const ids = M.nodes.map((n, i) => i).filter(i => A.comp[i] === c);
        return [ids.reduce((s, i) => s + NP(i)[0], 0) / ids.length, ids.reduce((s, i) => s + NP(i)[1], 0) / ids.length];
      });
      let vx = cen[1][0] - cen[0][0], vy = cen[1][1] - cen[0][1];
      const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
      T[0] = [-vx * 44 * e, -vy * 44 * e]; T[1] = [vx * 44 * e, vy * 44 * e];
    }
    const showSide = A.ok && g4.target !== null;
    const op = c => !showSide ? 1 : c === g4.side ? 1 : 0.28;
    const P = (i, c = A.comp[i]) => { const [x, y] = NP(i); return [x + T[c][0], y + T[c][1]]; };

    const groups = [svgEl('g', { opacity: op(0) }, svg), svgEl('g', { opacity: op(1) }, svg)];
    const gOf = i => groups[A.valid ? A.comp[i] : 0];
    // 지점·반력
    drawSupports(gOf(M.pin), P(M.pin), P(M.roller));
    if (A.valid && A.comp[M.pin] !== A.comp[M.roller]) {
      // 지점이 서로 다른 조각에 있으면 따로 그려야 하므로 다시 그림
      while (gOf(M.pin).lastChild) gOf(M.pin).removeChild(gOf(M.pin).lastChild);
      const gp = gOf(M.pin), gr = gOf(M.roller);
      drawSupports(gp, P(M.pin), [-999, -999]);
      drawSupports(gr, [-999, -999], P(M.roller));
    }
    drawReaction(gOf(M.pin), ...P(M.pin), M.R.Ay, 'RA', 'start');
    drawReaction(gOf(M.roller), ...P(M.roller), M.R.By, 'RB', 'end');

    // 칼선 (붙어 있을 때)
    if (A.crossing.length && A.valid) {
      const pts = A.crossing.map(k => { const mb = M.members[k], [x1, y1] = NP(mb.a), [x2, y2] = NP(mb.b); return [(x1 + x2) / 2, (y1 + y2) / 2]; }).sort((p, q) => p[1] - q[1]);
      const ext = [[pts[0][0], pts[0][1] - 40], ...pts, [pts[pts.length - 1][0], pts[pts.length - 1][1] + 40]];
      svgEl('polyline', { points: ext.map(p => p.join(',')).join(' '), style: 'fill:none;stroke:var(--accent);stroke-width:2.2;stroke-dasharray:8 6', opacity: 1 - e }, svg);
    }

    M.members.forEach((mb, k) => {
      const cut = g4.cut.has(k);
      const [x1, y1] = NP(mb.a), [x2, y2] = NP(mb.b);
      const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      if (!cut) {
        const [ax, ay] = P(mb.a), [bx, by] = P(mb.b);
        const mg = svgEl('g', { class: 'mb', 'data-m': k }, gOf(mb.a));
        if (g4.goal === k) svgEl('line', { x1: ax, y1: ay, x2: bx, y2: by, style: 'stroke:var(--violet);stroke-width:22px;stroke-linecap:round;opacity:.3', class: 'pulse' }, mg);
        svgEl('line', { x1: ax, y1: ay, x2: bx, y2: by, style: 'stroke:var(--beam);stroke-width:4px;stroke-linecap:round;opacity:.75' }, mg);
        svgEl('line', { x1: ax, y1: ay, x2: bx, y2: by, style: 'stroke:transparent;stroke-width:20px' }, mg);
        return;
      }
      const f = M.F[k], kd = TC(f), isX = A.crossing.includes(k) && A.valid;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, hg = 10;
      const halves = [[mb.a, x1, y1, mx - ux * hg, my - uy * hg, 1], [mb.b, x2, y2, mx + ux * hg, my + uy * hg, -1]];
      halves.forEach(([node, sx, sy, fx, fy, dir]) => {
        const c = A.comp[node], [tx, ty] = A.valid ? T[c] : [0, 0];
        const mg = svgEl('g', { class: 'mb', 'data-m': k }, gOf(node));
        const known = g4.reveal && isX;
        const col = !isX ? 'var(--unknown)' : known ? colOf(f) : 'var(--unknown)';
        if (g4.target === k) svgEl('line', { x1: sx + tx, y1: sy + ty, x2: fx + tx, y2: fy + ty, style: 'stroke:var(--hl);stroke-width:20px;stroke-linecap:round;opacity:.55' }, mg);
        svgEl('line', { x1: sx + tx, y1: sy + ty, x2: fx + tx, y2: fy + ty, style: `stroke:${col};stroke-width:${known ? 4 + 5 * Math.abs(f) / M.Fmax : 4.5}px;stroke-linecap:round` + (known ? '' : ';stroke-dasharray:8 5') }, mg);
        svgEl('line', { x1: sx + tx, y1: sy + ty, x2: fx + tx, y2: fy + ty, style: 'stroke:transparent;stroke-width:20px' }, mg);
        // 잘린 끝 화살표 (조각 위, 길이 34)
        if (isX && e > 0.15) {
          const o = clamp((e - 0.15) / 0.4, 0, 1), al = 36;
          const ox = ux * dir, oy = uy * dir; // 조각 밖(잘린 면) 방향
          const kk = known ? kd : 'T';
          if (kk === 'T') bodyArrow(mg, fx + tx - ox * al, fy + ty - oy * al, fx + tx, fy + ty, col, { opac: o, width: 3.2, head: 11 });
          else if (kk === 'C') bodyArrow(mg, fx + tx, fy + ty, fx + tx - ox * al, fy + ty - oy * al, col, { opac: o, width: 3.2, head: 11 });
          const lx = fx + tx + ox * 4 - oy * 16 * dir, ly = fy + ty + oy * 4 + ox * 16 * dir;
          const txt = known ? (kd ? `${fmt(Math.abs(f), 1)} ${kd}` : '0') : `F${'?'}`;
          svgText(mg, lx, ly + 4, known ? txt : M.members[k].name, { 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700, style: `fill:${col}`, opacity: o, class: 'val-label' });
        }
        if (!A.valid || !isX) {
          // 가위 표시
          const sx2 = mx + tx, sy2 = my + ty;
          if (dir === 1) {
            svgEl('line', { x1: sx2 - 7, y1: sy2 - 7, x2: sx2 + 7, y2: sy2 + 7, style: 'stroke:var(--accent);stroke-width:2.5' }, mg);
            svgEl('line', { x1: sx2 - 7, y1: sy2 + 7, x2: sx2 + 7, y2: sy2 - 7, style: 'stroke:var(--accent);stroke-width:2.5' }, mg);
          }
        }
      });
    });

    M.nodes.forEach((nd, i) => { if (M.loads[i]) drawLoad(gOf(i), ...P(i), M.loads[i]); });
    M.nodes.forEach((nd, i) => {
      const [x, y] = P(i);
      svgEl('circle', { cx: x, cy: y, r: 6.5, style: 'fill:var(--surface);stroke:var(--beam);stroke-width:2.2' }, gOf(i));
      const top = nd.y > 0;
      svgText(gOf(i), x + (top ? 0 : 14), y + (top ? -14 : 22), nd.name, { 'text-anchor': top ? 'middle' : 'start', 'font-size': 12, 'font-weight': 700, class: 'svg-muted val-label' });
    });

    // 모멘트 중심
    if (showSide) drawMomentCenter(svg, A, T);
    $('g4-tag').textContent = !g4.cut.size ? (g4.mode === 'goal' ? '구하고 싶은 부재를 클릭하세요' : '부재를 클릭해서 자르세요') : A.ok ? (g4.reveal ? '실제 힘: 파랑 = 인장, 빨강 = 압축' : '모르는 힘은 모두 인장(밖으로)으로 가정') : '규칙을 확인하세요';
  }

  /* 선택한 부재를 구하는 식: 다른 두 부재의 교점 O에 대한 모멘트 (평행이면 직각 방향 힘의 합) */
  function targetEq(A) {
    const M = model, k = g4.target, c = g4.side;
    const mb = M.members[k];
    const nIn = A.comp[mb.a] === c ? mb.a : mb.b;
    const [ex, ey] = away(nIn, k); // 조각 밖 방향 = 인장 양(+)
    const pin = M.nodes[nIn];
    const ext = [];
    M.nodes.forEach((nd, i) => {
      if (A.comp[i] !== c) return;
      if (M.loads[i]) ext.push({ name: `${fmt(M.loads[i])} kN (${nd.name})`, x: nd.x, y: nd.y, fx: 0, fy: -M.loads[i] });
      if (i === M.pin) ext.push({ name: `R${sub('A')} ${fmt(M.R.Ay)} kN`, x: nd.x, y: nd.y, fx: M.R.Ax, fy: M.R.Ay });
      if (i === M.roller) ext.push({ name: `R${sub('B')} ${fmt(M.R.By)} kN`, x: nd.x, y: nd.y, fx: 0, fy: M.R.By });
    });
    const others = A.crossing.filter(j => j !== k);
    const res = { k, nIn, ext, others };
    if (others.length === 2) {
      const m1 = M.members[others[0]], m2 = M.members[others[1]];
      if (Math.abs(m1.ux * m2.uy - m1.uy * m2.ux) > 1e-6) {
        const O = lineX(m1, m2);
        res.type = 'M'; res.O = O;
        res.terms = ext.map(f => ({ name: f.name, arm: f.x - O[0], m: (f.x - O[0]) * f.fy - (f.y - O[1]) * f.fx })).filter(t => Math.abs(t.m) > 1e-9);
        res.coef = (pin.x - O[0]) * ey - (pin.y - O[1]) * ex;
        res.sum = res.terms.reduce((s, t) => s + t.m, 0);
        res.F = -res.sum / res.coef;
        res.node = M.nodes.findIndex(n => Math.hypot(n.x - O[0], n.y - O[1]) < 1e-6);
        // 수직 거리 발
        const t = (O[0] - pin.x) * ex + (O[1] - pin.y) * ey;
        res.foot = [pin.x + ex * t, pin.y + ey * t];
      } else {
        const nx = -m1.uy, ny = m1.ux;
        res.type = 'F'; res.n = [nx, ny];
        res.terms = ext.map(f => ({ name: f.name, m: f.fx * nx + f.fy * ny })).filter(t => Math.abs(t.m) > 1e-9);
        res.coef = ex * nx + ey * ny;
        res.sum = res.terms.reduce((s, t) => s + t.m, 0);
        res.F = -res.sum / res.coef;
      }
    } else res.type = '2';
    return res;
  }

  function drawMomentCenter(svg, A, T) {
    const R = targetEq(A);
    if (R.type !== 'M') return;
    const M = model, [tx, ty] = T[g4.side];
    const ox = X(R.O[0]) + tx, oy = Y(R.O[1]) + ty;
    const g = svgEl('g', {}, svg);
    // 다른 두 부재 연장선
    R.others.forEach(j => {
      const mb = M.members[j], nIn = A.comp[mb.a] === g4.side ? mb.a : mb.b;
      const [x, y] = NP(nIn);
      svgEl('line', { x1: x + tx, y1: y + ty, x2: ox, y2: oy, style: 'stroke:var(--violet);stroke-width:1.6;stroke-dasharray:5 5' }, g);
    });
    // 팔길이
    const fx = X(R.foot[0]) + tx, fy = Y(R.foot[1]) + ty;
    const [px, py] = NP(R.nIn);
    svgEl('line', { x1: px + tx, y1: py + ty, x2: fx, y2: fy, style: 'stroke:var(--hl);stroke-width:1.6;stroke-dasharray:3 4' }, g);
    svgEl('line', { x1: ox, y1: oy, x2: fx, y2: fy, style: 'stroke:var(--violet);stroke-width:2.4' }, g);
    const d = Math.abs(R.coef);
    svgText(g, (ox + fx) / 2 + 8, (oy + fy) / 2 - 6, `d = ${fmt(d)} m`, { 'font-size': 12.5, 'font-weight': 700, style: 'fill:var(--violet)', class: 'val-label' });
    svgEl('circle', { cx: ox, cy: oy, r: 13, style: 'fill:var(--violet);opacity:.18' }, g);
    svgEl('circle', { cx: ox, cy: oy, r: 6, style: 'fill:var(--violet)' }, g);
    svgText(g, ox + 12, oy - 12, R.node >= 0 ? `O (${model.nodes[R.node].name} 자리)` : 'O', { 'font-size': 15, 'font-weight': 800, style: 'fill:var(--violet)' });
  }

  function sideG4() {
    const M = model, A = analyzeCut();
    const pre = g4.mode === 'goal' ? goalSideG4(A) : null;
    if (pre && pre.only) { $('g4-side').innerHTML = pre.html; $('g4-reveal').disabled = true; return; }
    const li = (st, html) => `<li class="${st}"><i></i><span>${html}</span></li>`;
    const s1 = !g4.cut.size ? 'todo' : A.valid ? 'ok' : 'bad';
    const s2 = !A.valid ? 'todo' : (A.crossing.length <= 3 && !A.wasted.length) ? 'ok' : 'bad';
    const s3 = !A.valid || A.crossing.length !== 3 ? (A.valid && A.crossing.length < 3 && !A.wasted.length ? 'ok' : 'todo') : (A.concurrent || A.parallel) ? 'bad' : 'ok';
    let h = (pre ? pre.html + '<div class="gd-rest">' : '') + `<ul class="gd-checks">
      ${li(s1, '트러스가 <b>완전히 두 조각</b>으로 나뉜다')}
      ${li(s2, '잘린 부재가 <b>3개 이하</b> (식은 ΣF<sub>x</sub>, ΣF<sub>y</sub>, ΣM 3개)')}
      ${li(s3, '잘린 3부재가 <b>한 점에서 모두 만나지 않고</b>, 모두 평행하지도 않다')}
    </ul>`;
    let msg, cls = 'bad';
    if (!g4.cut.size) { msg = '그림의 부재를 클릭하면 가위로 자릅니다. 아래 <b>추천 자르기</b>로 시작해도 좋습니다.'; cls = ''; }
    else if (A.nComp === 1) msg = '아직 <b>한 덩어리</b>로 붙어 있습니다. 칼이 트러스를 위에서 아래까지 끝까지 지나가야 두 조각이 됩니다.';
    else if (A.nComp > 2) msg = `<b>${A.nComp}조각</b>으로 나뉘었습니다. 한 번에 한 줄로 잘라 두 조각만 만드세요.`;
    else if (A.wasted.length) msg = `${A.wasted.map(k => M.members[k].name).join(', ')}는 잘라도 두 조각을 나누는 데 필요 없습니다. 모르는 힘만 늘어나니 다시 붙이세요(다시 클릭).`;
    else if (A.crossing.length > 3) msg = `두 조각은 됐지만 모르는 힘이 <b>${A.crossing.length}개</b>입니다. 식은 3개뿐이라 이 자르기로는 한 번에 풀 수 없습니다.`;
    else if (A.concurrent) msg = '잘린 3부재가 <b>한 점에서 만납니다</b>. 그 점에 대한 모멘트가 모두 0이 되어 식이 하나 사라집니다.';
    else if (A.parallel) msg = '잘린 3부재가 <b>모두 평행</b>합니다. 직각 방향 힘을 버틸 수 없어 풀 수 없습니다.';
    else { msg = A.crossing.length === 2 ? '잘 잘랐습니다. 2부재만 자르면 사실상 <b>절점 하나를 오려 낸 것</b>(절점법)과 같습니다.' : '잘 잘랐습니다. 아래에서 구할 부재를 고르세요.'; cls = 'ok'; }
    h += `<div class="gd-msg ${cls}">${msg}</div>`;

    if (A.ok) {
      h += `<div class="gd-pick"><span>구할 부재</span>${A.crossing.map(k => `<button class="chip ${g4.target === k ? 'on' : ''}" data-tg="${k}">${M.members[k].name}</button>`).join('')}</div>`;
      h += `<div class="gd-pick"><span>볼 조각</span><button class="chip ${g4.side === 0 ? 'on' : ''}" data-side="0">A쪽(왼쪽)</button><button class="chip ${g4.side === 1 ? 'on' : ''}" data-side="1">B쪽(오른쪽)</button></div>`;
      h += `<div class="gd-eqbox">`;
      if (g4.target !== null) {
        const R = targetEq(A), nm = `F${sub(M.members[R.k].name)}`;
        const oth = R.others.map(j => M.members[j].name).join(', ');
        const f = M.F[R.k];
        if (R.type === 'M') {
          const where = R.node >= 0 ? `절점 ${M.nodes[R.node].name}` : `(${fmt(R.O[0])}, ${fmt(R.O[1])}) — 트러스 밖의 점`;
          h += `<p><b>${oth}</b>의 연장선이 만나는 점 <b class="t-violet">O = ${where}</b>에 대해 모멘트를 잡으면, 그 두 힘은 O를 지나므로 식에서 사라지고 ${nm}만 남습니다.</p>`;
          h += `<div class="eq">ΣM<sub>O</sub> = 0 (반시계 +)</div><ul class="gd-lines">`;
          R.terms.forEach(t => { h += `<li>${t.name} × 팔길이 ${fmt(Math.abs(t.arm))} m → ${fmtS(t.m)} kN·m</li>`; });
          h += `<li>${nm} × d ${fmt(Math.abs(R.coef))} m → ${fmtS(R.coef)}·${nm}</li></ul>`;
          h += `<div class="eq">${fmt(R.sum)} ${R.coef >= 0 ? '+' : '−'} ${fmt(Math.abs(R.coef))}·${nm} = 0</div>`;
        } else if (R.type === 'F') {
          const vert = Math.abs(R.n[1]) > 0.99;
          h += `<p><b>${oth}</b>는 서로 <b>평행</b>해서 만나는 점이 없습니다. 대신 그 둘에 직각인 방향${vert ? '(세로, y)' : ''}으로 힘을 더하면 ${nm}만 남습니다.</p>`;
          h += `<div class="eq">ΣF${sub(vert ? 'y' : '⊥')} = 0 : ${R.terms.map(t => fmtS(t.m)).join(' ')} ${R.coef >= 0 ? '+' : '−'} ${fmt(Math.abs(R.coef), 3)}·${nm} = 0</div>`;
        } else {
          h += `<p>모르는 힘이 2개이므로 ΣF<sub>x</sub> = 0, ΣF<sub>y</sub> = 0 두 식을 연립합니다.</p>`;
        }
        if (g4.reveal) h += `<div class="eq">${nm} = <span class="${TC(f) === 'T' ? 'res-T' : TC(f) === 'C' ? 'res-C' : 'res-0'}">${fmt(f)} kN → ${word(f)}</span></div>
          <p class="hint">${TC(f) === 'C' ? '음수 = 인장 가정과 반대 = 압축. 그림의 화살표가 조각 안으로 들어가는 방향으로 바뀝니다.' : TC(f) === 'T' ? '양수 = 가정대로 인장. 화살표가 조각 밖으로 나갑니다.' : '0이므로 힘이 없는 부재입니다.'}</p>`;
        else h += `<p class="hint">직접 계산해 보고 <b>답 보기</b>를 누르세요.</p>`;
      } else h += `<p class="hint">칩을 눌러 구할 부재를 고르면, 모멘트 중심 O와 팔길이 d를 그림에 표시합니다.</p>`;
      h += `</div>`;
    }
    if (pre) h += '</div>';
    $('g4-side').innerHTML = h;
    $('g4-reveal').textContent = g4.reveal ? '답 숨기기' : '답 보기';
    $('g4-reveal').disabled = !A.ok;
  }

  function cutChanged() {
    const A = analyzeCut();
    if (!A.ok || (g4.target !== null && !A.crossing.includes(g4.target))) g4.target = null;
    if (A.ok && g4.target === null) {
      g4.target = A.crossing[0];
      const mc = A.crossing.find(k => { g4.target = k; return targetEq(A).type === 'M' && model.nodes[model.members[k].a].y > 0; });
      g4.target = mc ?? A.crossing[0];
    }
    if (A.valid) { g4.e = 0; tween('g4', 0, 1, 900, v => { g4.e = v; }, drawG4); }
    else g4.e = 0;
    drawG4(); sideG4();
  }
  function presetCuts() {
    const M = model;
    const xs = [...new Set(M.nodes.map(n => +n.x.toFixed(6)))].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const xc = (xs[i] + xs[i + 1]) / 2;
      const set = M.members.map((m, k) => k).filter(k => { const a = M.nodes[M.members[k].a].x, b = M.nodes[M.members[k].b].x; return (a - xc) * (b - xc) < 0; });
      if (set.length === 3) out.push(set);
    }
    return out;
  }
  function badCuts() {
    // 핀 쪽 절점 묶음 중 경계 부재가 정확히 4개이고 양쪽이 각각 한 덩어리인 가장 작은 것
    const M = model, n = M.nodes.length;
    const connected = (S, inS) => {
      const ids = [...Array(n).keys()].filter(i => S.has(i) === inS);
      if (!ids.length) return false;
      const seen = new Set([ids[0]]), st = [ids[0]];
      while (st.length) {
        const i = st.pop();
        M.inc[i].forEach(k => { const j = other(M.members[k], i); if (S.has(j) === inS && !seen.has(j)) { seen.add(j); st.push(j); } });
      }
      return seen.size === ids.length;
    };
    let four = null, best = 99;
    for (let mask = 1; mask < (1 << n); mask++) {
      if (!(mask & (1 << M.pin))) continue;
      const S = new Set([...Array(n).keys()].filter(i => mask & (1 << i)));
      if (S.size >= best) continue;
      const bd = M.members.map((m, k) => k).filter(k => S.has(M.members[k].a) !== S.has(M.members[k].b));
      if (bd.length === 4 && connected(S, true) && connected(S, false)) { four = bd; best = S.size; }
    }
    const ps = presetCuts()[1] || presetCuts()[0];
    return four ? [ps.slice(0, 2), four] : [ps.slice(0, 2)];
  }

  /* =========================================================
     레슨 5: 화살표 읽기 퀴즈
     ========================================================= */
  const g5 = { q: null, answered: null, right: 0, total: 0 };

  function newQ() {
    const kinds = ['member', 'member2', 'joint', 'piece'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const ans = Math.random() < 0.5 ? 'T' : 'C';
    const angs = [0, 30, 45, 60, 90, 120, 135, 150];
    g5.q = { kind, ans, ang: angs[Math.floor(Math.random() * angs.length)], seed: Math.random() };
    g5.answered = null;
    drawG5();
  }

  function drawG5() {
    const svg = $('g5-svg'); clearSvg(svg);
    const q = g5.q; if (!q) return;
    const done = g5.answered !== null;
    const col = done ? COL[q.ans] : 'var(--violet)';
    const T = q.ans === 'T';
    const cx = 260, cy = 135, r = q.ang * Math.PI / 180, ux = Math.cos(r), uy = -Math.sin(r);
    let prompt = '';
    if (q.kind === 'member' || q.kind === 'member2') {
      const half = 130;
      const ax = cx - ux * half, ay = cy - uy * half, bx = cx + ux * half, by = cy + uy * half;
      svgEl('line', { x1: ax, y1: ay, x2: bx, y2: by, style: 'stroke:var(--beam);stroke-width:16px;stroke-linecap:round;opacity:.28' }, svg);
      svgEl('circle', { cx: ax, cy: ay, r: 6, style: 'fill:var(--surface);stroke:var(--beam);stroke-width:2' }, svg);
      svgEl('circle', { cx: bx, cy: by, r: 6, style: 'fill:var(--surface);stroke:var(--beam);stroke-width:2' }, svg);
      if (q.kind === 'member') { // 몸 위 화살표
        const al = 60;
        if (T) { bodyArrow(svg, ax + ux * al, ay + uy * al, ax + ux * 8, ay + uy * 8, col); bodyArrow(svg, bx - ux * al, by - uy * al, bx - ux * 8, by - uy * 8, col); }
        else { bodyArrow(svg, ax + ux * 8, ay + uy * 8, ax + ux * al, ay + uy * al, col); bodyArrow(svg, bx - ux * 8, by - uy * 8, bx - ux * al, by - uy * al, col); }
      } else { // 몸 밖 화살표 (교과서식)
        const al = 64;
        if (T) { drawArrow(svg, ax - ux * 10, ay - uy * 10, ax - ux * al, ay - uy * al, { color: col, width: 4, head: 14 }); drawArrow(svg, bx + ux * 10, by + uy * 10, bx + ux * al, by + uy * al, { color: col, width: 4, head: 14 }); }
        else { drawArrow(svg, ax - ux * al, ay - uy * al, ax - ux * 10, ay - uy * 10, { color: col, width: 4, head: 14 }); drawArrow(svg, bx + ux * al, by + uy * al, bx + ux * 10, by + uy * 10, { color: col, width: 4, head: 14 }); }
      }
      prompt = '이 부재 하나를 떼어 낸 그림입니다. 양 끝 화살표를 보면 이 부재는?';
    } else if (q.kind === 'joint') {
      const dirs = [q.ang, q.ang + 120 + Math.round(q.seed * 3) * 15, q.ang + 230 - Math.round(q.seed * 2) * 15];
      dirs.forEach((d, i) => {
        const rr = d * Math.PI / 180, dx = Math.cos(rr), dy = -Math.sin(rr);
        svgEl('line', { x1: cx, y1: cy, x2: cx + dx * 105, y2: cy + dy * 105, style: `stroke:${i === 0 ? 'var(--beam)' : 'var(--zero)'};stroke-width:${i === 0 ? 14 : 10}px;stroke-linecap:round;opacity:${i === 0 ? 0.35 : 0.3}` }, svg);
      });
      if (T) bodyArrow(svg, cx + ux * 18, cy + uy * 18, cx + ux * 96, cy + uy * 96, col);
      else bodyArrow(svg, cx + ux * 96, cy + uy * 96, cx + ux * 18, cy + uy * 18, col);
      svgEl('circle', { cx, cy, r: 13, style: 'fill:var(--surface);stroke:var(--beam);stroke-width:3' }, svg);
      svgText(svg, cx + ux * 122, cy + uy * 122 + 4, '이 부재', { 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, class: 'svg-muted' });
      prompt = '절점 하나를 오려 낸 그림입니다. 진한 부재의 화살표를 보면 그 부재는?';
    } else {
      // 조각 (절단법): 왼쪽 삼각형 조각 + 잘린 부재 3개
      const ox = 120, oy = 200, w = 120, hh = 120;
      const pts = [[ox, oy], [ox + w, oy], [ox + w, oy - hh], [ox, oy - hh]];
      const ln = (a, b, s) => svgEl('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], style: s }, svg);
      const base = 'stroke:var(--beam);stroke-width:5;stroke-linecap:round;opacity:.6';
      ln(pts[0], pts[1], base); ln(pts[3], pts[2], base); ln(pts[0], pts[3], base); ln(pts[1], pts[2], base); ln(pts[0], pts[2], base);
      const stubs = [[pts[2], [ox + w + 110, oy - hh]], [pts[2], [ox + w + 100, oy - hh + 100]], [pts[1], [ox + w + 110, oy]]];
      const pick = Math.floor(q.seed * 3);
      stubs.forEach(([a, b], i) => {
        ln(a, b, `stroke:${i === pick ? 'var(--beam)' : 'var(--zero)'};stroke-width:${i === pick ? 8 : 5};stroke-linecap:round;opacity:${i === pick ? 0.5 : 0.4}`);
        if (i === pick) {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L;
          const p0 = [b[0] - dx * 70, b[1] - dy * 70];
          if (T) bodyArrow(svg, p0[0], p0[1], b[0], b[1], col); else bodyArrow(svg, b[0], b[1], p0[0], p0[1], col);
        }
      });
      svgEl('line', { x1: ox + w + 112, y1: oy - hh - 30, x2: ox + w + 112, y2: oy + 30, style: 'stroke:var(--accent);stroke-width:2;stroke-dasharray:7 6' }, svg);
      svgText(svg, ox + w + 120, oy + 26, '잘린 면', { 'font-size': 12.5, 'font-weight': 700, style: 'fill:var(--accent)' });
      svgText(svg, ox + w / 2, oy + 30, '왼쪽 조각', { 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 700, class: 'svg-muted' });
      prompt = '절단법으로 자른 왼쪽 조각입니다. 진한 부재의 화살표를 보면 그 부재는?';
    }
    $('g5-q').textContent = prompt;
    const fb = $('g5-fb');
    if (done) {
      const ok = g5.answered === q.ans;
      const why = q.kind === 'member2'
        ? (T ? '화살표가 부재 끝에서 바깥으로 잡아당깁니다 → 늘어남 → 인장.' : '화살표가 바깥에서 부재 끝을 향해 밀고 들어옵니다 → 줄어듦 → 압축.')
        : (T ? '화살표가 몸(부재·절점·조각)에서 잘린 면 쪽으로 <b>나갑니다</b> → 당기는 힘 → 인장.' : '화살표가 잘린 면에서 몸 쪽으로 <b>들어옵니다</b> → 미는 힘 → 압축.');
      fb.className = 'gd-msg ' + (ok ? 'ok' : 'bad');
      fb.innerHTML = `${ok ? '정답' : '아쉬워요'} — 답은 <b class="${T ? 't-tension' : 't-comp'}">${T ? '인장' : '압축'}</b>. ${why}`;
    } else { fb.className = 'gd-msg'; fb.innerHTML = '화살표가 <b>몸 밖으로 나가는지</b>, <b>몸 안으로 들어오는지</b>만 보세요.'; }
    document.querySelectorAll('#g5-ans button').forEach(b => { b.disabled = done; b.classList.toggle('picked', done && b.dataset.a === g5.answered); });
    $('g5-score').textContent = `${g5.right} / ${g5.total}`;
  }

  /* =========================================================
     목표 부재 모드: "이 부재를 구하고 싶다" → 풀이 경로 / 자르는 위치 안내
     ========================================================= */
  function memberKind(k) {
    const mb = model.members[k], a = model.nodes[mb.a], b = model.nodes[mb.b];
    if (a.y > 0 && b.y > 0) return '상현재(위쪽 부재)';
    if (a.y === 0 && b.y === 0) return '하현재(아래쪽 부재)';
    if (Math.abs(a.x - b.x) < 1e-9) return '수직재';
    if ([mb.a, mb.b].some(i => i === model.pin || i === model.roller)) return '단부 경사재';
    return '사재(대각선 부재)';
  }
  const jointOrder = () => model.nodes.map((n, i) => i).sort((a, b) => model.nodes[a].x - model.nodes[b].x || model.nodes[a].y - model.nodes[b].y);

  /* 절점법: 목표 부재까지 가장 적은 절점 수로 가는 순서 (너비 우선 탐색, 상태 = 이미 아는 부재 집합) */
  function planJoints(goal) {
    const M = model, order = jointOrder();
    const unk = (i, mask) => M.inc[i].filter(k => !(mask & (1 << k)));
    const ok = (i, mask) => {
      const u = unk(i, mask);
      if (u.length === 0 || u.length > 2) return false;
      if (u.length === 2) { const a = M.members[u[0]], b = M.members[u[1]]; if (Math.abs(a.ux * b.uy - a.uy * b.ux) < 1e-6) return false; }
      return true;
    };
    const prev = new Map([[0, null]]), q = [0];
    while (q.length) {
      const mask = q.shift();
      if (mask & (1 << goal)) {
        const path = []; let m = mask;
        while (prev.get(m)) { const [pm, j] = prev.get(m); path.unshift({ node: j, unknown: unk(j, pm) }); m = pm; }
        return path;
      }
      for (const i of order) {
        if (!ok(i, mask)) continue;
        const nm = unk(i, mask).reduce((s, k) => s | (1 << k), mask);
        if (!prev.has(nm)) { prev.set(nm, [mask, i]); q.push(nm); }
      }
    }
    return [];
  }

  function setGoal3(k) {
    g3.goal = k; g3.plan = planJoints(k);
    g3.known = new Set(); g3.sel = null; g3.selM = null; g3.order = []; g3.msg = null;
    goalHint3(); drawG3(); sideG3();
  }
  function goalHint3() {
    const nx = g3.plan.find(p => p.unknown.some(k => !g3.known.has(k)));
    g3.hint = g3.goal !== null && !g3.known.has(g3.goal) && nx ? nx.node : null;
  }
  function nextGoal3() {
    const nx = g3.plan.find(p => p.unknown.some(k => !g3.known.has(k)));
    if (nx) { clickJoint(nx.node); if (g3.e < 0.5) explodeG3(1); }
  }

  function goalSideG3() {
    const M = model;
    let h = '';
    if (g3.goal === null) {
      h = `<div class="gd-msg">그림에서 <b>구하고 싶은 부재</b>를 클릭하세요. 그 부재까지 가장 빨리 도착하는 절점 순서와, 각 절점을 왜 그 순서로 푸는지 알려 줍니다.</div>`;
      $('g3-side').innerHTML = h; return;
    }
    const k = g3.goal, mb = M.members[k], doneGoal = g3.known.has(k);
    const curIdx = g3.plan.findIndex(p => p.unknown.some(j => !g3.known.has(j)));
    h += `<div class="gd-goal"><span class="gd-goal-tag">목표</span><b>F${sub(mb.name)}</b> <span class="muted">${memberKind(k)}</span></div>`;
    h += `<div class="gd-plan"><h4>풀이 경로: 절점 ${g3.plan.length}개</h4><ol class="gd-route">`;
    g3.plan.forEach((p, n) => {
      const nd = M.nodes[p.node], done = n < curIdx || curIdx < 0, cur = n === curIdx;
      const names = p.unknown.map(j => `<span class="${j === k ? 'gd-goalname' : ''}">${M.members[j].name}</span>`).join(', ');
      const fresh = M.inc[p.node].filter(j => !p.unknown.includes(j));
      let why;
      if (n === 0) why = nd.y === 0 && (p.node === M.pin || p.node === M.roller) ? '지점 절점이라 반력을 이미 알고, 연결된 부재가 2개뿐이라 바로 풀립니다.' : `처음부터 모르는 부재가 ${p.unknown.length}개뿐입니다.`;
      else why = fresh.length ? `앞 단계에서 ${fresh.map(j => M.members[j].name).join(', ')}를 구해 둬서 모르는 부재가 ${p.unknown.length}개로 줄었습니다.` : `모르는 부재가 ${p.unknown.length}개입니다.`;
      h += `<li class="${done ? 'done' : cur ? 'cur' : ''}"><b>절점 ${nd.name}</b> — 모르는 힘 ${names}<br><small>${why}</small></li>`;
    });
    h += `</ol>`;
    if (!doneGoal) {
      const nx = g3.plan[curIdx];
      h += `<p class="hint">깜빡이는 절점 <b>${M.nodes[nx.node].name}</b>을 클릭하거나 아래 버튼을 누르세요.</p>
        <div class="gd-btns"><button class="btn sm primary" data-act="g3-next">다음 절점 풀기 ▶</button><button class="btn sm" data-act="g3-restart">처음부터</button></div>`;
    } else {
      h += `<div class="gd-btns"><button class="btn sm" data-act="g3-restart">경로 다시 보기</button><button class="btn sm" data-act="to-sec">절단법으로 구하면? →</button></div>`;
    }
    h += `</div>`;
    h += `<div>`;
    if (g3.msg) h += `<div class="gd-msg ${g3.msg.cls}">${g3.msg.html}</div>`;
    if (doneGoal) h += memberStory(k) + `<p class="hint">절점법은 목표 부재까지 <b>옆 절점을 차례로 거쳐야</b> 합니다. 트러스 가운데 부재일수록 단계가 길어지므로, 한 부재만 필요하면 절단법이 빠릅니다.</p>`;
    else if (g3.sel !== null) h += `<h4>방금 푼 절점 ${M.nodes[g3.sel].name}</h4><div id="g3-fbd-holder"></div>`;
    else h += `<ol class="gd-steps"><li>절점 하나에서 쓸 수 있는 식은 ΣF<sub>x</sub> = 0, ΣF<sub>y</sub> = 0 <b>두 개</b>입니다.</li><li>그래서 모르는 부재가 2개 이하인 절점만 풀 수 있고, 하나를 풀면 옆 절점의 모르는 수가 줄어듭니다.</li><li>목표 부재에 닿을 때까지 이 과정을 반복합니다.</li></ol>`;
    h += `</div>`;
    $('g3-side').innerHTML = h;
    const holder = $('g3-fbd-holder');
    if (holder) holder.appendChild(jointFBD(g3.sel));
  }

  /* 절단법: 목표 부재를 지나는 올바른 자르기를 모두 찾아 순위를 매김 */
  function evalCut(set, target, side) {
    const sv = { cut: g4.cut, target: g4.target, side: g4.side };
    g4.cut = new Set(set); g4.target = target; g4.side = side ?? 0;
    const A = analyzeCut();
    let R = null;
    if (A.ok && target !== null && A.crossing.includes(target)) R = targetEq(A);
    Object.assign(g4, sv);
    return { A, R };
  }
  function extCount(A, c) {
    return model.nodes.reduce((s, nd, i) => s + (A.comp[i] === c ? (model.loads[i] ? 1 : 0) + (i === model.pin || i === model.roller ? 1 : 0) : 0), 0);
  }
  function findCuts(goal) {
    const M = model, n = M.nodes.length, out = [], seen = new Set();
    for (let mask = 1; mask < (1 << n); mask++) {
      if (!(mask & (1 << M.pin)) || mask === (1 << n) - 1) continue;
      const S = new Set([...Array(n).keys()].filter(i => mask & (1 << i)));
      const bd = M.members.map((m, k) => k).filter(k => S.has(M.members[k].a) !== S.has(M.members[k].b));
      if (!bd.includes(goal) || bd.length > 3) continue;
      const key = bd.join(','); if (seen.has(key)) continue; seen.add(key);
      const { A } = evalCut(bd, goal, 0);
      if (!A.ok) continue;
      const sides = [0, 1].map(c => ({ c, ext: extCount(A, c), size: A.comp.filter(x => x === c).length }));
      sides.sort((p, q) => p.ext - q.ext || p.size - q.size);
      const side = sides[0].c;
      const { R } = evalCut(bd, goal, side);
      const single = R && (R.type === 'M' || R.type === 'F');
      out.push({ set: bd, side, ext: sides[0].ext, type: R ? R.type : '2', score: (single ? 0 : 100) + sides[0].ext * 10 + sides[0].size });
    }
    return out.sort((a, b) => a.score - b.score);
  }

  /* 하중 없는 3부재 절점에서 두 부재가 일직선이면 나머지 하나는 0부재 */
  function zeroNote(k) {
    const M = model, mb = M.members[k];
    for (const i of [mb.a, mb.b]) {
      if (M.loads[i] || i === M.pin || i === M.roller || M.inc[i].length !== 3) continue;
      const o = M.inc[i].filter(j => j !== k).map(j => M.members[j]);
      if (Math.abs(o[0].ux * o[1].uy - o[0].uy * o[1].ux) < 1e-6) return `<div class="note"><b>더 빠른 방법</b>: 절점 ${M.nodes[i].name}에는 하중이 없고, 나머지 두 부재 ${o.map(m => m.name).join("·")}가 일직선입니다. 그러면 ${mb.name}는 계산 없이 <b>0부재</b>입니다. (직각 방향으로 힘을 맞춰 줄 상대가 없기 때문)</div>`;
    }
    return "";
  }
  function setGoal4(k) {
    g4.goal = k; g4.cands = findCuts(k); g4.ci = 0; g4.reveal = false;
    applyCand4();
  }
  function applyCand4() {
    const c = g4.cands[g4.ci];
    if (!c) { g4.cut = new Set(); g4.target = null; g4.e = 0; drawG4(); sideG4(); return; }
    g4.cut = new Set(); g4.target = null; drawG4(); sideG4();
    setTimeout(() => { g4.cut = new Set(c.set); g4.target = g4.goal; g4.side = c.side; cutChanged(); }, reduce() ? 0 : 450);
  }

  function goalSideG4(A) {
    const M = model;
    if (g4.goal === null) return { only: true, html: `<div class="gd-msg">그림에서 <b>구하고 싶은 부재</b>를 클릭하세요. 그 부재를 구하려면 어디를 잘라야 하는지 찾아서 직접 잘라 보여 줍니다.</div>` };
    const k = g4.goal, mb = M.members[k];
    let h = `<div class="gd-goal"><span class="gd-goal-tag">목표</span><b>F${sub(mb.name)}</b> <span class="muted">${memberKind(k)}</span></div>`;
    if (!g4.cands.length) {
      return { only: true, html: h + `<div class="gd-full"><div class="gd-msg bad">이 부재는 <b>한 번 자르기로는 구할 수 없습니다</b>. ${mb.name}를 지나면서 두 조각을 만드는 자르기는, 잘린 부재가 4개 이상이거나 3개가 한 점(절점)에서 모두 만납니다.</div>
        <p>이럴 때는 다음 두 방법을 씁니다.</p><ol class="gd-steps"><li><b>절점법</b>: ${mb.name}가 연결된 절점을 오려 내어 ΣF로 구합니다.</li><li><b>두 번 자르기</b>: 먼저 다른 절단으로 옆 부재를 구한 뒤, 그 값을 넣고 다시 자릅니다.</li></ol>
        ${zeroNote(k)}
        <div class="gd-btns"><button class="btn sm primary" data-act="to-joint">절점법 경로 보기 →</button></div></div>` };
    }
    const c = g4.cands[g4.ci];
    if (!A.ok || !A.crossing.includes(k)) return { only: true, html: h + `<div class="gd-msg">자를 위치를 찾는 중…</div>` };
    const others = A.crossing.filter(j => j !== k).map(j => M.members[j].name);
    const sideName = c.side === 0 ? 'A쪽(왼쪽)' : 'B쪽(오른쪽)';
    const R = targetEq(A);
    let how;
    if (R.type === 'M') how = `${others.join('와 ')}의 연장선이 만나는 점 <b class="t-violet">O</b>를 중심으로 모멘트를 잡으면, 두 힘의 팔길이가 0이 되어 <b>식 하나에 ${mb.name}만</b> 남습니다.`;
    else if (R.type === 'F') how = `${others.join('와 ')}가 서로 평행합니다. 그 직각 방향 힘의 합을 쓰면 두 힘이 빠지고 <b>${mb.name}만</b> 남습니다.`;
    else how = `모르는 힘이 2개(${[mb.name, ...others].join(', ')})라서 ΣF<sub>x</sub>, ΣF<sub>y</sub> 두 식으로 풉니다. 사실상 절점 하나를 오려 낸 것과 같습니다.`;
    h += `<div class="gd-plan"><h4>이렇게 자릅니다</h4><ol class="gd-route">
      <li class="done"><b>칼이 ${mb.name}를 지나게</b> 넣습니다. 구하려는 부재를 자르지 않으면 그 힘이 식에 나타나지 않습니다.</li>
      <li class="done"><b>같이 잘리는 부재: ${others.join(', ') || '없음'}</b> → 모르는 힘은 모두 ${A.crossing.length}개. 한 조각의 평형식은 3개(ΣF<sub>x</sub>, ΣF<sub>y</sub>, ΣM)이므로 풀 수 있습니다.</li>
      <li class="done">칼이 트러스를 <b>위에서 아래까지</b> 끝까지 지나서 두 조각으로 나눕니다.</li>
      <li class="done"><b>${sideName} 조각</b>을 봅니다. 하중·반력이 ${c.ext}개로 더 적어 식이 짧습니다.</li>
      <li class="cur">${how}</li>
    </ol>`;
    if (g4.cands.length > 1) h += `<div class="gd-btns"><button class="btn sm" data-act="g4-alt">다른 자르는 방법 (${g4.ci + 1}/${g4.cands.length})</button></div>`;
    h += `</div>`;
    return { only: false, html: h };
  }

  function setMode3(v) {
    g3.mode = v; g3.goal = null; g3.plan = []; g3.hint = null;
    document.querySelectorAll('#g3-mode button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
    document.querySelectorAll('.g3-free').forEach(b => { b.hidden = v === 'goal'; });
    resetG3();
  }
  function setMode4(v) {
    g4.mode = v; g4.goal = null; g4.cands = []; g4.ci = 0;
    document.querySelectorAll('#g4-mode button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
    document.querySelectorAll('.g4-free').forEach(b => { b.hidden = v === 'goal'; });
    g4.cut = new Set(); g4.target = null; g4.reveal = false; cutChanged();
  }
  function defaultGoals() {
    const M = model, find = names => M.members.findIndex(m => names.includes(m.name));
    if (g3.mode === 'goal') setGoal3(find(['U1L2', 'L1U2']));
    if (g4.mode === 'goal') setGoal4(find(['U1U2']));
  }

  /* =========================================================
     초기화
     ========================================================= */
  function setModel(type) {
    modelType = type; model = buildModel(type);
    document.querySelectorAll('[data-gtype]').forEach(b => b.classList.toggle('active', b.dataset.gtype === type));
    g3.known = new Set(); g3.sel = null; g3.selM = null; g3.msg = null; g3.order = []; g3.hint = null;
    g4.cut = new Set(); g4.target = null; g4.reveal = false; g4.preset = -1; g4.bad = -1; g4.e = 0;
    g3.goal = null; g3.plan = []; g4.goal = null; g4.cands = []; g4.ci = 0;
    drawG3(); sideG3(); drawG4(); sideG4();
    defaultGoals();
  }

  function segBind(id, fn) {
    const el = $(id);
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      el.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      fn(b.dataset.v);
    });
  }

  function init() {
    // 레슨 1
    segBind('g1-mode', v => { g1.mode = v; playG1(); });
    $('g1-play').addEventListener('click', playG1);
    // 레슨 2
    segBind('g2-mode', v => { g2.mode = v; drawG2(); });
    segBind('g2-view', v => { g2.view = v; drawG2(); });
    $('g2-play').addEventListener('click', playG2);
    // 레슨 3·4 공통 트러스 형식
    document.querySelectorAll('[data-gtype]').forEach(b => b.addEventListener('click', () => setModel(b.dataset.gtype)));
    // 레슨 3
    $('g3-explode').addEventListener('click', () => explodeG3(g3.e > 0.5 ? 0 : 1));
    $('g3-reset').addEventListener('click', resetG3);
    $('g3-hint').addEventListener('click', hintG3);
    $('g3-all').addEventListener('click', solveAllG3);
    $('g3-svg').addEventListener('click', e => {
      const j = e.target.closest('[data-j]'), m = e.target.closest('[data-m]');
      if (j) clickJoint(+j.dataset.j);
      else if (m && g3.mode === 'goal') setGoal3(+m.dataset.m);
      else if (m) {
        const k = +m.dataset.m;
        if (!g3.known.has(k)) { g3.msg = { cls: '', html: `${model.members[k].name}는 아직 모릅니다. 양 끝 절점 중 하나를 먼저 풀어야 합니다.` }; g3.selM = null; }
        else { g3.selM = g3.selM === k ? null : k; g3.msg = null; if (g3.e < 0.5) explodeG3(1); }
        drawG3(); sideG3();
      } else if (g3.mode !== 'goal') { g3.selM = null; g3.sel = null; drawG3(); sideG3(); }
    });
    segBind('g3-mode', setMode3);
    segBind('g4-mode', setMode4);
    $('g3-side').addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'g3-next') nextGoal3();
      if (a.dataset.act === 'g3-restart') setGoal3(g3.goal);
      if (a.dataset.act === 'to-sec') { const k = g3.goal; if (g4.mode !== 'goal') setMode4('goal'); setGoal4(k); $('g-4').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    // 레슨 4
    $('g4-svg').addEventListener('click', e => {
      const m = e.target.closest('[data-m]'); if (!m) return;
      const k = +m.dataset.m;
      if (g4.mode === 'goal') { setGoal4(k); return; }
      if (g4.cut.has(k)) g4.cut.delete(k); else g4.cut.add(k);
      g4.reveal = false; cutChanged();
    });
    $('g4-side').addEventListener('click', e => {
      const t = e.target.closest('[data-tg]'), s = e.target.closest('[data-side]'), a = e.target.closest('[data-act]');
      if (a && a.dataset.act === 'g4-alt') { g4.ci = (g4.ci + 1) % g4.cands.length; g4.reveal = false; applyCand4(); return; }
      if (a && a.dataset.act === 'to-joint') { const k = g4.goal; if (g3.mode !== 'goal') setMode3('goal'); setGoal3(k); $('g-3').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (t) { g4.target = +t.dataset.tg; drawG4(); sideG4(); }
      if (s) { g4.side = +s.dataset.side; drawG4(); sideG4(); }
    });
    $('g4-preset').addEventListener('click', () => {
      if (g4.mode === 'goal') setMode4('free');
      const ps = presetCuts(); g4.preset = (g4.preset + 1) % ps.length;
      g4.cut = new Set(ps[g4.preset]); g4.reveal = false; g4.target = null; cutChanged();
    });
    $('g4-bad').addEventListener('click', () => {
      if (g4.mode === 'goal') setMode4('free');
      const bs = badCuts(); g4.bad = (g4.bad + 1) % bs.length;
      g4.cut = new Set(bs[g4.bad]); g4.reveal = false; g4.target = null; cutChanged();
    });
    $('g4-clear').addEventListener('click', () => { g4.cut = new Set(); g4.target = null; g4.reveal = false; cutChanged(); });
    $('g4-reveal').addEventListener('click', () => { g4.reveal = !g4.reveal; drawG4(); sideG4(); });
    // 레슨 5
    $('g5-ans').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || g5.answered !== null) return;
      g5.answered = b.dataset.a; g5.total++; if (g5.answered === g5.q.ans) g5.right++;
      drawG5();
    });
    $('g5-next').addEventListener('click', newQ);

    g1.a = 1; g2.e = 1;
    drawG1(); drawG2();
    setModel('pratt');
    newQ();
  }

  function refresh() {
    // 페이지에 들어올 때 레슨 1·2를 한 번 재생
    playG1();
    playG2();
  }

  return { init, refresh, _model: () => model, _g3: g3, _g4: g4, _analyze: () => analyzeCut(), _targetEq: () => targetEq(analyzeCut()), _clickJoint: i => clickJoint(i) };
})();
