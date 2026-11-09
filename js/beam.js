'use strict';
/* 보 해석: 강성법(오일러-베르누이 보 요소)으로 반력·처짐을 구하고,
   SFD/BMD 는 반력과 하중으로부터 단면법(왼쪽 부분의 평형)으로 정확히 계산한다.
   단위: m, kN, kN·m, E[GPa], I[10^6 mm^4]  →  EI = E·I [kN·m²] */

const Beam = (() => {
  const W = 1000, ML = 76, MR = 56;
  const $ = id => document.getElementById(id);
  const EPS = 1e-7;

  const SUPPORT_INFO = {
    simple: { name: '단순보', det: true, desc: '왼쪽은 핀(회전만 가능), 오른쪽은 롤러(회전 + 수평 이동 가능). 반력 3개 → 평형식 3개로 풀리는 정정보입니다.' },
    cantilever: { name: '캔틸레버', det: true, desc: '한쪽 끝만 벽에 단단히 고정된 보(발코니, 차양). 고정단에서 휨모멘트와 전단력이 가장 큽니다.' },
    overhang: { name: '내민보', det: true, desc: '보가 지점 밖으로 튀어나온 형태. 내민 부분에서는 보가 위로 볼록해지는 부(−)모멘트가 생깁니다.' },
    propped: { name: '일단고정·타단롤러', det: false, desc: '반력이 4개(부정정 1차). 평형식만으로 부족해 "롤러 위치 처짐 = 0" 조건을 추가로 씁니다.' },
    fixed: { name: '양단고정보', det: false, desc: '반력이 6개(부정정). 양끝 고정단에 부(−)모멘트가 생겨 중앙 모멘트와 처짐이 단순보보다 훨씬 작습니다.' },
  };

  const EXAMPLES = [
    { label: '단순보 + 중앙 집중하중', support: 'simple', L: 10, loads: [{ type: 'point', x: 5, P: 20 }] },
    { label: '단순보 + 전체 등분포하중', support: 'simple', L: 10, loads: [{ type: 'dist', x1: 0, x2: 10, w1: 5, w2: 5 }] },
    { label: '단순보 + 집중하중 2개', support: 'simple', L: 12, loads: [{ type: 'point', x: 4, P: 15 }, { type: 'point', x: 8, P: 15 }] },
    { label: '단순보 + 삼각형 분포하중', support: 'simple', L: 9, loads: [{ type: 'dist', x1: 0, x2: 9, w1: 0, w2: 6 }] },
    { label: '단순보 + 모멘트 하중', support: 'simple', L: 10, loads: [{ type: 'moment', x: 4, M: 40 }] },
    { label: '캔틸레버 + 끝단 집중하중', support: 'cantilever', L: 5, loads: [{ type: 'point', x: 5, P: 10 }] },
    { label: '캔틸레버 + 등분포하중', support: 'cantilever', L: 5, loads: [{ type: 'dist', x1: 0, x2: 5, w1: 4, w2: 4 }] },
    { label: '내민보 + 분포하중 + 끝단 하중', support: 'overhang', L: 10, aPos: 0, bPos: 7, loads: [{ type: 'dist', x1: 0, x2: 7, w1: 4, w2: 4 }, { type: 'point', x: 10, P: 10 }] },
    { label: '양단고정보 + 등분포하중', support: 'fixed', L: 8, loads: [{ type: 'dist', x1: 0, x2: 8, w1: 6, w2: 6 }] },
    { label: '일단고정·타단롤러 + 등분포하중', support: 'propped', L: 8, loads: [{ type: 'dist', x1: 0, x2: 8, w1: 6, w2: 6 }] },
  ];

  // 단면: I [10⁶ mm⁴], h·B [mm]
  const SECTIONS = [
    { name: 'H-200×100×5.5×8', I: 18.4, h: 200, B: 100, type: 'H' },
    { name: 'H-300×150×6.5×9', I: 72.1, h: 300, B: 150, type: 'H' },
    { name: 'H-400×200×8×13', I: 237, h: 400, B: 200, type: 'H' },
    { name: 'H-600×200×11×17', I: 776, h: 600, B: 200, type: 'H' },
    { name: 'RC 400×600 (직사각형)', I: 7200, h: 600, B: 400, type: 'rect' },
  ];
  const st = {
    support: 'simple', L: 10, aPos: 0, bPos: 7.5, E: 205, I: 237, sec: 2,
    loads: [], tensionSide: true, overlay: true, view: '3d',
  };
  let uid = 1, res = null, cursorX = null, drag = null, sweeping = null, b3d = null;
  const sec = () => SECTIONS[st.sec];
  const sigmaOf = M => M * (sec().h / 2) / st.I; // MPa (M kN·m, I 10⁶ mm⁴)

  const xp = x => ML + x / st.L * (W - ML - MR);
  const xm = px => (px - ML) / (W - ML - MR) * st.L;
  const snap = x => Math.round(x / 0.1) * 0.1;

  /* ---------------- 모델 ---------------- */
  function supports() {
    const L = st.L;
    switch (st.support) {
      case 'cantilever': return [{ x: 0, type: 'fixed', name: 'A' }];
      case 'overhang': return [{ x: st.aPos, type: 'pin', name: 'A' }, { x: st.bPos, type: 'roller', name: 'B' }];
      case 'propped': return [{ x: 0, type: 'fixed', name: 'A' }, { x: L, type: 'roller', name: 'B' }];
      case 'fixed': return [{ x: 0, type: 'fixed', name: 'A' }, { x: L, type: 'fixed', name: 'B' }];
      default: return [{ x: 0, type: 'pin', name: 'A' }, { x: L, type: 'roller', name: 'B' }];
    }
  }

  const wAt = (d, x) => d.x2 - d.x1 < 1e-12 ? d.w1 : d.w1 + (d.w2 - d.w1) * (x - d.x1) / (d.x2 - d.x1);
  function distResultant(d) {
    const len = d.x2 - d.x1, Wt = (d.w1 + d.w2) / 2 * len;
    const xc = (d.w1 + d.w2) > 1e-12 ? d.x1 + len * (d.w1 + 2 * d.w2) / (3 * (d.w1 + d.w2)) : d.x1 + len / 2;
    return { W: Wt, xc };
  }

  function keyPoints() {
    const k = [0, st.L];
    supports().forEach(s => k.push(s.x));
    st.loads.forEach(l => { if (l.type === 'dist') k.push(l.x1, l.x2); else k.push(l.x); });
    k.sort((a, b) => a - b);
    const out = [];
    for (const x of k) if (x >= -1e-9 && x <= st.L + 1e-9 && (!out.length || x - out[out.length - 1] > 1e-6)) out.push(clamp(x, 0, st.L));
    return out;
  }

  function analyze() {
    const L = st.L, EI = st.E * st.I;
    const sups = supports();
    const keys = keyPoints();
    const NE = 100;
    const xs = keys.slice();
    for (let i = 0; i <= NE; i++) xs.push(L * i / NE);
    xs.sort((a, b) => a - b);
    const nodes = [];
    for (const x of xs) if (!nodes.length || x - nodes[nodes.length - 1] > 1e-6) nodes.push(x);
    const n = nodes.length, nd = 2 * n;
    const idx = x => { let b = 0; for (let i = 1; i < n; i++) if (Math.abs(nodes[i] - x) < Math.abs(nodes[b] - x)) b = i; return b; };

    const K = Array.from({ length: nd }, () => new Float64Array(nd));
    const F = new Float64Array(nd);
    for (let e = 0; e < n - 1; e++) {
      const a = nodes[e], b = nodes[e + 1], l = b - a, c = EI / (l * l * l);
      const ke = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]];
      const dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[dof[i]][dof[j]] += c * ke[i][j];
      for (const d of st.loads) {
        if (d.type !== 'dist') continue;
        if (a >= d.x1 - 1e-9 && b <= d.x2 + 1e-9) {
          const wa = wAt(d, a), wb = wAt(d, b);
          F[2 * e] -= l * (7 * wa + 3 * wb) / 20;
          F[2 * e + 1] -= l * l * (3 * wa + 2 * wb) / 60;
          F[2 * e + 2] -= l * (3 * wa + 7 * wb) / 20;
          F[2 * e + 3] += l * l * (2 * wa + 3 * wb) / 60;
        }
      }
    }
    for (const p of st.loads) {
      if (p.type === 'point') F[2 * idx(p.x)] -= p.P;
      if (p.type === 'moment') F[2 * idx(p.x) + 1] -= p.M; // 입력: 시계방향 + → 해석: 반시계 +
    }
    const fixedD = new Set();
    sups.forEach(s => { const i = idx(s.x); s.node = i; fixedD.add(2 * i); if (s.type === 'fixed') fixedD.add(2 * i + 1); });
    const free = [];
    for (let i = 0; i < nd; i++) if (!fixedD.has(i)) free.push(i);
    const Kff = free.map(r => free.map(c => K[r][c]));
    const Ff = free.map(r => F[r]);
    const uf = solveLinear(Kff, Ff);
    if (!uf) return { error: '구조물이 불안정합니다. 지점 위치를 확인하세요.' };
    const u = new Float64Array(nd);
    free.forEach((d, i) => { u[d] = uf[i]; });
    const R = d => { let s = -F[d]; const row = K[d]; for (let j = 0; j < nd; j++) s += row[j] * u[j]; return s; };
    sups.forEach(s => { s.R = R(2 * s.node); s.Mr = s.type === 'fixed' ? R(2 * s.node + 1) : 0; });

    // SFD/BMD 샘플
    const sx = [];
    const NS = 500;
    for (let i = 0; i <= NS; i++) sx.push(L * i / NS);
    keys.forEach(k => { sx.push(clamp(k - EPS, 0, L), clamp(k + EPS, 0, L)); });
    sx.sort((a, b) => a - b);
    const V = [], M = [];
    const r = { sups };
    for (const x of sx) { const q = VMat(x, r); V.push(q.V); M.push(q.M); }

    const defl = nodes.map((x, i) => u[2 * i] * 1000); // mm, 위 +
    const theta = nodes.map((x, i) => u[2 * i + 1]);
    return { sups, keys, nodes, defl, theta, xs: sx, V, M, EI };
  }

  /* 단면 x 의 왼쪽 부분 평형으로 V, M 계산 (V: 왼쪽 위 방향 합, M: 처짐(웃는 모양) +) */
  function VMat(x, r = res) {
    let V = 0, M = 0;
    for (const s of r.sups) if (s.x < x) { V += s.R; M += s.R * (x - s.x) - s.Mr; }
    for (const l of st.loads) {
      if (l.type === 'point' && l.x < x) { V -= l.P; M -= l.P * (x - l.x); }
      else if (l.type === 'moment' && l.x < x) { M += l.M; }
      else if (l.type === 'dist' && x > l.x1) {
        const c = Math.min(x, l.x2), t = c - l.x1;
        const k = l.x2 - l.x1 > 1e-12 ? (l.w2 - l.w1) / (l.x2 - l.x1) : 0;
        const Wt = l.w1 * t + k * t * t / 2;
        const Mt = (x - l.x1) * Wt - (l.w1 * t * t / 2 + k * t * t * t / 3);
        V -= Wt; M -= Mt;
      }
    }
    return { V, M };
  }

  function deflAt(x) {
    const { nodes, defl } = res;
    for (let i = 0; i < nodes.length - 1; i++) {
      if (x <= nodes[i + 1] + 1e-12) {
        const t = (x - nodes[i]) / (nodes[i + 1] - nodes[i] || 1);
        return defl[i] + (defl[i + 1] - defl[i]) * clamp(t, 0, 1);
      }
    }
    return defl[defl.length - 1];
  }

  function extremes() {
    const { xs, V, M, defl, nodes } = res;
    let iVmax = 0, iMmax = 0, iMmin = 0, iD = 0;
    for (let i = 0; i < xs.length; i++) {
      if (Math.abs(V[i]) > Math.abs(V[iVmax])) iVmax = i;
      if (M[i] > M[iMmax]) iMmax = i;
      if (M[i] < M[iMmin]) iMmin = i;
    }
    for (let i = 0; i < defl.length; i++) if (Math.abs(defl[i]) > Math.abs(defl[iD])) iD = i;
    // V=0 지점 (분포하중 구간 안에서 부호가 바뀌는 곳)
    const zeros = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const a = V[i], b = V[i + 1];
      if (a * b < 0 && xs[i + 1] - xs[i] > 1e-5) {
        let lo = xs[i], hi = xs[i + 1];
        for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2; if (VMat(mid).V * a > 0) lo = mid; else hi = mid; }
        const x0 = (lo + hi) / 2;
        zeros.push({ x: x0, M: VMat(x0).M });
      }
    }
    return {
      Vmax: { x: xs[iVmax], v: V[iVmax] }, Mmax: { x: xs[iMmax], v: M[iMmax] }, Mmin: { x: xs[iMmin], v: M[iMmin] },
      D: { x: nodes[iD], v: defl[iD] }, zeros,
    };
  }

  /* ---------------- 그리기: 하중도 ---------------- */
  const BY = 150, BH = 14; // 보 중심선 y, 두께

  function drawSupport(g, s) {
    const X = xp(s.x), yb = BY + BH / 2;
    if (s.type === 'pin') {
      svgEl('polygon', { points: `${X},${yb} ${X - 16},${yb + 26} ${X + 16},${yb + 26}`, class: 'sup-fill' }, g);
      svgEl('circle', { cx: X, cy: yb + 4, r: 3.5, class: 'sup-fill' }, g);
      drawHatch(g, X - 24, yb + 26, X + 24);
    } else if (s.type === 'roller') {
      svgEl('polygon', { points: `${X},${yb} ${X - 15},${yb + 20} ${X + 15},${yb + 20}`, class: 'sup-fill' }, g);
      svgEl('circle', { cx: X - 8, cy: yb + 25, r: 4.5, class: 'sup-fill' }, g);
      svgEl('circle', { cx: X + 8, cy: yb + 25, r: 4.5, class: 'sup-fill' }, g);
      drawHatch(g, X - 24, yb + 30, X + 24);
    } else {
      const left = s.x < st.L / 2, dir = left ? -1 : 1;
      svgEl('line', { x1: X, y1: BY - 45, x2: X, y2: BY + 45, class: 'ground', 'stroke-width': 3 }, g);
      for (let y = BY - 42; y <= BY + 45; y += 9) svgEl('line', { x1: X, y1: y, x2: X + dir * 10, y2: y - 8, class: 'ground', 'stroke-width': 1.4 }, g);
    }
    svgText(g, X + (s.type === 'fixed' ? (s.x < st.L / 2 ? -22 : 22) : 22), BY + (s.type === 'fixed' ? -52 : 42), s.name, { 'font-weight': 800, 'font-size': 16, 'text-anchor': 'middle', class: 'svg-muted' });
  }

  function renderLoad() {
    const svg = $('beam-svg-load');
    clearSvg(svg);
    const g = svgEl('g', {}, svg);
    const L = st.L;

    // 눈금자
    const ry = 292, step = L <= 6 ? 0.5 : L <= 12 ? 1 : 2;
    svgEl('line', { x1: xp(0), y1: ry, x2: xp(L), y2: ry, class: 'axis-strong' }, g);
    for (let x = 0; x <= L + 1e-9; x += step) {
      svgEl('line', { x1: xp(x), y1: ry - 4, x2: xp(x), y2: ry + 0, class: 'axis-strong' }, g);
      svgText(g, xp(x), ry + 15, fmt(x, 1), { 'text-anchor': 'middle', class: 'svg-muted', 'font-size': 11 });
    }
    svgText(g, xp(L) + 10, ry + 4, 'x(m)', { class: 'svg-muted', 'font-size': 11 });

    // 보
    svgEl('rect', { x: xp(0), y: BY - BH / 2, width: xp(L) - xp(0), height: BH, rx: 3, class: 'beam-rect' }, g);

    // 변형 겹쳐보기
    if (st.overlay && res && !res.error) {
      const mx = Math.max(...res.defl.map(Math.abs));
      if (mx > 1e-9) {
        const sc = 38 / mx;
        const d = res.nodes.map((x, i) => `${i ? 'L' : 'M'}${xp(x).toFixed(1)},${(BY - res.defl[i] * sc).toFixed(1)}`).join(' ');
        svgEl('path', { d, style: 'fill:none;stroke:var(--defl);stroke-width:3;stroke-dasharray:7 5;opacity:.85' }, g);
      }
    }

    const sups = res && !res.error ? res.sups : supports();
    sups.forEach(s => drawSupport(g, s));

    // 하중
    const wmax = Math.max(1e-9, ...st.loads.filter(l => l.type === 'dist').map(l => Math.max(Math.abs(l.w1), Math.abs(l.w2))));
    for (const l of st.loads) {
      const lg = svgEl('g', { class: 'grab', 'data-load': l.id }, g);
      if (l.type === 'point') {
        const X = xp(l.x);
        svgEl('rect', { x: X - 18, y: 40, width: 36, height: 105, class: 'hit', rx: 6 }, lg);
        if (l.P >= 0) drawArrow(lg, X, 62, X, BY - BH / 2 - 1, { color: 'var(--load)', width: 3.5, head: 14 });
        else drawArrow(lg, X, BY - BH / 2 - 1, X, 62, { color: 'var(--load)', width: 3.5, head: 14 });
        svgText(lg, X, 52, `P = ${fmt(Math.abs(l.P))} kN${l.P < 0 ? ' ↑' : ''}`, { 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 14, style: 'fill:var(--load)', class: 'val-label' });
      } else if (l.type === 'dist') {
        const X1 = xp(l.x1), X2 = xp(l.x2), base = BY - BH / 2 - 1;
        const h = x => 12 + 48 * Math.abs(wAt(l, x)) / wmax;
        const N = Math.max(2, Math.round((X2 - X1) / 26));
        const top = [];
        for (let i = 0; i <= 40; i++) { const x = l.x1 + (l.x2 - l.x1) * i / 40; top.push([xp(x), base - h(x)]); }
        svgEl('polygon', { points: `${X1},${base} ` + top.map(p => p.join(',')).join(' ') + ` ${X2},${base}`, style: 'fill:var(--load);opacity:.12' }, lg);
        svgEl('polyline', { points: top.map(p => p.join(',')).join(' '), style: 'fill:none;stroke:var(--load);stroke-width:2.5' }, lg);
        for (let i = 0; i <= N; i++) {
          const x = l.x1 + (l.x2 - l.x1) * i / N, H = h(x);
          if (Math.abs(wAt(l, x)) / wmax * 48 > 3) drawArrow(lg, xp(x), base - H, xp(x), base, { color: 'var(--load)', width: 1.8, head: 8 });
        }
        const txt = Math.abs(l.w1 - l.w2) < 1e-9 ? `w = ${fmt(l.w1)} kN/m` : `w = ${fmt(l.w1)} → ${fmt(l.w2)} kN/m`;
        svgText(lg, (X1 + X2) / 2, base - 66, txt, { 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 14, style: 'fill:var(--load)', class: 'val-label' });
      } else if (l.type === 'moment') {
        const X = xp(l.x);
        svgEl('rect', { x: X - 34, y: 88, width: 68, height: 70, class: 'hit', rx: 8 }, lg);
        drawArcArrow(lg, X, BY, 28, l.M >= 0, { color: 'var(--defl)', width: 3, head: 12 });
        svgText(lg, X, 106, `M = ${fmt(Math.abs(l.M))} kN·m ${l.M >= 0 ? '↻' : '↺'}`, { 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 14, style: 'fill:var(--defl)', class: 'val-label', dy: -8 });
      }
    }

    // 반력
    if (res && !res.error) {
      for (const s of res.sups) {
        const X = xp(s.x);
        if (Math.abs(s.R) > 1e-6) {
          const y1 = 270, y2 = s.type === 'fixed' ? BY + 52 : BY + 48;
          if (s.R > 0) drawArrow(g, X, y1, X, y2, { color: 'var(--react)', width: 3.5, head: 13 });
          else drawArrow(g, X, y2, X, y1, { color: 'var(--react)', width: 3.5, head: 13 });
          const anchor = s.x < 0.02 * st.L ? 'start' : s.x > 0.98 * st.L ? 'end' : 'middle';
          svgText(g, X + (anchor === 'start' ? 10 : anchor === 'end' ? -10 : 10), 266, `R${s.name} = ${fmt(Math.abs(s.R))} kN ${s.R >= 0 ? '↑' : '↓'}`, { 'text-anchor': anchor === 'middle' ? 'start' : anchor, 'font-weight': 700, 'font-size': 13, style: 'fill:var(--react)', class: 'val-label', dx: anchor === 'middle' ? 0 : 0 });
        }
        if (s.type === 'fixed' && Math.abs(s.Mr) > 1e-6) {
          const left = s.x < st.L / 2;
          const cx = X + (left ? -26 : 26);
          drawArcArrow(g, cx, BY, 24, s.Mr < 0, { color: 'var(--react)', width: 3, head: 11 });
          svgText(g, X + (left ? 6 : -6), 84, `M${s.name} = ${fmt(Math.abs(s.Mr))} kN·m ${s.Mr < 0 ? '↻' : '↺'}`, { 'text-anchor': left ? 'start' : 'end', 'font-weight': 700, 'font-size': 13, style: 'fill:var(--react)', class: 'val-label' });
        }
      }
    }
    svgEl('g', { class: 'cursor-layer' }, svg);
  }

  /* 단면 따라 그리기: 그래프를 왼쪽부터 드러내는 클립 */
  function clipGroup(svg, id, H) {
    const defs = svgEl('defs', {}, svg);
    const cp = svgEl('clipPath', { id: id + '-clip' }, defs);
    svgEl('rect', { x: 0, y: -20, width: sweeping ? xp(sweeping.x) : W, height: H + 40, class: 'clip-rect' }, cp);
    return svgEl('g', { 'clip-path': `url(#${id}-clip)` }, svg);
  }
  function setClip(px) {
    ['beam-svg-sfd', 'beam-svg-bmd', 'beam-svg-defl'].forEach(id => {
      const r = $(id).querySelector('.clip-rect');
      if (r) r.setAttribute('width', px);
    });
  }
  function sweep() {
    if (sweeping || !res || res.error) return;
    const btn = $('beam-sweep');
    btn.disabled = true;
    sweeping = { x: 0, t0: performance.now() };
    const dur = 5200;
    const step = now => {
      const t = Math.min(1, (now - sweeping.t0) / dur);
      sweeping.x = st.L * t;
      cursorX = sweeping.x;
      setClip(xp(sweeping.x));
      drawCursor();
      if (t < 1 && $('page-beam').classList.contains('active')) requestAnimationFrame(step);
      else { sweeping = null; setClip(W); btn.disabled = false; }
    };
    setClip(xp(0));
    requestAnimationFrame(step);
  }

  /* ---------------- 그리기: SFD / BMD ---------------- */
  function renderDiagram(svgId, vals, opt) {
    const svg = $(svgId);
    clearSvg(svg);
    const H = 230, y0 = 115, amp = 82;
    const xs = res.xs, sgn = opt.flip ? -1 : 1;
    const mx = Math.max(1e-9, ...vals.map(Math.abs));
    const sc = amp / mx;
    const Y = v => y0 - sgn * v * sc;
    const g = clipGroup(svg, svgId, H);

    svgEl('line', { x1: xp(0) - 10, y1: y0, x2: xp(st.L) + 10, y2: y0, class: 'axis-strong' }, g);
    svgText(g, 14, Y(mx) + 4, '(+)', { class: 'svg-muted', 'font-weight': 700, style: 'fill:var(--pos)' });
    svgText(g, 14, Y(-mx) + 4, '(−)', { class: 'svg-muted', 'font-weight': 700, style: 'fill:var(--neg)' });

    const ptsPos = [`${xp(0)},${y0}`], ptsNeg = [`${xp(0)},${y0}`], outline = [];
    for (let i = 0; i < xs.length; i++) {
      const X = xp(xs[i]).toFixed(2);
      ptsPos.push(`${X},${Y(Math.max(vals[i], 0)).toFixed(2)}`);
      ptsNeg.push(`${X},${Y(Math.min(vals[i], 0)).toFixed(2)}`);
      outline.push(`${X},${Y(vals[i]).toFixed(2)}`);
    }
    ptsPos.push(`${xp(st.L)},${y0}`); ptsNeg.push(`${xp(st.L)},${y0}`);
    outline.unshift(`${xp(0)},${y0}`); outline.push(`${xp(st.L)},${y0}`);
    svgEl('polygon', { points: ptsPos.join(' '), style: 'fill:var(--pos-fill)' }, g);
    svgEl('polygon', { points: ptsNeg.join(' '), style: 'fill:var(--neg-fill)' }, g);
    svgEl('polyline', { points: outline.join(' '), style: `fill:none;stroke:${opt.color};stroke-width:2.6;stroke-linejoin:round` }, g);

    // 지점 위치 표시
    res.sups.forEach(s => svgEl('line', { x1: xp(s.x), y1: y0 - 4, x2: xp(s.x), y2: y0 + 4, class: 'axis-strong', 'stroke-width': 3 }, g));

    // 값 라벨
    const placer = LabelPlacer();
    const label = (x, v, anchor, dx, hl) => {
      if (Math.abs(v) < 1e-6 * mx + 1e-9) return;
      const X = xp(x) + dx, yy = Y(v) + (sgn * v >= 0 ? -8 : 18);
      const txt = fmt(v);
      if (!placer.ok(X, yy, txt.length * 8 + 6, 16)) return;
      svgText(g, X, yy, txt, { 'text-anchor': anchor, class: 'val-label', style: `fill:${hl || opt.color}` });
    };
    opt.labels.forEach(p => label(p.x, p.v, p.anchor || 'middle', p.dx || 0, p.hl));
    svgEl('g', { class: 'cursor-layer' }, svg);
    return { Y, H };
  }

  function sfdLabels() {
    const out = [];
    for (const k of res.keys) {
      const a = VMat(clamp(k - EPS, 0, st.L)).V, b = VMat(clamp(k + EPS, 0, st.L)).V;
      if (k > 1e-9 && Math.abs(a - b) > 1e-6) { out.push({ x: k, v: a, anchor: 'end', dx: -4 }); out.push({ x: k, v: b, anchor: 'start', dx: 4 }); }
      else out.push({ x: k, v: k > 1e-9 ? a : b, anchor: k < 1e-9 ? 'start' : k > st.L - 1e-9 ? 'end' : 'middle', dx: k < 1e-9 ? 4 : k > st.L - 1e-9 ? -4 : 0 });
    }
    return out;
  }
  function bmdLabels(ex) {
    const out = [];
    ex.zeros.forEach(z => out.push({ x: z.x, v: z.M, hl: 'var(--accent)' }));
    for (const k of res.keys) {
      const a = VMat(clamp(k - EPS, 0, st.L)).M, b = VMat(clamp(k + EPS, 0, st.L)).M;
      if (k > 1e-9 && Math.abs(a - b) > 1e-6) { out.push({ x: k, v: a, anchor: 'end', dx: -4 }); out.push({ x: k, v: b, anchor: 'start', dx: 4 }); }
      else out.push({ x: k, v: k > 1e-9 ? a : b, anchor: k < 1e-9 ? 'start' : k > st.L - 1e-9 ? 'end' : 'middle', dx: k < 1e-9 ? 4 : k > st.L - 1e-9 ? -4 : 0 });
    }
    return out;
  }

  /* ---------------- 그리기: 처짐 ---------------- */
  function renderDefl(ex) {
    const svg = $('beam-svg-defl');
    clearSvg(svg);
    const g = clipGroup(svg, 'beam-svg-defl', 200);
    const y0 = 100, mx = Math.max(1e-12, ...res.defl.map(Math.abs)), sc = 72 / mx;
    const Y = v => y0 - v * sc;
    svgEl('line', { x1: xp(0), y1: y0, x2: xp(st.L), y2: y0, style: 'stroke:var(--zero);stroke-width:2;stroke-dasharray:6 5' }, g);
    res.sups.forEach(s => {
      const X = xp(s.x);
      if (s.type === 'fixed') svgEl('line', { x1: X, y1: y0 - 22, x2: X, y2: y0 + 22, class: 'ground', 'stroke-width': 3 }, g);
      else svgEl('polygon', { points: `${X},${y0 + 2} ${X - 9},${y0 + 16} ${X + 9},${y0 + 16}`, class: 'sup-fill' }, g);
    });
    const d = res.nodes.map((x, i) => `${i ? 'L' : 'M'}${xp(x).toFixed(1)},${Y(res.defl[i]).toFixed(1)}`).join(' ');
    svgEl('path', { d, style: 'fill:none;stroke:var(--defl);stroke-width:4;stroke-linecap:round' }, g);
    if (Math.abs(ex.D.v) > 1e-9) {
      const X = xp(ex.D.x), yy = Y(ex.D.v);
      svgEl('line', { x1: X, y1: y0, x2: X, y2: yy, style: 'stroke:var(--defl);stroke-width:1.5;stroke-dasharray:3 3' }, g);
      svgEl('circle', { cx: X, cy: yy, r: 5, style: 'fill:var(--defl)' }, g);
      const anchor = X > 800 ? 'end' : X < 200 ? 'start' : 'middle';
      svgText(g, X, yy + (ex.D.v < 0 ? 26 : -14), `δmax = ${fmt(Math.abs(ex.D.v), 2)} mm ${ex.D.v < 0 ? '↓' : '↑'}  (x = ${fmt(ex.D.x, 2)} m)`, { 'text-anchor': anchor, class: 'val-label', style: 'fill:var(--defl)' });
    }
    svgEl('g', { class: 'cursor-layer' }, svg);
    return { Y };
  }

  /* ---------------- 커서 / 단면 자유물체도 ---------------- */
  let maps = {};
  function drawCursor() {
    ['beam-svg-load', 'beam-svg-sfd', 'beam-svg-bmd', 'beam-svg-defl'].forEach(id => {
      const layer = $(id).querySelector('.cursor-layer');
      if (layer) clearSvg(layer);
    });
    const vals = $('beam-readout-vals');
    if (cursorX === null || !res || res.error) {
      vals.innerHTML = `<div class="readout-empty">아래 그래프 위에 마우스나 손가락을 올리면 그 위치의 <b>전단력 V</b>, <b>휨모멘트 M</b>, <b>처짐 δ</b>, <b>휨응력 σ</b>와 잘린 단면에 작용하는 힘이 보입니다.</div>`;
      drawCut(null);
      return;
    }
    const x = cursorX, X = xp(x);
    const q = VMat(x), dv = deflAt(x);
    const heights = { 'beam-svg-load': 312, 'beam-svg-sfd': 230, 'beam-svg-bmd': 230, 'beam-svg-defl': 200 };
    for (const id in heights) {
      const layer = $(id).querySelector('.cursor-layer');
      svgEl('line', { x1: X, y1: 6, x2: X, y2: heights[id] - 6, class: 'cursor-line' }, layer);
      if (id === 'beam-svg-load') svgText(layer, X + 6, 20, '여기서 자르면?', { 'font-size': 12, style: 'fill:var(--accent)', 'font-weight': 700 });
    }
    const dot = (id, y, color) => svgEl('circle', { cx: X, cy: y, r: 5.5, style: `fill:${color};stroke:var(--surface);stroke-width:2` }, $(id).querySelector('.cursor-layer'));
    dot('beam-svg-sfd', maps.sfd.Y(q.V), 'var(--pos)');
    dot('beam-svg-bmd', maps.bmd.Y(q.M), 'var(--neg)');
    dot('beam-svg-defl', maps.defl.Y(dv), 'var(--defl)');
    vals.innerHTML = `
      <div class="rv"><span>위치 x</span><b>${fmt(x, 2)} m</b></div>
      <div class="rv v"><span>전단력 V</span><b>${fmt(q.V)} kN</b></div>
      <div class="rv m"><span>휨모멘트 M</span><b>${fmt(q.M)} kN·m</b></div>
      <div class="rv d"><span>처짐 δ</span><b>${fmt(Math.abs(dv), 2)} mm ${Math.abs(dv) < 1e-6 ? '' : dv < 0 ? '↓' : '↑'}</b></div>
      <div class="rv s"><span>최대 휨응력 σ</span><b>${fmt(Math.abs(sigmaOf(q.M)), 1)} MPa</b></div>`;
    drawCut(q);
  }

  function drawCut(q) {
    const svg = $('beam-cut');
    clearSvg(svg);
    const g = svgEl('g', {}, svg);
    svgEl('rect', { x: 10, y: 52, width: 120, height: 16, rx: 3, class: 'beam-rect' }, g);
    svgEl('rect', { x: 210, y: 52, width: 120, height: 16, rx: 3, class: 'beam-rect' }, g);
    svgText(g, 70, 92, '왼쪽 부분', { 'text-anchor': 'middle', class: 'svg-muted', 'font-size': 12 });
    svgText(g, 270, 92, '오른쪽 부분', { 'text-anchor': 'middle', class: 'svg-muted', 'font-size': 12 });
    if (!q) {
      svgText(g, 170, 112, '단면에서 주고받는 힘', { 'text-anchor': 'middle', class: 'svg-muted', 'font-size': 12 });
      return;
    }
    const tiny = v => Math.abs(v) < 1e-6;
    // 전단력: 왼쪽 부분 오른쪽 면에서 (+)V 는 아래, 오른쪽 부분 왼쪽 면에서 (+)V 는 위
    if (!tiny(q.V)) {
      const dn = q.V > 0;
      drawArrow(g, 150, dn ? 26 : 92, 150, dn ? 56 : 66, { color: 'var(--pos)', width: 2.6, head: 9 });
      drawArrow(g, 190, dn ? 94 : 28, 190, dn ? 64 : 54, { color: 'var(--pos)', width: 2.6, head: 9 });
      svgText(g, 170, 20, `V = ${fmt(Math.abs(q.V))}`, { 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, style: 'fill:var(--pos)' });
    }
    // 휨모멘트: (+)M 은 왼쪽 부분 오른쪽 면에서 반시계, 오른쪽 부분 왼쪽 면에서 시계
    if (!tiny(q.M)) {
      const pos = q.M > 0;
      drawArcArrow(g, 112, 60, 17, !pos, { color: 'var(--neg)', width: 2.4, head: 8 });
      drawArcArrow(g, 228, 60, 17, pos, { color: 'var(--neg)', width: 2.4, head: 8 });
      svgText(g, 170, 112, `M = ${fmt(Math.abs(q.M))} ${pos ? '(+ 웃는 모양 ∪)' : '(− 찡그린 모양 ∩)'}`, { 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, style: 'fill:var(--neg)' });
    } else {
      svgText(g, 170, 112, 'M = 0', { 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, style: 'fill:var(--neg)' });
    }
  }

  /* ---------------- 풀이 과정 ---------------- */
  function loadName(l, i) { return l.type === 'point' ? `P${i}` : l.type === 'moment' ? `M${i}` : `w${i}`; }

  function stepsHTML(ex) {
    const sups = res.sups, L = st.L;
    const named = []; let np = 0, nw = 0, nm = 0;
    st.loads.forEach(l => named.push({ l, name: l.type === 'point' ? `P${++np}` : l.type === 'moment' ? `M${++nm}` : `W${++nw}` }));
    let h = `<h3>풀이 과정</h3>`;

    // STEP 1 반력
    h += `<div class="step"><h4><span class="step-dot">1</span>반력 구하기 — 보 전체가 가만히 있으려면?</h4>`;
    const det = SUPPORT_INFO[st.support].det;
    const distNote = named.filter(o => o.l.type === 'dist').map(o => {
      const r = distResultant(o.l);
      return `<li>분포하중 ${o.name}: 합력 = 넓이 = <b>${fmt(r.W)} kN</b>, 작용점 x = <b>${fmt(r.xc)} m</b> (도형의 무게중심)</li>`;
    }).join('');
    if (distNote) h += `<p>분포하중은 먼저 <b>하나의 집중하중(합력)</b>으로 바꿉니다.</p><ul class="events">${distNote}</ul>`;
    const sumP = st.loads.reduce((s, l) => s + (l.type === 'point' ? l.P : l.type === 'dist' ? distResultant(l).W : 0), 0);

    if (st.support === 'simple' || st.support === 'overhang') {
      const A = sups[0], B = sups[1], d = B.x - A.x;
      const terms = [];
      named.forEach(({ l, name }) => {
        if (l.type === 'point') { const arm = l.x - A.x; if (Math.abs(arm) > 1e-9 && Math.abs(l.P) > 1e-9) terms.push(`${terms.length ? (l.P * arm >= 0 ? '+ ' : '− ') : (l.P * arm >= 0 ? '' : '− ')}${fmt(Math.abs(l.P))}×${fmt(Math.abs(arm))}`); }
        if (l.type === 'dist') { const r = distResultant(l), arm = r.xc - A.x; if (Math.abs(arm) > 1e-9 && r.W > 1e-9) terms.push(`${terms.length ? (arm >= 0 ? '+ ' : '− ') : (arm >= 0 ? '' : '− ')}${fmt(r.W)}×${fmt(Math.abs(arm))}`); }
        if (l.type === 'moment' && Math.abs(l.M) > 1e-9) terms.push(`${terms.length ? (l.M >= 0 ? '+ ' : '− ') : (l.M >= 0 ? '' : '− ')}${fmt(Math.abs(l.M))}`);
      });
      h += `<p>① 지점 A를 중심으로 회전하지 않아야 합니다 (<b>ΣM<sub>A</sub> = 0</b>, 시계방향 +). 하중 × A까지 거리 = 회전 효과입니다.</p>`;
      h += `<div class="eq">${terms.join(' ') || '0'} − R<sub>B</sub>×${fmt(d)} = 0 &nbsp;→&nbsp; <span class="ans">R<sub>B</sub> = ${fmt(B.R)} kN</span></div>`;
      h += `<p>② 위아래 힘이 균형을 이뤄야 합니다 (<b>ΣF<sub>y</sub> = 0</b>).</p>`;
      h += `<div class="eq">R<sub>A</sub> + R<sub>B</sub> − (하중 합 ${fmt(sumP)}) = 0 &nbsp;→&nbsp; <span class="ans">R<sub>A</sub> = ${fmt(sumP)} − ${fmt(B.R)} = ${fmt(A.R)} kN</span></div>`;
      h += `<p>③ 수평 하중이 없으므로 H<sub>A</sub> = 0 입니다.</p>`;
    } else if (st.support === 'cantilever') {
      const A = sups[0];
      const terms = [];
      named.forEach(({ l }) => {
        if (l.type === 'point' && Math.abs(l.P) > 1e-9 && l.x > 1e-9) terms.push(`${terms.length ? (l.P >= 0 ? '+ ' : '− ') : (l.P >= 0 ? '' : '− ')}${fmt(Math.abs(l.P))}×${fmt(l.x)}`);
        if (l.type === 'dist') { const r = distResultant(l); if (r.W > 1e-9) terms.push(`${terms.length ? '+ ' : ''}${fmt(r.W)}×${fmt(r.xc)}`); }
        if (l.type === 'moment' && Math.abs(l.M) > 1e-9) terms.push(`${terms.length ? (l.M >= 0 ? '+ ' : '− ') : (l.M >= 0 ? '' : '− ')}${fmt(Math.abs(l.M))}`);
      });
      h += `<p>고정단 A 하나가 모든 하중을 받칩니다. 위아래 힘의 평형(ΣF<sub>y</sub> = 0)에서:</p>`;
      h += `<div class="eq">R<sub>A</sub> = 하중 합 = <span class="ans">${fmt(A.R)} kN</span></div>`;
      h += `<p>벽이 보를 돌아가지 못하게 붙잡는 <b>고정단 모멘트</b> (ΣM<sub>A</sub> = 0):</p>`;
      h += `<div class="eq">M<sub>A</sub> = ${terms.join(' ') || '0'} = <span class="ans">${fmt(Math.abs(A.Mr))} kN·m ${A.Mr >= 0 ? '(반시계 ↺)' : '(시계 ↻)'}</span></div>`;
    } else {
      h += `<p><b>${SUPPORT_INFO[st.support].name}</b>는 반력의 수가 평형방정식(3개)보다 많은 <b>부정정 구조물</b>입니다. 평형식에 더해 "고정단의 처짐각 = 0, 지점의 처짐 = 0" 같은 <b>변형 조건</b>을 써야 합니다(변위일치법, 처짐각법 등). 아래는 컴퓨터(강성법)로 푼 결과입니다.</p>`;
      h += `<div class="eq">${sups.map(s => `R<sub>${s.name}</sub> = <span class="ans">${fmt(s.R)} kN</span>` + (s.type === 'fixed' ? `, M<sub>${s.name}</sub> = <span class="ans">${fmt(Math.abs(s.Mr))} kN·m ${s.Mr >= 0 ? '↺' : '↻'}</span>` : '')).join(' &nbsp;|&nbsp; ')}</div>`;
      h += `<p>검산: R 합계 = ${fmt(sups.reduce((s, x) => s + x.R, 0))} kN = 하중 합 ${fmt(sumP)} kN ✔</p>`;
    }
    h += `</div>`;

    // STEP 2 SFD
    h += `<div class="step"><h4><span class="step-dot">2</span>전단력도(SFD) — 왼쪽부터 힘을 더해 가기</h4>`;
    h += `<p>왼쪽 끝에서 출발해 오른쪽으로 걸어가며, <b>위로 향한 힘을 만나면 올라가고(+)</b>, <b>아래로 향한 힘을 만나면 내려갑니다(−)</b>. 끝에 도착하면 반드시 0으로 돌아옵니다.</p><ul class="events">`;
    const ev = [];
    sups.forEach(s => { if (Math.abs(s.R) > 1e-9) ev.push({ x: s.x, t: `x = ${fmt(s.x)} m: 반력 R<sub>${s.name}</sub> = ${fmt(Math.abs(s.R))} kN ${s.R > 0 ? '↑ → 그래프가 위로' : '↓ → 그래프가 아래로'} ${fmt(Math.abs(s.R))} 점프` }); });
    named.forEach(({ l, name }) => {
      if (l.type === 'point' && Math.abs(l.P) > 1e-9) ev.push({ x: l.x, t: `x = ${fmt(l.x)} m: 집중하중 ${name} = ${fmt(Math.abs(l.P))} kN ${l.P > 0 ? '↓ → 아래로' : '↑ → 위로'} ${fmt(Math.abs(l.P))} 점프 (계단)` });
      if (l.type === 'dist') { const r = distResultant(l); ev.push({ x: l.x1, t: `${fmt(l.x1)} ~ ${fmt(l.x2)} m: 분포하중 ${name} → 그래프가 ${Math.abs(l.w1 - l.w2) < 1e-9 ? '일정한 기울기(직선)로' : '곡선으로'} 총 ${fmt(r.W)} kN 내려감` }); }
      if (l.type === 'moment' && Math.abs(l.M) > 1e-9) ev.push({ x: l.x, t: `x = ${fmt(l.x)} m: 모멘트 하중 ${name} → 위아래 힘이 아니므로 <b>SFD는 변화 없음</b>` });
    });
    ev.sort((a, b) => a.x - b.x).forEach(e => h += `<li>${e.t}</li>`);
    h += `</ul><p>최대 전단력: <b>|V|max = ${fmt(Math.abs(ex.Vmax.v))} kN</b> (x = ${fmt(ex.Vmax.x)} m)</p></div>`;

    // STEP 3 BMD
    h += `<div class="step"><h4><span class="step-dot">3</span>휨모멘트도(BMD) — SFD의 넓이를 쌓아 가기</h4>`;
    h += `<p>어떤 구간에서 <b>M의 변화량 = 그 구간 SFD의 넓이</b>입니다. V가 (+)인 구간에서는 M이 커지고, (−)인 구간에서는 작아집니다. 그래서 <b>V = 0인 곳에서 M이 최대</b>가 됩니다.</p>`;
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th>구간 (m)</th><th>하중</th><th>V 모양</th><th>M 모양</th><th>SFD 넓이 = ΔM</th><th>M 변화</th></tr>`;
    const K = res.keys;
    for (let i = 0; i < K.length - 1; i++) {
      const a = K[i], b = K[i + 1];
      if (b - a < 1e-6) continue;
      const mid = (a + b) / 2;
      const ds = st.loads.filter(l => l.type === 'dist' && l.x1 <= mid && l.x2 >= mid);
      const varying = ds.some(l => Math.abs(l.w1 - l.w2) > 1e-9);
      const wSum = ds.reduce((s, l) => s + wAt(l, mid), 0);
      const loadTxt = !ds.length || Math.abs(wSum) < 1e-9 && !varying ? '없음' : varying ? '삼각형/사다리꼴 분포' : `등분포 ${fmt(wSum)} kN/m`;
      const vShape = loadTxt === '없음' ? '수평선 (일정)' : varying ? '2차 곡선' : '1차 직선 (기울기 −w)';
      const mShape = loadTxt === '없음' ? '1차 직선' : varying ? '3차 곡선' : '2차 포물선';
      const Ma = VMat(a + EPS).M, Mb = VMat(b - EPS).M;
      h += `<tr><td>${fmt(a)} ~ ${fmt(b)}</td><td>${loadTxt}</td><td>${vShape}</td><td>${mShape}</td><td>${fmt(Mb - Ma)}</td><td>${fmt(Ma)} → ${fmt(Mb)}</td></tr>`;
    }
    h += `</table></div>`;
    const jumps = named.filter(o => o.l.type === 'moment');
    if (jumps.length) h += `<p>모멘트 하중 위치에서는 BMD가 하중 크기만큼 <b>계단처럼 점프</b>합니다 (시계방향 하중 → 위로(+) 점프).</p>`;
    if (ex.zeros.length) h += `<p>V = 0 지점: ${ex.zeros.map(z => `x = <b>${fmt(z.x)} m</b>에서 M = <b>${fmt(z.M)} kN·m</b>`).join(', ')} (곡선의 꼭대기)</p>`;
    const mtxt = (o, ok) => ok ? `<span class="ans">${fmt(o.v)} kN·m</span> (x = ${fmt(o.x)} m)` : '없음';
    h += `<div class="eq">최대 정(+)모멘트 M<sub>max</sub> = ${mtxt(ex.Mmax, ex.Mmax.v > 1e-6)} &nbsp;|&nbsp; 최대 부(−)모멘트 = ${mtxt(ex.Mmin, ex.Mmin.v < -1e-6)}</div>`;
    h += `</div>`;

    // STEP 4 처짐
    h += `<div class="step"><h4><span class="step-dot">4</span>처짐 — 모멘트가 보를 얼마나 휘게 하나</h4>`;
    h += `<p>M(+) 구간은 아래로 볼록(∪), M(−) 구간은 위로 볼록(∩)하게 휩니다. 휘는 정도(곡률)는 <b>M / EI</b>이고, 이것을 두 번 누적하면 처짐 곡선이 됩니다. 지점에서는 처짐이 0, 고정단에서는 기울기까지 0입니다.</p>`;
    {
      const Mabs = Math.max(Math.abs(ex.Mmax.v), Math.abs(ex.Mmin.v)), sg = sigmaOf(Mabs);
      h += `<p><b>휨응력 검토</b> (${sec().name}, 보 높이 h = ${sec().h} mm → 연단 거리 c = h/2): 3D 모델의 색이 바로 이 응력 분포입니다. 위아래 끝에서 가장 크고 중립축에서 0입니다.</p>`;
      h += `<div class="eq">σmax = M·c / I = ${fmt(Mabs)}×10⁶ × ${fmt(sec().h / 2)} / (${fmt(st.I)}×10⁶) = <span class="ans">${fmt(sg, 1)} MPa</span>${sec().type === 'H' ? ` → SS275 항복강도 275 MPa 대비 ${fmt(sg / 275 * 100, 0)}%` : ''}</div>`;
    }
    h += `<div class="eq">EI = ${fmt(st.E)} GPa × ${fmt(st.I)}×10⁶ mm⁴ = ${fmt(res.EI, 0)} kN·m² &nbsp;→&nbsp; <span class="ans">δmax = ${fmt(Math.abs(ex.D.v), 2)} mm ${ex.D.v < 0 ? '(아래)' : '(위)'}</span> (x = ${fmt(ex.D.x)} m)</div>`;
    const lim = st.support === 'cantilever' ? L / 180 : L / 360;
    const ok = Math.abs(ex.D.v) / 1000 <= lim;
    h += `<p>참고: 일반적인 처짐 허용 기준 ${st.support === 'cantilever' ? 'L/180' : 'L/360'} = ${fmt(lim * 1000, 1)} mm → <b style="color:${ok ? 'var(--react)' : 'var(--neg)'}">${ok ? '만족 ✔' : '초과 ✘ (단면을 키워 보세요)'}</b></p>`;
    const chk = formulaCheck(ex);
    if (chk) h += `<div class="check-box"><b>공식으로 검산</b><br>${chk}</div>`;
    h += `</div>`;
    return h;
  }

  function formulaCheck(ex) {
    const L = st.L, EI = res.EI, ls = st.loads;
    if (ls.length !== 1) return '';
    const l = ls[0];
    const full = l.type === 'dist' && l.x1 < 1e-9 && l.x2 > L - 1e-9 && Math.abs(l.w1 - l.w2) < 1e-9;
    const mm = v => fmt(v * 1000, 2) + ' mm';
    if (st.support === 'simple') {
      if (l.type === 'point') {
        const a = l.x, b = L - a;
        let s = `M<sub>max</sub> = Pab/L = ${fmt(l.P)}×${fmt(a)}×${fmt(b)}/${fmt(L)} = <b>${fmt(l.P * a * b / L)} kN·m</b>`;
        if (Math.abs(a - L / 2) < 1e-9) s += `<br>δ<sub>max</sub> = PL³/48EI = <b>${mm(l.P * L ** 3 / (48 * EI))}</b>`;
        return s;
      }
      if (full) return `M<sub>max</sub> = wL²/8 = ${fmt(l.w1)}×${fmt(L)}²/8 = <b>${fmt(l.w1 * L * L / 8)} kN·m</b><br>δ<sub>max</sub> = 5wL⁴/384EI = <b>${mm(5 * l.w1 * L ** 4 / (384 * EI))}</b>`;
    }
    if (st.support === 'cantilever') {
      if (l.type === 'point' && Math.abs(l.x - L) < 1e-9) return `M<sub>max</sub> = PL = ${fmt(l.P)}×${fmt(L)} = <b>${fmt(l.P * L)} kN·m</b><br>δ<sub>max</sub> = PL³/3EI = <b>${mm(l.P * L ** 3 / (3 * EI))}</b>`;
      if (full) return `M<sub>max</sub> = wL²/2 = <b>${fmt(l.w1 * L * L / 2)} kN·m</b><br>δ<sub>max</sub> = wL⁴/8EI = <b>${mm(l.w1 * L ** 4 / (8 * EI))}</b>`;
    }
    if (st.support === 'fixed' && full) return `고정단 M = −wL²/12 = <b>${fmt(-l.w1 * L * L / 12)} kN·m</b>, 중앙 M = wL²/24 = <b>${fmt(l.w1 * L * L / 24)} kN·m</b><br>δ<sub>max</sub> = wL⁴/384EI = <b>${mm(l.w1 * L ** 4 / (384 * EI))}</b> (같은 단순보의 1/5)`;
    if (st.support === 'propped' && full) return `고정단 M = −wL²/8 = <b>${fmt(-l.w1 * L * L / 8)} kN·m</b>, 롤러 반력 = 3wL/8 = <b>${fmt(3 * l.w1 * L / 8)} kN</b><br>δ<sub>max</sub> ≈ wL⁴/185EI = <b>${mm(l.w1 * L ** 4 / (185 * EI))}</b>`;
    return '';
  }

  /* ---------------- 하중 목록 UI ---------------- */
  function renderLoadList() {
    const box = $('beam-loads');
    if (!st.loads.length) { box.innerHTML = `<p class="hint">하중이 없습니다. 위 버튼으로 추가하세요.</p>`; return; }
    let np = 0, nw = 0, nm = 0;
    box.innerHTML = st.loads.map(l => {
      const num = (k, v, lab, step = 0.1, min = '') => `<label>${lab}<input type="number" data-id="${l.id}" data-k="${k}" value="${+v.toFixed(3)}" step="${step}" ${min !== '' ? `min="${min}"` : ''}></label>`;
      if (l.type === 'point') return `<div class="load-item"><div class="load-item-head"><span><i></i>집중하중 P${++np}</span><button data-del="${l.id}" title="삭제">×</button></div><div class="load-fields">${num('P', l.P, '크기 P (kN)', 1)}${num('x', l.x, '위치 x (m)', 0.1, 0)}</div></div>`;
      if (l.type === 'moment') return `<div class="load-item moment"><div class="load-item-head"><span><i></i>모멘트 하중 M${++nm}</span><button data-del="${l.id}" title="삭제">×</button></div><div class="load-fields">${num('M', l.M, '크기 M (kN·m)', 1)}${num('x', l.x, '위치 x (m)', 0.1, 0)}</div></div>`;
      return `<div class="load-item"><div class="load-item-head"><span><i></i>분포하중 W${++nw}</span><button data-del="${l.id}" title="삭제">×</button></div><div class="load-fields">${num('w1', l.w1, '시작 w₁ (kN/m)', 0.5, 0)}${num('w2', l.w2, '끝 w₂ (kN/m)', 0.5, 0)}${num('x1', l.x1, '시작 x₁ (m)', 0.1, 0)}${num('x2', l.x2, '끝 x₂ (m)', 0.1, 0)}</div></div>`;
    }).join('');
  }

  function sanitize() {
    const L = st.L;
    st.aPos = clamp(st.aPos, 0, L - 1); st.bPos = clamp(st.bPos, st.aPos + 1, L);
    for (const l of st.loads) {
      if (l.type === 'dist') {
        l.x1 = clamp(l.x1, 0, L); l.x2 = clamp(l.x2, 0, L);
        if (l.x2 < l.x1) [l.x1, l.x2] = [l.x2, l.x1];
        if (l.x2 - l.x1 < 0.1) { l.x2 = Math.min(L, l.x1 + 0.1); l.x1 = l.x2 - 0.1; }
        l.w1 = Math.max(0, l.w1); l.w2 = Math.max(0, l.w2);
      } else l.x = clamp(l.x, 0, L);
    }
  }

  /* ---------------- 전체 갱신 ---------------- */
  function update(full = true) {
    sanitize();
    res = analyze();
    const showOverhang = st.support === 'overhang';
    $('beam-overhang').style.display = showOverhang ? '' : 'none';
    $('beam-L-out').textContent = `${fmt(st.L, 2)} m`;
    $('beam-a-out').textContent = `${fmt(st.aPos, 2)} m`;
    $('beam-b-out').textContent = `${fmt(st.bPos, 2)} m`;
    $('beam-support-desc').textContent = SUPPORT_INFO[st.support].desc;
    $('beam-EI').textContent = `EI = ${fmt(st.E * st.I, 0)} kN·m²  (클수록 덜 휩니다)`;
    $('bmd-legend').innerHTML = `<i class="sw pos"></i>(+) 정모멘트 ${st.tensionSide ? '— 아래(인장측)에 그림' : '— 위에 그림'} <i class="sw neg"></i>(−)`;
    document.querySelectorAll('#beam-support button').forEach(b => b.classList.toggle('active', b.dataset.v === st.support));

    if (res.error) {
      renderLoad();
      $('beam-steps').innerHTML = `<p>${res.error}</p>`;
      return;
    }
    const ex = extremes();
    renderLoad();
    maps.sfd = renderDiagram('beam-svg-sfd', res.V, { color: 'var(--pos)', labels: sfdLabels() });
    maps.bmd = renderDiagram('beam-svg-bmd', res.M, { color: 'var(--neg)', flip: st.tensionSide, labels: bmdLabels(ex) });
    maps.defl = renderDefl(ex);
    const Mabs = Math.max(Math.abs(ex.Mmax.v), Math.abs(ex.Mmin.v));
    $('beam-sig').textContent = `σmax = M·c/I = ${fmt(sigmaOf(Mabs), 1)} MPa`;
    update3D(ex);
    $('beam-reactions').innerHTML = res.sups.map(s => `<span class="chip">R${s.name} = ${fmt(s.R)} kN ${s.R >= 0 ? '↑' : '↓'}</span>` + (s.type === 'fixed' ? `<span class="chip">M${s.name} = ${fmt(Math.abs(s.Mr))} kN·m ${s.Mr >= 0 ? '↺' : '↻'}</span>` : '')).join('')
      + (SUPPORT_INFO[st.support].det ? '' : `<span class="chip warn">부정정 구조물</span>`);
    if (full) renderLoadList();
    $('beam-steps').innerHTML = stepsHTML(ex);
    drawCursor();
  }

  function addLoad(kind) {
    const L = st.L;
    if (kind === 'point') st.loads.push({ id: uid++, type: 'point', x: snap(L / 2), P: 10 });
    if (kind === 'udl') st.loads.push({ id: uid++, type: 'dist', x1: 0, x2: L, w1: 3, w2: 3 });
    if (kind === 'tri') st.loads.push({ id: uid++, type: 'dist', x1: 0, x2: L, w1: 0, w2: 5 });
    if (kind === 'moment') st.loads.push({ id: uid++, type: 'moment', x: snap(L / 3), M: 20 });
    update();
  }

  function loadExample(ex) {
    st.support = ex.support; st.L = ex.L;
    if (ex.aPos !== undefined) { st.aPos = ex.aPos; st.bPos = ex.bPos; } else { st.aPos = 0; st.bPos = ex.L * 0.75; }
    st.loads = ex.loads.map(l => Object.assign({ id: uid++ }, l));
    $('beam-L').value = st.L;
    syncOverhangRanges();
    update();
  }

  function syncOverhangRanges() {
    $('beam-a').max = st.L; $('beam-b').max = st.L;
    $('beam-a').value = st.aPos; $('beam-b').value = st.bPos;
  }

  /* ---------------- 이벤트 ---------------- */
  function bindPointer() {
    const ids = ['beam-svg-load', 'beam-svg-sfd', 'beam-svg-bmd', 'beam-svg-defl'];
    ids.forEach(id => {
      const svg = $(id);
      svg.addEventListener('pointerdown', e => {
        const t = e.target.closest('[data-load]');
        const p = svgPoint(svg, e);
        cursorX = clamp(xm(p.x), 0, st.L);
        if (t && id === 'beam-svg-load') {
          const l = st.loads.find(o => o.id === +t.dataset.load);
          if (!l) return;
          const ref = l.type === 'dist' ? l.x1 : l.x;
          drag = { l, off: xm(p.x) - ref, svg };
          svg.setPointerCapture(e.pointerId);
          e.preventDefault();
        }
        drawCursor();
      });
      svg.addEventListener('pointermove', e => {
        const p = svgPoint(svg, e);
        const x = xm(p.x);
        if (drag && drag.svg === svg) {
          const l = drag.l;
          let nx = snap(x - drag.off);
          if (l.type === 'dist') { const len = l.x2 - l.x1; nx = clamp(nx, 0, st.L - len); l.x1 = nx; l.x2 = +(nx + len).toFixed(6); }
          else l.x = clamp(nx, 0, st.L);
          cursorX = clamp(x, 0, st.L);
          update(false);
          return;
        }
        cursorX = clamp(x, 0, st.L);
        drawCursor();
      });
      const end = () => { if (drag) { drag = null; renderLoadList(); } };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
      svg.addEventListener('pointerleave', () => { if (!drag) { cursorX = null; drawCursor(); } });
    });
  }

  function init() {
    const sel = $('beam-example');
    EXAMPLES.forEach((ex, i) => sel.insertAdjacentHTML('beforeend', `<option value="${i}">${ex.label}</option>`));
    sel.addEventListener('change', () => { if (sel.value !== '') loadExample(EXAMPLES[+sel.value]); });

    document.querySelectorAll('#beam-support button').forEach(b => b.addEventListener('click', () => {
      st.support = b.dataset.v;
      if (st.support === 'overhang' && st.bPos >= st.L - 0.01) { st.aPos = 0; st.bPos = snap(st.L * 0.75); syncOverhangRanges(); }
      update();
    }));
    $('beam-L').addEventListener('input', e => {
      const old = st.L, nL = +e.target.value, r = nL / old;
      st.L = nL;
      st.loads.forEach(l => { if (l.type === 'dist') { l.x1 = snap(l.x1 * r); l.x2 = snap(l.x2 * r); } else l.x = snap(l.x * r); });
      st.aPos = snap(st.aPos * r); st.bPos = snap(st.bPos * r);
      syncOverhangRanges();
      update();
    });
    $('beam-a').addEventListener('input', e => { st.aPos = +e.target.value; update(false); });
    $('beam-b').addEventListener('input', e => { st.bPos = +e.target.value; update(false); });
    $('beam-E').addEventListener('change', e => { st.E = +e.target.value; update(false); });
    $('beam-I').addEventListener('change', e => { st.sec = +e.target.value; st.I = sec().I; if (sec().type === 'rect') { st.E = 25; $('beam-E').value = '25'; } update(false); });
    $('beam-tension').addEventListener('change', e => { st.tensionSide = e.target.checked; update(false); });
    $('beam-overlay').addEventListener('change', e => { st.overlay = e.target.checked; update(false); });
    document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => addLoad(b.dataset.add)));

    const list = $('beam-loads');
    list.addEventListener('input', e => {
      const t = e.target; if (!t.dataset.id) return;
      const l = st.loads.find(o => o.id === +t.dataset.id);
      const v = parseFloat(t.value);
      if (!l || !isFinite(v)) return;
      l[t.dataset.k] = v;
      update(false);
    });
    list.addEventListener('change', () => renderLoadList());
    list.addEventListener('click', e => {
      const d = e.target.closest('[data-del]');
      if (d) { st.loads = st.loads.filter(o => o.id !== +d.dataset.del); update(); }
    });

    $('beam-tension').checked = st.tensionSide;
    $('beam-overlay').checked = st.overlay;
    $('beam-E').value = String(st.E);
    $('beam-I').innerHTML = SECTIONS.map((x, i) => `<option value="${i}">${x.name} · I = ${x.I}×10⁶ mm⁴</option>`).join('');
    $('beam-I').value = String(st.sec);
    bindView();
    bindPointer();

    // 시작 상태
    st.L = 10;
    st.loads = [{ id: uid++, type: 'point', x: 3, P: 20 }, { id: uid++, type: 'dist', x1: 6, x2: 10, w1: 5, w2: 5 }];
    $('beam-L').value = st.L;
    syncOverhangRanges();
    update();
  }

  /* ---------------- 3D 보기 ---------------- */
  function update3D(ex, animate = false) {
    if (st.view !== '3d' || !res || res.error) return;
    if (!b3d) { b3d = Beam3D.make($('beam-3d')); animate = true; if (!b3d) return; }
    const Rmax = Math.max(1e-9, ...res.sups.map(s => Math.abs(s.R)));
    b3d.update({
      L: st.L, sups: res.sups, loads: st.loads, nodes: res.nodes, defl: res.defl,
      deflAt, Mat: x => VMat(x).M, Mabs: Math.max(Math.abs(ex.Mmax.v), Math.abs(ex.Mmin.v)), Rmax,
      sec: { type: sec().type, h: sec().h, B: sec().B },
    }, { animate });
    b3d.start();
  }
  function bindView() {
    const setView = v => {
      st.view = v;
      document.querySelectorAll('#beam-view button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
      $('beam-3d').toggleAttribute('hidden', v !== '3d');
      $('beam-svg-load').toggleAttribute('hidden', v !== '2d');
      if (v === '3d' && res && !res.error) update3D(extremes());
    };
    document.querySelectorAll('#beam-view button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v)));
    $('beam-play3d').addEventListener('click', () => {
      if (st.view !== '3d') setView('3d');
      if (b3d) b3d.play();
    });
    $('beam-sweep').addEventListener('click', sweep);
    if (!Viewer3D.has()) setView('2d');
  }

  return { init, refresh: () => { update(false); if (st.view === '3d' && b3d) b3d.start(); } };
})();
