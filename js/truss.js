'use strict';
/* 트러스: 절점 평형식으로 부재력·반력을 풀고, 절점법/절단법 풀이 과정을 시각화.
   부재력은 인장 +, 압축 −. 좌표는 m (y 위 +). */

const Truss = (() => {
  const $ = id => document.getElementById(id);
  const TYPE_INFO = {
    pratt: '프랫 트러스: 사재가 가운데를 향해 아래로 내려갑니다. 중력 하중에서 사재는 인장, 수직재는 압축을 받아 강재 트러스에 많이 쓰입니다.',
    howe: '하우 트러스: 프랫과 사재 방향이 반대입니다. 사재가 압축, 수직재가 인장을 받습니다(목재 + 강봉 구조에 유리).',
    warren: '워렌 트러스: 수직재 없이 정삼각형에 가까운 사재가 번갈아 배치됩니다. 사재가 인장·압축을 번갈아 받습니다.',
    roof: '지붕(삼각) 트러스: 경사진 상현재가 지붕 모양을 만듭니다. 상현재는 압축, 하현재는 인장을 받습니다.',
  };

  const st = {
    type: 'pratt', n: 6, L: 12, h: 3, P: 10,
    loaded: new Set(), loadPreset: 'bottom',
    mode: 'result', step: 0, reveal: false, cutIdx: 0, selEq: 0,
    labels: true, arrows: true, anim: false, selMember: null,
  };
  let T = null; // {nodes, members, pin, roller}
  let S = null; // 해석 결과
  let animT = 0, animOn = false;

  /* ---------------- 형상 생성 ---------------- */
  function build() {
    const { type, L, h } = st;
    let n = st.n;
    if (type === 'roof' && n % 2) n += 1;
    const d = L / n, nodes = [], members = [];
    const add = (x, y, name) => { nodes.push({ x, y, name }); return nodes.length - 1; };
    const mem = (a, b) => members.push({ a, b });
    const Lw = [], U = [];
    for (let i = 0; i <= n; i++) Lw[i] = add(i * d, 0, 'L' + i);
    if (type === 'pratt' || type === 'howe') {
      for (let i = 0; i <= n; i++) U[i] = add(i * d, h, 'U' + i);
      for (let i = 0; i < n; i++) mem(Lw[i], Lw[i + 1]);
      for (let i = 0; i < n; i++) mem(U[i], U[i + 1]);
      for (let i = 0; i <= n; i++) mem(Lw[i], U[i]);
      for (let i = 0; i < n; i++) {
        const left = i < n / 2;
        const prattDiag = left ? [U[i], Lw[i + 1]] : [Lw[i], U[i + 1]];
        const howeDiag = left ? [Lw[i], U[i + 1]] : [U[i], Lw[i + 1]];
        const [a, b] = type === 'pratt' ? prattDiag : howeDiag;
        mem(a, b);
      }
    } else if (type === 'warren') {
      for (let i = 0; i < n; i++) U[i] = add((i + 0.5) * d, h, 'U' + (i + 1));
      for (let i = 0; i < n; i++) mem(Lw[i], Lw[i + 1]);
      for (let i = 0; i < n - 1; i++) mem(U[i], U[i + 1]);
      for (let i = 0; i < n; i++) { mem(Lw[i], U[i]); mem(U[i], Lw[i + 1]); }
    } else { // roof
      const half = n / 2;
      for (let i = 1; i < n; i++) U[i] = add(i * d, h * (1 - Math.abs(i - half) / half), 'U' + i);
      for (let i = 0; i < n; i++) mem(Lw[i], Lw[i + 1]);
      const top = [Lw[0], ...U.slice(1, n), Lw[n]];
      for (let i = 0; i < top.length - 1; i++) mem(top[i], top[i + 1]);
      for (let i = 1; i < n; i++) mem(U[i], Lw[i]);
      for (let i = 1; i < half; i++) { mem(U[i], Lw[i + 1]); mem(U[n - i], Lw[n - i - 1]); }
    }
    members.forEach(m => { m.name = nodes[m.a].name + nodes[m.b].name; });
    T = { nodes, members, pin: Lw[0], roller: Lw[n], n, bottom: Lw, top: U.filter(v => v !== undefined) };
  }

  function applyLoadPreset(p) {
    st.loadPreset = p;
    st.loaded = new Set();
    if (p === 'bottom') T.bottom.slice(1, -1).forEach(i => st.loaded.add(T.nodes[i].name));
    if (p === 'top') T.top.forEach(i => st.loaded.add(T.nodes[i].name));
    if (p === 'center') {
      const mid = T.n / 2;
      if (Number.isInteger(mid)) st.loaded.add('L' + mid);
      else st.loaded.add(T.nodes[T.bottom[Math.floor(mid)]].name);
    }
  }

  const loadOf = i => st.loaded.has(T.nodes[i].name) ? st.P : 0;

  /* ---------------- 해석 ---------------- */
  function solve() {
    const { nodes, members, pin, roller } = T;
    const j = nodes.length, m = members.length, nu = m + 3;
    if (2 * j !== nu) return { error: '정정 트러스가 아닙니다.' };
    const A = Array.from({ length: 2 * j }, () => new Array(nu).fill(0));
    const b = new Array(2 * j).fill(0);
    members.forEach((mb, k) => {
      const p = nodes[mb.a], q = nodes[mb.b];
      const len = Math.hypot(q.x - p.x, q.y - p.y), ux = (q.x - p.x) / len, uy = (q.y - p.y) / len;
      mb.len = len; mb.ux = ux; mb.uy = uy;
      A[2 * mb.a][k] += ux; A[2 * mb.a + 1][k] += uy;
      A[2 * mb.b][k] -= ux; A[2 * mb.b + 1][k] -= uy;
    });
    A[2 * pin][m] = 1; A[2 * pin + 1][m + 1] = 1; A[2 * roller + 1][m + 2] = 1;
    nodes.forEach((nd, i) => { b[2 * i + 1] = loadOf(i); });
    const x = solveLinear(A, b);
    if (!x) return { error: '불안정한 트러스입니다.' };
    const F = x.slice(0, m).map(v => Math.abs(v) < 1e-9 ? 0 : v);
    const R = { Ax: Math.abs(x[m]) < 1e-9 ? 0 : x[m], Ay: x[m + 1], By: x[m + 2] };

    // 변형 (EA 일정, 상대값)
    const K = Array.from({ length: 2 * j }, () => new Array(2 * j).fill(0));
    const Fv = new Array(2 * j).fill(0);
    members.forEach(mb => {
      const c = mb.ux, s = mb.uy, k = 1 / mb.len;
      const kk = [[c * c, c * s], [c * s, s * s]];
      const da = [2 * mb.a, 2 * mb.a + 1], db = [2 * mb.b, 2 * mb.b + 1];
      for (let r = 0; r < 2; r++) for (let q = 0; q < 2; q++) {
        K[da[r]][da[q]] += k * kk[r][q]; K[db[r]][db[q]] += k * kk[r][q];
        K[da[r]][db[q]] -= k * kk[r][q]; K[db[r]][da[q]] -= k * kk[r][q];
      }
    });
    nodes.forEach((nd, i) => { Fv[2 * i + 1] = -loadOf(i); });
    const fixed = new Set([2 * pin, 2 * pin + 1, 2 * roller + 1]);
    const free = [...Array(2 * j).keys()].filter(i => !fixed.has(i));
    const uf = solveLinear(free.map(r => free.map(c => K[r][c])), free.map(r => Fv[r]));
    const u = new Array(2 * j).fill(0);
    if (uf) free.forEach((d, i) => { u[d] = uf[i]; });
    return { F, R, u, Fmax: Math.max(1e-9, ...F.map(Math.abs)) };
  }

  const kind = f => Math.abs(f) < 1e-6 ? 0 : f > 0 ? 'T' : 'C';
  const kindTxt = f => kind(f) === 'T' ? '인장(T)' : kind(f) === 'C' ? '압축(C)' : '0부재';
  const kindCls = f => kind(f) === 'T' ? 'res-T' : kind(f) === 'C' ? 'res-C' : 'res-0';
  const colorOf = f => kind(f) === 'T' ? 'var(--tension)' : kind(f) === 'C' ? 'var(--comp)' : 'var(--zero)';
  const sub = s => `<sub>${s}</sub>`;
  const Fn = mb => `F${sub(mb.name)}`;

  /* ---------------- 좌표 변환 ---------------- */
  let VW = 1000, VH = 460, sc = 1, ox = 0, oy = 0;
  function layout() {
    const maxH = 260;
    sc = Math.min(800 / st.L, maxH / st.h);
    ox = (VW - st.L * sc) / 2;
    oy = 100 + st.h * sc; // y=0 의 화면 위치
    VH = oy + 130;
    $('truss-svg').setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  }
  const X = x => ox + x * sc;
  const Y = y => oy - y * sc;

  /* ---------------- 공통 그리기 ---------------- */
  function nodePos(i, f = 0) {
    const nd = T.nodes[i];
    if (!f || !S.u) return [X(nd.x), Y(nd.y)];
    const mu = Math.max(1e-12, ...S.u.map(Math.abs));
    const k = 0.045 * st.L / mu * f;
    return [X(nd.x + S.u[2 * i] * k), Y(nd.y + S.u[2 * i + 1] * k)];
  }

  function drawSupports(g, opac = 1) {
    const [px, py] = nodePos(T.pin), [rx, ry] = nodePos(T.roller);
    const sg = svgEl('g', { opacity: opac }, g);
    svgEl('polygon', { points: `${px},${py + 6} ${px - 16},${py + 32} ${px + 16},${py + 32}`, class: 'sup-fill' }, sg);
    drawHatch(sg, px - 24, py + 32, px + 24);
    svgEl('polygon', { points: `${rx},${ry + 6} ${rx - 15},${ry + 26} ${rx + 15},${ry + 26}`, class: 'sup-fill' }, sg);
    svgEl('circle', { cx: rx - 8, cy: ry + 31, r: 4.5, class: 'sup-fill' }, sg);
    svgEl('circle', { cx: rx + 8, cy: ry + 31, r: 4.5, class: 'sup-fill' }, sg);
    drawHatch(sg, rx - 24, ry + 36, rx + 24);
  }

  function drawReactions(g, which = ['A', 'B'], opac = 1) {
    const rg = svgEl('g', { opacity: opac }, g);
    const draw = (i, val, label, anchor) => {
      if (Math.abs(val) < 1e-9) return;
      const [x, y] = nodePos(i);
      if (val > 0) drawArrow(rg, x, y + 112, x, y + 44, { color: 'var(--react)', width: 3.5, head: 13 });
      else drawArrow(rg, x, y + 44, x, y + 112, { color: 'var(--react)', width: 3.5, head: 13 });
      svgText(rg, x + (anchor === 'start' ? 10 : -10), y + 100, `${label} = ${fmt(Math.abs(val))} kN`, { 'text-anchor': anchor, 'font-weight': 700, 'font-size': 14, style: 'fill:var(--react)', class: 'val-label' });
    };
    if (which.includes('A')) {
      draw(T.pin, S.R.Ay, 'RA', 'start');
      if (Math.abs(S.R.Ax) > 1e-9) { const [x, y] = nodePos(T.pin); drawArrow(rg, x - 70, y + 20, x - 22, y + 20, { color: 'var(--react)' }); }
    }
    if (which.includes('B')) draw(T.roller, S.R.By, 'RB', 'end');
  }

  function drawLoads(g, filter = () => true, opac = 1) {
    const lg = svgEl('g', { opacity: opac }, g);
    T.nodes.forEach((nd, i) => {
      if (!loadOf(i) || !filter(i)) return;
      const [x, y] = nodePos(i, curF());
      const isTop = nd.y > 1e-9 || i === T.pin || i === T.roller;
      if (isTop) drawArrow(lg, x, y - 62, x, y - 9, { color: 'var(--load)', width: 3.2, head: 12 });
      else drawArrow(lg, x, y + 9, x, y + 62, { color: 'var(--load)', width: 3.2, head: 12 });
      svgText(lg, x, isTop ? y - 68 : y + 78, `${fmt(st.P)} kN`, { 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 13, style: 'fill:var(--load)', class: 'val-label' });
    });
  }

  function drawNodes(g, opts = {}) {
    T.nodes.forEach((nd, i) => {
      const [x, y] = nodePos(i, curF());
      const ng = svgEl('g', { class: 'node', 'data-node': i, opacity: opts.opac ? opts.opac(i) : 1 }, g);
      const hl = opts.hl === i;
      if (hl) svgEl('circle', { cx: x, cy: y, r: 17, style: 'fill:var(--hl);opacity:.45', class: 'pulse' }, ng);
      svgEl('circle', { cx: x, cy: y, r: 7, style: `fill:var(--surface);stroke:var(--beam);stroke-width:${hl ? 3.5 : 2.2}` }, ng);
      svgEl('circle', { cx: x, cy: y, r: 14, style: 'fill:transparent' }, ng);
      const below = nd.y < 1e-9;
      svgText(ng, x + (below ? -12 : -12), y + (below ? 22 : -14), nd.name, { 'text-anchor': 'end', 'font-size': 12.5, 'font-weight': 700, class: 'svg-muted val-label' });
    });
  }

  /* 부재: 굵기 ∝ |F|, 색 = 인장/압축, 화살표 = 부재가 양끝에서 받는 힘 */
  function drawMember(g, k, o = {}) {
    const mb = T.members[k], f = S.F[k];
    const [x1, y1] = nodePos(mb.a, curF()), [x2, y2] = nodePos(mb.b, curF());
    const mg = svgEl('g', { class: 'member', 'data-member': k, opacity: o.opac ?? 1 }, g);
    const color = o.color || colorOf(f);
    const w = o.width || (3 + 9 * Math.abs(f) / S.Fmax);
    if (o.glow) svgEl('line', { x1, y1, x2, y2, style: `stroke:var(--hl);stroke-width:${w + 12}px;stroke-linecap:round;opacity:.55`, class: 'pulse' }, mg);
    svgEl('line', { x1, y1, x2, y2, style: `stroke:${color};stroke-width:${w}px;stroke-linecap:round` + (o.dash || (!o.color && kind(f) === 0) ? ';stroke-dasharray:7 6' : '') }, mg);
    svgEl('line', { x1, y1, x2, y2, style: 'stroke:transparent;stroke-width:18px' }, mg);
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    if (o.arrows && kind(f) && len > 60) {
      const out = kind(f) === 'T';
      const ah = Math.min(13, len * 0.12);
      for (const [t, s] of [[0.2, -1], [0.8, 1]]) {
        const cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
        const dir = out ? s : -s;
        arrowHead(mg, cx + ux * dir * ah / 2, cy + uy * dir * ah / 2, ux * dir, uy * dir, ah, 'var(--surface)');
        arrowHead(mg, cx + ux * dir * ah / 2, cy + uy * dir * ah / 2, ux * dir, uy * dir, ah * 0.72, color);
      }
    }
    if (o.label) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const txt = o.labelText || (kind(f) ? `${fmt(Math.abs(f), 1)} ${kind(f)}` : '0');
      const wbox = txt.length * 7.4 + 10;
      svgEl('rect', { x: mx - wbox / 2, y: my - 10, width: wbox, height: 20, rx: 6, class: 'badge-bg' }, mg);
      svgText(mg, mx, my + 4.5, txt, { 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, style: `fill:${o.labelColor || color}` });
    }
    return mg;
  }

  let curFactor = 0;
  const curF = () => (st.mode === 'result' && st.anim) ? curFactor : 0;

  /* ---------------- 결과 모드 ---------------- */
  function renderResult() {
    const svg = $('truss-svg');
    clearSvg(svg);
    const g = svgEl('g', {}, svg);
    if (st.anim) {
      T.members.forEach(mb => {
        const [x1, y1] = nodePos(mb.a), [x2, y2] = nodePos(mb.b);
        svgEl('line', { x1, y1, x2, y2, style: 'stroke:var(--zero);stroke-width:1.5;stroke-dasharray:4 4;opacity:.6' }, g);
      });
    }
    drawSupports(g);
    T.members.forEach((mb, k) => drawMember(g, k, { arrows: st.arrows, label: st.labels && !st.anim, glow: st.selMember === k }));
    drawLoads(g);
    drawReactions(g);
    drawNodes(g);
    $('truss-title').textContent = '부재력 결과';
    $('truss-tag').textContent = st.anim ? '변형을 과장해서 보여 줍니다 — 인장 부재는 늘어나고, 압축 부재는 줄어듭니다' : '부재를 클릭하면 설명이 나옵니다 · 절점 클릭 = 하중 추가/삭제';
  }

  function resultPanel() {
    const F = S.F, M = T.members;
    const groups = { '상현재 (위쪽 부재)': [], '하현재 (아래쪽 부재)': [], '수직재·사재 (복부재)': [] };
    const gname = { top: '상현재 (위쪽 부재)', bottom: '하현재 (아래쪽 부재)', web: '수직재·사재 (복부재)' };
    M.forEach((mb, k) => groups[gname[memberGroup(mb)]].push(k));
    let h = `<div class="dcard steps">`;
    if (st.selMember !== null) {
      const mb = M[st.selMember], f = F[st.selMember];
      h += `<div class="check-box" style="margin:0 0 10px">🔎 <b>부재 ${mb.name}</b> — 길이 ${fmt(mb.len)} m, 부재력 <span class="${kindCls(f)}">${fmt(f)} kN (${kindTxt(f)})</span><br>${
        kind(f) === 'T' ? '이 부재는 양끝 절점에 의해 <b>잡아당겨지고</b> 있습니다. 밧줄이나 강봉으로 바꿔도 버틸 수 있는 부재입니다.' :
        kind(f) === 'C' ? '이 부재는 양끝에서 <b>눌리고</b> 있습니다. 길고 가늘면 옆으로 휘어 버리는 <b>좌굴</b>에 주의해야 합니다.' :
        '이 하중 조건에서는 힘을 받지 않는 <b>0부재</b>입니다. 그래도 형태 유지와 다른 하중 조건을 위해 필요합니다.'}</div>`;
    }
    h += `<h3>📋 부재력 표</h3><div class="tbl-wrap"><table class="tbl"><tr><th>구분</th><th>부재</th><th>부재력 (kN)</th><th>상태</th></tr>`;
    for (const gname in groups) groups[gname].forEach((k, i) => {
      h += `<tr data-mrow="${k}" style="cursor:pointer">${i === 0 ? `<td rowspan="${groups[gname].length}">${gname}</td>` : ''}<td>${M[k].name}</td><td class="${kindCls(F[k])}">${fmt(F[k])}</td><td class="${kindCls(F[k])}">${kindTxt(F[k])}</td></tr>`;
    });
    h += `</table></div><p>반력: R<sub>A</sub> = ${fmt(S.R.Ay)} kN ↑, R<sub>B</sub> = ${fmt(S.R.By)} kN ↑ (하중 합 ${fmt(st.P * st.loaded.size)} kN)</p>`;
    h += `<p class="hint">관찰 포인트: 단순보처럼 트러스도 가운데가 아래로 처지려 하므로 <b>상현재는 압축, 하현재는 인장</b>이 됩니다. 가운데로 갈수록 현재(chord)의 힘이 커지는 것은 보의 휨모멘트가 가운데서 최대인 것과 같은 원리입니다.</p></div>`;
    return h;
  }
  function memberGroup(mb) {
    const a = T.nodes[mb.a], b = T.nodes[mb.b];
    if (a.y < 1e-9 && b.y < 1e-9) return 'bottom';
    if (a.name[0] === 'U' && b.name[0] === 'U') return 'top';
    if (st.type === 'roof' && [mb.a, mb.b].some(i => i === T.pin || i === T.roller)) return 'top';
    return 'web';
  }

  /* ---------------- 절점법 ---------------- */
  function jointSequence() {
    const steps = [];
    const solved = new Set();
    const remaining = T.nodes.map((n, i) => i).sort((a, b) => T.nodes[a].x - T.nodes[b].x || T.nodes[a].y - T.nodes[b].y);
    const inc = i => T.members.map((m, k) => k).filter(k => T.members[k].a === i || T.members[k].b === i);
    const left = new Set(remaining);
    while (left.size) {
      let best = null, bestU = null;
      for (const i of remaining) {
        if (!left.has(i)) continue;
        const unk = inc(i).filter(k => !solved.has(k));
        if (unk.length === 0) { left.delete(i); continue; }
        if (unk.length > 2) continue;
        if (unk.length === 2) {
          const m1 = T.members[unk[0]], m2 = T.members[unk[1]];
          if (Math.abs(m1.ux * m2.uy - m1.uy * m2.ux) < 1e-6) continue;
        }
        best = i; bestU = unk; // 교재처럼 왼쪽부터 차례로
        break;
      }
      if (best === null) break;
      steps.push({ node: best, unknown: bestU, known: inc(best).filter(k => solved.has(k)) });
      bestU.forEach(k => solved.add(k));
      left.delete(best);
    }
    return steps;
  }

  function dirFrom(i, k) {
    const mb = T.members[k], s = mb.a === i ? 1 : -1;
    return { ux: mb.ux * s, uy: mb.uy * s };
  }
  const deg = r => r * 180 / Math.PI;
  function comp(u, axis, alpha) {
    if (Math.abs(u) < 1e-9) return null;
    const sign = u > 0 ? '+' : '−';
    if (Math.abs(Math.abs(u) - 1) < 1e-9) return { sign, f: '' };
    return { sign, f: axis === 'x' ? `cos ${fmt(alpha, 1)}°` : `sin ${fmt(alpha, 1)}°` };
  }

  function jointEquations(stp) {
    const i = stp.node, nd = T.nodes[i];
    const tx = [], ty = [];
    const push = (arr, c, body) => { if (c) arr.push(`${c.sign} ${body}${c.f ? '·' + c.f : ''}`); };
    for (const k of [...stp.known, ...stp.unknown]) {
      const d = dirFrom(i, k), alpha = deg(Math.atan2(Math.abs(d.uy), Math.abs(d.ux)));
      const body = stp.unknown.includes(k) ? `<b>${Fn(T.members[k])}</b>` : `(${fmt(S.F[k])})`;
      push(tx, comp(d.ux, 'x', alpha), body);
      push(ty, comp(d.uy, 'y', alpha), body);
    }
    if (loadOf(i)) ty.push(`− ${fmt(st.P)}`);
    if (i === T.pin) { if (Math.abs(S.R.Ax) > 1e-9) tx.push(`+ ${fmt(S.R.Ax)}`); ty.push(`+ ${fmt(S.R.Ay)}<small>(R<sub>A</sub>)</small>`); }
    if (i === T.roller) ty.push(`+ ${fmt(S.R.By)}<small>(R<sub>B</sub>)</small>`);
    const clean = arr => (arr.join(' ').replace(/^\+ /, '') || '0');
    return { x: clean(tx), y: clean(ty), name: nd.name };
  }

  function renderJoints() {
    const steps = jointSequence();
    st.step = clamp(st.step, 0, steps.length);
    const svg = $('truss-svg');
    clearSvg(svg);
    const g = svgEl('g', {}, svg);
    const solvedBefore = new Set();
    for (let s = 0; s < st.step - 1; s++) steps[s].unknown.forEach(k => solvedBefore.add(k));
    const cur = st.step > 0 ? steps[st.step - 1] : null;
    if (cur && st.reveal) cur.unknown.forEach(k => solvedBefore.add(k));

    drawSupports(g);
    T.members.forEach((mb, k) => {
      const isCur = cur && cur.unknown.includes(k);
      if (solvedBefore.has(k)) drawMember(g, k, { label: true, arrows: st.arrows, glow: isCur });
      else if (isCur) drawMember(g, k, { color: 'var(--unknown)', width: 5, glow: true, label: true, labelText: '?', dash: '8 6' });
      else drawMember(g, k, { color: 'var(--zero)', width: 3, opac: 0.45 });
    });
    drawLoads(g);
    drawReactions(g, st.step === 0 ? ['A', 'B'] : ['A', 'B']);
    drawNodes(g, { hl: cur ? cur.node : null });
    $('truss-title').textContent = '절점법: 절점 하나씩 떼어 내어 풀기';
    $('truss-tag').textContent = cur ? `지금 푸는 절점: ${T.nodes[cur.node].name}` : '0단계: 반력부터';
    return steps;
  }

  function jointFBD(stp) {
    const W = 360, H = 320, cx = 180, cy = 160;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fbd-svg', id: 'truss-fbd' });
    const i = stp.node;
    let downOccupied = false, upOccupied = false;
    // 좌표축
    drawArrow(svg, 18, H - 18, 58, H - 18, { color: 'var(--muted)', width: 1.5, head: 7 });
    drawArrow(svg, 18, H - 18, 18, H - 58, { color: 'var(--muted)', width: 1.5, head: 7 });
    svgText(svg, 62, H - 14, '+x', { 'font-size': 11, class: 'svg-muted' });
    svgText(svg, 10, H - 62, '+y', { 'font-size': 11, class: 'svg-muted' });
    for (const k of [...stp.known, ...stp.unknown]) {
      const d = dirFrom(i, k), dx = d.ux, dy = -d.uy;
      if (dy > 0.9) downOccupied = true;
      if (dy < -0.9) upOccupied = true;
      const mb = T.members[k];
      svgEl('line', { x1: cx, y1: cy, x2: cx + dx * 120, y2: cy + dy * 120, style: 'stroke:var(--zero);stroke-width:7;stroke-linecap:round;opacity:.35' }, svg);
      const unknown = stp.unknown.includes(k);
      const f = S.F[k];
      const showActual = !unknown || st.reveal;
      let color, away;
      if (showActual) { color = colorOf(f); away = kind(f) !== 'C'; }
      else { color = 'var(--unknown)'; away = true; }
      if (!showActual || kind(f)) {
        const a = [cx + dx * 26, cy + dy * 26], b = [cx + dx * 100, cy + dy * 100];
        if (away) drawArrow(svg, a[0], a[1], b[0], b[1], { color, width: 3.2, head: 12, dash: showActual ? null : '6 4' });
        else drawArrow(svg, b[0], b[1], a[0], a[1], { color, width: 3.2, head: 12 });
      }
      const lx = cx + dx * 128, ly = cy + dy * 128 + 4;
      const txt = showActual ? `${mb.name} = ${fmt(f, 1)}` : `${mb.name} = ?`;
      svgText(svg, clamp(lx, 50, W - 50), clamp(ly, 16, H - 30), txt, { 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, style: `fill:${color}`, class: 'val-label' });
    }
    if (loadOf(i)) {
      if (!downOccupied) { drawArrow(svg, cx, cy + 12, cx, cy + 80, { color: 'var(--load)', width: 3.2, head: 12 }); svgText(svg, cx + 8, cy + 72, `${fmt(st.P)} kN`, { 'font-size': 13, 'font-weight': 700, style: 'fill:var(--load)', class: 'val-label' }); }
      else { drawArrow(svg, cx, cy - 80, cx, cy - 12, { color: 'var(--load)', width: 3.2, head: 12 }); svgText(svg, cx + 8, cy - 66, `${fmt(st.P)} kN`, { 'font-size': 13, 'font-weight': 700, style: 'fill:var(--load)', class: 'val-label' }); }
    }
    const R = i === T.pin ? S.R.Ay : i === T.roller ? S.R.By : null;
    if (R !== null && Math.abs(R) > 1e-9) {
      const y0 = cy + 12;
      drawArrow(svg, cx + 22, y0 + 76, cx + 22, y0, { color: 'var(--react)', width: 3.2, head: 12 });
      svgText(svg, cx + 30, y0 + 70, `R = ${fmt(R)} kN`, { 'font-size': 13, 'font-weight': 700, style: 'fill:var(--react)', class: 'val-label' });
    }
    svgEl('circle', { cx, cy, r: 9, style: 'fill:var(--surface);stroke:var(--beam);stroke-width:3' }, svg);
    svgText(svg, cx - 14, cy - 14, T.nodes[i].name, { 'text-anchor': 'end', 'font-weight': 800, 'font-size': 15 });
    return svg;
  }

  function jointsPanel(steps) {
    const total = steps.length;
    let h = `<div class="dcard"><div class="stepper">
      <button class="btn sm" data-js="first">⏮ 처음</button>
      <button class="btn sm" data-js="prev" ${st.step === 0 ? 'disabled' : ''}>◀ 이전</button>
      <span class="count">${st.step} / ${total} 단계</span>
      <button class="btn sm primary" data-js="next" ${st.step >= total ? 'disabled' : ''}>다음 ▶</button>
      ${st.step > 0 ? `<button class="btn sm" data-js="reveal">${st.reveal ? '🙈 답 숨기기' : '💡 답 확인'}</button>` : ''}
    </div>`;
    if (st.step === 0) {
      const xs = T.nodes.map((n, i) => ({ i, n })).filter(o => loadOf(o.i));
      const terms = xs.map(o => `${fmt(st.P)}×${fmt(o.n.x)}`).join(' + ') || '0';
      h += `<div class="steps"><h4><span class="step-dot">0</span>먼저 트러스 전체를 하나의 덩어리로 보고 반력을 구합니다</h4>
        <p>(보에서 반력을 구할 때와 똑같습니다.)</p>
        <div class="eq">ΣM<sub>A</sub> = 0 : ${terms} − R<sub>B</sub>×${fmt(st.L)} = 0 → <span class="ans">R<sub>B</sub> = ${fmt(S.R.By)} kN</span></div>
        <div class="eq">ΣF<sub>y</sub> = 0 : R<sub>A</sub> + R<sub>B</sub> − ${fmt(st.P * xs.length)} = 0 → <span class="ans">R<sub>A</sub> = ${fmt(S.R.Ay)} kN</span></div>
        <div class="eq">ΣF<sub>x</sub> = 0 : <span class="ans">H<sub>A</sub> = ${fmt(S.R.Ax)}</span></div>
        <p><b>절점법의 규칙</b></p>
        <ul class="events">
          <li>한 절점에서 쓸 수 있는 식은 ΣF<sub>x</sub> = 0, ΣF<sub>y</sub> = 0 두 개뿐 → <b>모르는 부재가 2개 이하인 절점</b>부터 풉니다.</li>
          <li>모르는 부재력은 일단 <b>인장</b>이라고 가정합니다. 인장 부재는 절점을 <b>잡아당기므로</b> 화살표가 절점에서 <b>멀어지는 방향</b>입니다.</li>
          <li>계산 결과가 <b>+</b>이면 가정이 맞은 것(인장), <b>−</b>이면 반대(압축)입니다.</li>
        </ul>
        <p>▶ <b>다음</b>을 눌러 첫 번째 절점으로 가 보세요.</p></div>`;
    } else {
      const stp = steps[st.step - 1];
      const eq = jointEquations(stp);
      const nd = T.nodes[stp.node];
      const unkNames = stp.unknown.map(k => Fn(T.members[k])).join(', ');
      h += `<div class="panel-grid"><div id="fbd-holder"></div><div>
        <h4 style="margin:4px 0">절점 ${nd.name} 자유물체도</h4>
        <p>이 절점에 연결된 부재 중 <b>아직 모르는 것: ${unkNames}</b> (${stp.unknown.length}개) ${stp.known.length ? `· 이미 구한 것: ${stp.known.map(k => T.members[k].name).join(', ')}` : ''}</p>
        <p class="hint">점선 주황 화살표 = 인장이라고 가정한 미지 부재력 (절점에서 멀어지는 방향). 각도는 수평선 기준.</p>
        <div class="eq">ΣF<sub>x</sub> = 0 : ${eq.x} = 0</div>
        <div class="eq">ΣF<sub>y</sub> = 0 : ${eq.y} = 0</div>`;
      if (st.reveal) {
        h += `<p>${stp.unknown.length === 2 ? '두 식을 연립하면' : '식을 풀면'}:</p>`;
        stp.unknown.forEach(k => {
          const f = S.F[k];
          h += `<div class="eq">${Fn(T.members[k])} = <span class="${kindCls(f)}">${fmt(f)} kN</span> → ${f < -1e-6 ? '음수이므로 가정과 반대 → ' : ''}<span class="${kindCls(f)}">${kindTxt(f)}</span></div>`;
        });
        const zeroNote = stp.unknown.some(k => kind(S.F[k]) === 0);
        if (zeroNote) h += `<p class="hint">💡 0부재 판별법: 하중이 없는 절점에 부재가 3개 있고 그중 2개가 일직선이면, 나머지 1개는 0부재입니다.</p>`;
      } else {
        h += `<p>식을 직접 풀어 본 뒤 <b>💡 답 확인</b>을 눌러 보세요.</p>`;
      }
      h += `</div></div>`;
    }
    h += `</div>`;
    return h;
  }

  /* ---------------- 절단법 ---------------- */
  function cutCandidates() {
    const xs = [...new Set(T.nodes.map(n => +n.x.toFixed(6)))].sort((a, b) => a - b);
    const c = [];
    for (let i = 0; i < xs.length - 1; i++) c.push((xs[i] + xs[i + 1]) / 2);
    return c;
  }

  function lineIntersect(p1, d1, p2, d2) {
    const den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den;
    return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
  }

  function sectionAnalysis(c) {
    const cut = [];
    T.members.forEach((mb, k) => {
      const a = T.nodes[mb.a], b = T.nodes[mb.b];
      if (Math.min(a.x, b.x) < c && Math.max(a.x, b.x) > c) {
        const li = a.x < b.x ? mb.a : mb.b, ri = li === mb.a ? mb.b : mb.a;
        const pl = T.nodes[li], pr = T.nodes[ri];
        const len = Math.hypot(pr.x - pl.x, pr.y - pl.y);
        const e = { x: (pr.x - pl.x) / len, y: (pr.y - pl.y) / len };
        const t = (c - pl.x) / (pr.x - pl.x);
        cut.push({ k, li, ri, e, p: { x: pl.x, y: pl.y }, at: { x: c, y: pl.y + (pr.y - pl.y) * t } });
      }
    });
    const leftNodes = new Set(T.nodes.map((n, i) => i).filter(i => T.nodes[i].x < c));
    // 왼쪽 부분의 외력
    const ext = [];
    leftNodes.forEach(i => {
      const nd = T.nodes[i];
      if (i === T.pin) { ext.push({ name: 'R<sub>A</sub>', x: nd.x, y: nd.y, Fx: S.R.Ax, Fy: S.R.Ay }); }
      if (loadOf(i)) ext.push({ name: `P<sub>${nd.name}</sub>`, x: nd.x, y: nd.y, Fx: 0, Fy: -st.P });
    });
    const eqs = [];
    if (cut.length >= 2 && cut.length <= 3) {
      cut.forEach(cm => {
        const others = cut.filter(o => o !== cm);
        let O = null;
        if (others.length === 2) O = lineIntersect(others[0].p, others[0].e, others[1].p, others[1].e);
        else { // 다른 부재 선 위에서, 자기 부재와 공유하지 않는 끝점
          const o = others[0], ni = (o.li === cm.li || o.li === cm.ri) ? o.ri : o.li, rn = T.nodes[ni];
          O = { x: rn.x, y: rn.y };
        }
        const mb = T.members[cm.k];
        if (O) {
          const terms = [];
          let sum = 0;
          ext.forEach(f => {
            const mFy = (f.x - O.x) * f.Fy, mFx = -(f.y - O.y) * f.Fx;
            if (Math.abs(mFy) > 1e-9) terms.push({ v: mFy, s: `${fmt(Math.abs(f.Fy))}×${fmt(Math.abs(f.x - O.x))}`, n: f.name });
            if (Math.abs(mFx) > 1e-9) terms.push({ v: mFx, s: `${fmt(Math.abs(f.Fx))}×${fmt(Math.abs(f.y - O.y))}`, n: f.name });
            sum += mFy + mFx;
          });
          const coef = (cm.p.x - O.x) * cm.e.y - (cm.p.y - O.y) * cm.e.x;
          const nodeAtO = T.nodes.findIndex(n => Math.hypot(n.x - O.x, n.y - O.y) < 1e-6);
          const oname = nodeAtO >= 0 ? T.nodes[nodeAtO].name : 'O';
          let str = terms.map((t, i) => `${t.v >= 0 ? (i ? '+ ' : '') : '− '}${t.s}<small>(${t.n})</small>`).join(' ');
          str += ` ${coef >= 0 ? '+' : '−'} <b>${Fn(mb)}</b>×${fmt(Math.abs(coef))}`;
          eqs.push({
            k: cm.k, type: 'M', O, oname, others: others.map(o => o.k),
            head: `ΣM<sub>${oname}</sub> = 0 <small>(반시계 +)</small>`,
            body: str.replace(/^\s*\+\s*/, '') + ' = 0',
            why: nodeAtO >= 0 ? `${others.map(o => T.members[o.k].name).join(' · ')}의 힘이 모두 <b>${oname}</b>을 지나므로 그 모멘트는 0 → ${mb.name}만 남습니다.` :
              `${others.map(o => T.members[o.k].name).join(' · ')}의 연장선이 만나는 점 <b>O</b> (x = ${fmt(O.x)}, y = ${fmt(O.y)})에 대해 모멘트를 잡습니다.`,
            val: Math.abs(coef) > 1e-9 ? -sum / coef : NaN,
          });
        } else {
          // 나머지 두 부재가 평행 → 그 수직 방향 힘의 평형
          const d = others[0].e;
          let nrm = { x: -d.y, y: d.x };
          if (nrm.y < -1e-9 || (Math.abs(nrm.y) < 1e-9 && nrm.x < 0)) nrm = { x: -nrm.x, y: -nrm.y };
          const vertical = Math.abs(nrm.y - 1) < 1e-9;
          const terms = [];
          let sum = 0;
          ext.forEach(f => {
            const v = f.Fx * nrm.x + f.Fy * nrm.y;
            if (Math.abs(v) > 1e-9) terms.push(`${v >= 0 ? '+' : '−'} ${fmt(Math.abs(v))}<small>(${f.name})</small>`);
            sum += v;
          });
          const coef = cm.e.x * nrm.x + cm.e.y * nrm.y;
          const alpha = deg(Math.atan2(Math.abs(cm.e.y), Math.abs(cm.e.x)));
          const cc = vertical ? comp(cm.e.y, 'y', alpha) : { sign: coef >= 0 ? '+' : '−', f: fmt(Math.abs(coef), 3) };
          let str = terms.join(' ') + ` ${cc.sign} <b>${Fn(mb)}</b>${cc.f ? '·' + cc.f : ''}`;
          eqs.push({
            k: cm.k, type: 'F', others: others.map(o => o.k),
            head: vertical ? 'ΣF<sub>y</sub> = 0' : 'ΣF<sub>⊥</sub> = 0 <small>(평행한 두 부재에 수직 방향)</small>',
            body: str.replace(/^\s*\+\s*/, '') + ' = 0',
            why: `${others.map(o => T.members[o.k].name).join(' · ')}는 서로 <b>평행</b>해서 만나는 점이 없습니다. 대신 ${vertical ? '두 부재가 수평이므로 <b>세로 방향 힘</b>' : '그 <b>수직 방향 힘</b>'}의 평형을 쓰면 ${mb.name}만 남습니다.`,
            val: Math.abs(coef) > 1e-9 ? -sum / coef : NaN,
          });
        }
      });
    }
    return { cut, leftNodes, ext, eqs };
  }

  function renderSections() {
    const cands = cutCandidates();
    st.cutIdx = clamp(st.cutIdx, 0, cands.length - 1);
    const c = cands[st.cutIdx];
    const A = sectionAnalysis(c);
    st.selEq = clamp(st.selEq, 0, Math.max(0, A.eqs.length - 1));
    const svg = $('truss-svg');
    clearSvg(svg);
    const g = svgEl('g', {}, svg);
    const isLeft = i => A.leftNodes.has(i);
    const cutSet = new Set(A.cut.map(o => o.k));
    const fade = 0.16;

    drawSupports(g);
    T.members.forEach((mb, k) => {
      if (cutSet.has(k)) return;
      const left = isLeft(mb.a) && isLeft(mb.b);
      drawMember(g, k, left ? { color: 'var(--beam)', width: 4 } : { color: 'var(--zero)', width: 3, opac: fade });
    });
    const sel = A.eqs[st.selEq];
    // 절단 부재: 왼쪽 조각은 진하게, 오른쪽은 흐리게
    A.cut.forEach(cm => {
      const [lx, ly] = [X(T.nodes[cm.li].x), Y(T.nodes[cm.li].y)], [rx, ry] = [X(T.nodes[cm.ri].x), Y(T.nodes[cm.ri].y)];
      const [cx, cy] = [X(cm.at.x), Y(cm.at.y)];
      const isSel = sel && sel.k === cm.k;
      if (isSel) svgEl('line', { x1: lx, y1: ly, x2: cx, y2: cy, style: 'stroke:var(--hl);stroke-width:16px;stroke-linecap:round;opacity:.5', class: 'pulse' }, g);
      svgEl('line', { x1: lx, y1: ly, x2: cx, y2: cy, style: 'stroke:var(--beam);stroke-width:4px;stroke-linecap:round' }, g);
      svgEl('line', { x1: cx, y1: cy, x2: rx, y2: ry, style: `stroke:var(--zero);stroke-width:3px;opacity:${fade}` }, g);
    });
    // 모멘트 중심과 보조선
    if (sel && sel.type === 'M') {
      const [oxp, oyp] = [X(sel.O.x), Y(sel.O.y)];
      sel.others.forEach(k => {
        const cm = A.cut.find(o => o.k === k);
        svgEl('line', { x1: X(cm.at.x), y1: Y(cm.at.y), x2: oxp, y2: oyp, style: 'stroke:var(--accent);stroke-width:1.6;stroke-dasharray:5 5' }, g);
      });
      svgEl('circle', { cx: oxp, cy: oyp, r: 13, style: 'fill:none;stroke:var(--accent);stroke-width:3' }, g);
      svgEl('circle', { cx: oxp, cy: oyp, r: 4, style: 'fill:var(--accent)' }, g);
      svgText(g, oxp + 16, oyp - 14, `모멘트 중심 ${sel.oname}`, { 'font-size': 13, 'font-weight': 800, style: 'fill:var(--accent)', class: 'val-label' });
    }
    // 절단선
    const cx = X(c);
    svgEl('line', { x1: cx, y1: 30, x2: cx, y2: VH - 20, style: 'stroke:var(--accent);stroke-width:2.5;stroke-dasharray:10 6' }, g);
    svgText(g, cx, 24, '✂ 절단', { 'text-anchor': 'middle', 'font-weight': 800, 'font-size': 14, style: 'fill:var(--accent)' });

    drawLoads(g, i => isLeft(i));
    drawLoads(g, i => !isLeft(i), fade);
    drawReactions(g, ['A']);
    drawReactions(g, ['B'], fade);
    drawNodes(g, { opac: i => isLeft(i) ? 1 : fade + 0.1 });

    // 미지 부재력 화살표 (인장 가정: 왼쪽 조각에서 멀어지는 방향)
    A.cut.forEach(cm => {
      const [px, py] = [X(cm.at.x), Y(cm.at.y)];
      const ex = cm.e.x, ey = -cm.e.y;
      const f = S.F[cm.k];
      const revealed = st.reveal;
      const color = revealed ? colorOf(f) : 'var(--unknown)';
      const outward = !revealed || kind(f) !== 'C';
      if (!revealed || kind(f)) {
        if (outward) drawArrow(g, px + ex * 6, py + ey * 6, px + ex * 62, py + ey * 62, { color, width: 3.4, head: 13, dash: revealed ? null : '6 4' });
        else drawArrow(g, px + ex * 62, py + ey * 62, px + ex * 6, py + ey * 6, { color, width: 3.4, head: 13 });
      }
      const mb = T.members[cm.k];
      svgText(g, px + ex * 70 + 4, py + ey * 70 + (ey > 0.3 ? 14 : ey < -0.3 ? -4 : -8), revealed ? `${mb.name} = ${fmt(f, 1)}` : `F(${mb.name}) = ?`, { 'font-size': 13, 'font-weight': 800, style: `fill:${color}`, class: 'val-label' });
    });

    $('truss-cut').max = cands.length - 1;
    $('truss-cut').value = st.cutIdx;
    $('truss-cut-out').textContent = `x = ${fmt(c)} m`;
    $('truss-title').textContent = '절단법: 잘라서 한쪽 덩어리의 평형 보기';
    $('truss-tag').textContent = '그림을 클릭하거나 슬라이더로 자르는 위치를 바꿔 보세요';
    return A;
  }

  function sectionsPanel(A) {
    let h = `<div class="dcard steps">`;
    h += `<div class="stepper"><button class="btn sm" data-sec="prev">◀ 왼쪽 패널</button><button class="btn sm" data-sec="next">오른쪽 패널 ▶</button>
      <button class="btn sm ${st.reveal ? '' : 'primary'}" data-js="reveal">${st.reveal ? '🙈 답 숨기기' : '💡 답 확인'}</button></div>`;
    if (A.cut.length > 3) {
      h += `<p>⚠ 이 위치에서는 잘리는 부재가 <b>${A.cut.length}개</b>라서 식(3개)보다 미지수가 많습니다. 다른 위치를 선택하세요.</p></div>`;
      return h;
    }
    h += `<p>절단선 <b>왼쪽 덩어리</b>만 떼어 내 봅니다. 이 덩어리도 가만히 있어야 하므로 <b>ΣF<sub>x</sub> = 0, ΣF<sub>y</sub> = 0, ΣM = 0</b>이 성립합니다. 잘린 부재 <b>${A.cut.map(o => T.members[o.k].name).join(', ')}</b>의 힘은 일단 <b>인장(덩어리에서 멀어지는 방향)</b>으로 가정합니다.</p>`;
    h += `<p class="hint">왼쪽 덩어리에 작용하는 외력: ${A.ext.length ? A.ext.map(f => `${f.name} = ${fmt(Math.abs(f.Fy))} kN ${f.Fy > 0 ? '↑' : '↓'}`).join(', ') : '없음'}. 식 카드를 클릭하면 그림에 모멘트 중심이 표시됩니다.</p>`;
    A.eqs.forEach((e, i) => {
      const mb = T.members[e.k], f = S.F[e.k];
      h += `<div class="eq-card ${i === st.selEq ? 'sel' : ''}" data-eq="${i}">
        <b>${mb.name} 구하기</b> — <span class="muted">${e.why}</span>
        <div class="eq">${e.head} : ${e.body}</div>
        ${st.reveal ? `<div>→ ${Fn(mb)} = <span class="${kindCls(f)}">${fmt(e.val)} kN</span> → <span class="${kindCls(f)}">${kindTxt(f)}</span></div>` : ''}
      </div>`;
    });
    h += `<p class="hint">💡 절단법의 요령: <b>"나머지 미지수들이 지나가는 점"</b>을 골라 모멘트를 잡으면 식 하나에 미지수 하나만 남습니다. 상현재 힘은 하현재 절점에 대해, 하현재 힘은 상현재 절점에 대해 모멘트를 잡는 것이 보통입니다.</p>`;
    h += `</div>`;
    return h;
  }

  /* ---------------- 전체 갱신 ---------------- */
  function render() {
    layout();
    $('truss-cut-wrap').classList.toggle('show', st.mode === 'sections');
    document.querySelectorAll('#truss-mode button').forEach(b => b.classList.toggle('active', b.dataset.v === st.mode));
    document.querySelectorAll('#truss-type button').forEach(b => b.classList.toggle('active', b.dataset.v === st.type));
    $('truss-type-desc').textContent = TYPE_INFO[st.type];
    $('truss-n-out').textContent = `${T.n}`;
    $('truss-L-out').textContent = `${fmt(st.L)} m`;
    $('truss-h-out').textContent = `${fmt(st.h)} m`;
    $('truss-P-out').textContent = `${fmt(st.P)} kN`;
    const panel = $('truss-panel');
    if (S.error) { clearSvg($('truss-svg')); panel.innerHTML = `<div class="dcard">${S.error}</div>`; return; }
    if (st.mode === 'result') { renderResult(); panel.innerHTML = resultPanel(); }
    else if (st.mode === 'joints') {
      const steps = renderJoints();
      panel.innerHTML = jointsPanel(steps);
      const holder = $('fbd-holder');
      if (holder && st.step > 0) holder.appendChild(jointFBD(steps[st.step - 1]));
    } else {
      const A = renderSections();
      panel.innerHTML = sectionsPanel(A);
    }
    manageAnim();
  }

  function rebuild(keepLoads = false) {
    build();
    if (!keepLoads) applyLoadPreset(st.loadPreset);
    else {
      const names = new Set(T.nodes.map(n => n.name));
      st.loaded = new Set([...st.loaded].filter(n => names.has(n)));
    }
    S = solve();
    st.selMember = null;
    render();
  }

  function manageAnim() {
    const want = st.mode === 'result' && st.anim && !S.error;
    if (want && !animOn) {
      animOn = true;
      const t0 = performance.now();
      const tick = now => {
        if (!(st.mode === 'result' && st.anim) || !document.getElementById('page-truss').classList.contains('active')) { animOn = false; curFactor = 0; if (st.mode === 'result') renderResult(); return; }
        curFactor = (1 - Math.cos((now - t0) / 1800 * Math.PI * 2)) / 2;
        renderResult();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  function init() {
    document.querySelectorAll('#truss-type button').forEach(b => b.addEventListener('click', () => {
      st.type = b.dataset.v;
      if (st.type === 'roof' && st.n % 2) { st.n += 1; $('truss-n').value = st.n; }
      st.step = 0; st.reveal = false; st.cutIdx = 0; rebuild();
    }));
    document.querySelectorAll('#truss-mode button').forEach(b => b.addEventListener('click', () => {
      st.mode = b.dataset.v; st.reveal = false; st.selEq = 0;
      if (st.mode === 'sections') st.cutIdx = Math.max(0, Math.floor(cutCandidates().length / 2) - 1);
      render();
    }));
    const rng = (id, key, keep) => $(id).addEventListener('input', e => {
      st[key] = +e.target.value;
      if (key === 'n' && st.type === 'roof' && st.n % 2) st.n += 1;
      if (key === 'n') st.step = 0;
      st.reveal = false;
      if (key === 'P') { S = solve(); render(); } else rebuild(keep);
    });
    rng('truss-n', 'n', false); rng('truss-L', 'L', true); rng('truss-h', 'h', true); rng('truss-P', 'P', true);
    document.querySelectorAll('[data-tload]').forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.tload;
      if (p === 'clear') { st.loaded = new Set(); st.loadPreset = 'clear'; } else applyLoadPreset(p);
      st.reveal = false; S = solve(); render();
    }));
    $('truss-labels').addEventListener('change', e => { st.labels = e.target.checked; render(); });
    $('truss-arrows').addEventListener('change', e => { st.arrows = e.target.checked; render(); });
    $('truss-anim').addEventListener('change', e => { st.anim = e.target.checked; if (st.anim) st.mode = 'result'; render(); });
    $('truss-cut').addEventListener('input', e => { st.cutIdx = +e.target.value; st.selEq = 0; render(); });

    const svg = $('truss-svg');
    svg.addEventListener('click', e => {
      const nodeEl = e.target.closest('[data-node]');
      if (nodeEl) {
        const name = T.nodes[+nodeEl.dataset.node].name;
        if (st.loaded.has(name)) st.loaded.delete(name); else st.loaded.add(name);
        st.reveal = false;
        S = solve(); render();
        return;
      }
      if (st.mode === 'sections') {
        const p = svgPoint(svg, e), x = (p.x - ox) / sc;
        const c = cutCandidates();
        let b = 0; c.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(c[b] - x)) b = i; });
        st.cutIdx = b; st.selEq = 0; render();
        return;
      }
      const mEl = e.target.closest('[data-member]');
      if (st.mode === 'result') { st.selMember = mEl ? +mEl.dataset.member : null; render(); }
    });

    $('truss-panel').addEventListener('click', e => {
      const js = e.target.closest('[data-js]');
      if (js) {
        const a = js.dataset.js;
        if (a === 'first') { st.step = 0; st.reveal = false; }
        if (a === 'prev') { st.step = Math.max(0, st.step - 1); st.reveal = false; }
        if (a === 'next') { st.step += 1; st.reveal = false; }
        if (a === 'reveal') st.reveal = !st.reveal;
        render(); return;
      }
      const sec = e.target.closest('[data-sec]');
      if (sec) { st.cutIdx += sec.dataset.sec === 'next' ? 1 : -1; st.selEq = 0; render(); return; }
      const eq = e.target.closest('[data-eq]');
      if (eq) { st.selEq = +eq.dataset.eq; render(); return; }
      const row = e.target.closest('[data-mrow]');
      if (row) { st.selMember = +row.dataset.mrow; render(); }
    });

    $('truss-n').value = st.n; $('truss-L').value = st.L; $('truss-h').value = st.h; $('truss-P').value = st.P;
    rebuild();
  }

  return { init, refresh: () => render() };
})();
