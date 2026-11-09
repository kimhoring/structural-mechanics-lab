'use strict';
/* 연습문제: 매번 숫자가 바뀌는 문제를 만들고 채점·풀이를 보여 준다 */

const Quiz = (() => {
  const $ = id => document.getElementById(id);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const TOPICS = { all: '전체', beam: '반력·단면력', truss: '트러스', section: '단면·응력', defl: '처짐·좌굴' };
  const st = { topic: 'all', cur: null, checked: false, reveal: false, score: { ok: 0, tried: 0, streak: 0 } };
  try { const s = JSON.parse(localStorage.getItem('sm-quiz') || 'null'); if (s) st.score = s; } catch (e) { /* 저장소 사용 불가 */ }
  const save = () => { try { localStorage.setItem('sm-quiz', JSON.stringify(st.score)); } catch (e) { /* 무시 */ } };

  /* ---------- 그림 도우미 ---------- */
  function beamFig(o) {
    const svg = svgEl('svg', { viewBox: '0 0 640 210', class: 'q-fig' });
    const total = o.L, X = x => 60 + x / total * 520, by = 96;
    svgEl('rect', { x: X(0), y: by - 7, width: X(total) - X(0), height: 14, rx: 3, class: 'beam-rect' }, svg);
    o.sups.forEach(s => {
      const x = X(s.x);
      if (s.type === 'fixed') {
        svgEl('line', { x1: x, y1: by - 40, x2: x, y2: by + 40, class: 'ground', 'stroke-width': 3 }, svg);
        for (let y = by - 36; y <= by + 40; y += 9) svgEl('line', { x1: x, y1: y, x2: x - 10, y2: y - 8, class: 'ground', 'stroke-width': 1.3 }, svg);
      } else {
        svgEl('polygon', { points: `${x},${by + 7} ${x - 13},${by + 29} ${x + 13},${by + 29}`, class: 'sup-fill' }, svg);
        if (s.type === 'roller') { svgEl('circle', { cx: x - 6, cy: by + 34, r: 4, class: 'sup-fill' }, svg); svgEl('circle', { cx: x + 6, cy: by + 34, r: 4, class: 'sup-fill' }, svg); }
        drawHatch(svg, x - 20, by + (s.type === 'roller' ? 39 : 29), x + 20);
      }
      svgText(svg, x, by + 62, s.name, { 'text-anchor': 'middle', 'font-weight': 800, class: 'svg-muted' });
    });
    (o.loads || []).forEach(l => {
      if (l.type === 'point') {
        drawArrow(svg, X(l.x), 22, X(l.x), by - 8, { color: 'var(--load)', width: 3, head: 12 });
        svgText(svg, X(l.x) + 8, 26, `${fmt(l.P)} kN`, { 'font-weight': 700, style: 'fill:var(--load)' });
      } else {
        svgEl('rect', { x: X(l.x1), y: by - 44, width: X(l.x2) - X(l.x1), height: 36, style: 'fill:var(--load);opacity:.1' }, svg);
        svgEl('line', { x1: X(l.x1), y1: by - 44, x2: X(l.x2), y2: by - 44, style: 'stroke:var(--load);stroke-width:2' }, svg);
        const n = Math.max(2, Math.round((X(l.x2) - X(l.x1)) / 26));
        for (let i = 0; i <= n; i++) { const x = X(l.x1) + (X(l.x2) - X(l.x1)) * i / n; drawArrow(svg, x, by - 44, x, by - 8, { color: 'var(--load)', width: 1.5, head: 7 }); }
        svgText(svg, (X(l.x1) + X(l.x2)) / 2, by - 52, `w = ${fmt(l.w)} kN/m`, { 'text-anchor': 'middle', 'font-weight': 700, style: 'fill:var(--load)' });
      }
    });
    // 치수선
    const marks = [...new Set([0, total, ...(o.dims || [])])].sort((a, b) => a - b);
    const dy = 186;
    svgEl('line', { x1: X(0), y1: dy, x2: X(total), y2: dy, class: 'axis-strong' }, svg);
    marks.forEach(m => svgEl('line', { x1: X(m), y1: dy - 6, x2: X(m), y2: dy + 6, class: 'axis-strong' }, svg));
    for (let i = 0; i < marks.length - 1; i++) svgText(svg, (X(marks[i]) + X(marks[i + 1])) / 2, dy - 6, `${fmt(marks[i + 1] - marks[i])} m`, { 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600 });
    return svg;
  }

  function trussFig(d, h, P, target) {
    const svg = svgEl('svg', { viewBox: '0 0 640 260', class: 'q-fig' });
    const s = Math.min(480 / (4 * d), 130 / h), ox = (640 - 4 * d * s) / 2, oy = 190;
    const P_ = (x, y) => [ox + x * s, oy - y * s];
    const nodes = {};
    for (let i = 0; i <= 4; i++) { nodes['L' + i] = P_(i * d, 0); nodes['U' + i] = P_(i * d, h); }
    const mem = [];
    for (let i = 0; i < 4; i++) mem.push(['L' + i, 'L' + (i + 1)], ['U' + i, 'U' + (i + 1)]);
    for (let i = 0; i <= 4; i++) mem.push(['L' + i, 'U' + i]);
    mem.push(['U0', 'L1'], ['U1', 'L2'], ['L2', 'U3'], ['L3', 'U4']);
    mem.forEach(([a, b]) => {
      const sel = target === a + b || target === b + a;
      svgEl('line', { x1: nodes[a][0], y1: nodes[a][1], x2: nodes[b][0], y2: nodes[b][1], style: `stroke:${sel ? 'var(--accent)' : 'var(--beam)'};stroke-width:${sel ? 6 : 3};stroke-linecap:round` }, svg);
    });
    Object.entries(nodes).forEach(([k, [x, y]]) => {
      svgEl('circle', { cx: x, cy: y, r: 5, style: 'fill:var(--surface);stroke:var(--beam);stroke-width:2' }, svg);
      svgText(svg, x - 8, y + (k[0] === 'L' ? 18 : -9), k, { 'text-anchor': 'end', 'font-size': 11.5, 'font-weight': 700, class: 'svg-muted' });
    });
    [1, 2, 3].forEach(i => { const [x, y] = nodes['L' + i]; drawArrow(svg, x, y + 8, x, y + 48, { color: 'var(--load)', width: 2.6, head: 10 }); svgText(svg, x + 6, y + 50, `${P} kN`, { 'font-size': 12, 'font-weight': 700, style: 'fill:var(--load)' }); });
    const [ax, ay] = nodes.L0, [bx, byy] = nodes.L4;
    svgEl('polygon', { points: `${ax},${ay + 6} ${ax - 12},${ay + 26} ${ax + 12},${ay + 26}`, class: 'sup-fill' }, svg);
    svgEl('polygon', { points: `${bx},${byy + 6} ${bx - 12},${byy + 22} ${bx + 12},${byy + 22}`, class: 'sup-fill' }, svg);
    svgEl('circle', { cx: bx - 5, cy: byy + 26, r: 3.5, class: 'sup-fill' }, svg); svgEl('circle', { cx: bx + 5, cy: byy + 26, r: 3.5, class: 'sup-fill' }, svg);
    svgText(svg, nodes.U4[0] + 14, (nodes.U4[1] + nodes.L4[1]) / 2 + 4, `h = ${h} m`, { 'font-size': 12, class: 'svg-muted' });
    svgText(svg, (nodes.L0[0] + nodes.L1[0]) / 2, oy + 66, `패널 d = ${d} m (×4)`, { 'text-anchor': 'middle', 'font-size': 12, class: 'svg-muted' });
    return svg;
  }

  function tFig(B, tf, tw, H) {
    const svg = svgEl('svg', { viewBox: '0 0 640 240', class: 'q-fig' });
    const s = Math.min(200 / H, 300 / B), cx = 260, by = 220;
    svgEl('rect', { x: cx - B / 2 * s, y: by - H * s, width: B * s, height: tf * s, class: 'sec-fill' }, svg);
    svgEl('rect', { x: cx - tw / 2 * s, y: by - (H - tf) * s, width: tw * s, height: (H - tf) * s, class: 'sec-fill' }, svg);
    svgText(svg, cx, by - H * s - 8, `B = ${B}`, { 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 600 });
    svgText(svg, cx + B / 2 * s + 8, by - (H - tf / 2) * s + 4, `tf = ${tf}`, { 'font-size': 12.5, 'font-weight': 600 });
    svgText(svg, cx + tw / 2 * s + 8, by - (H - tf) / 2 * s, `tw = ${tw}`, { 'font-size': 12.5, 'font-weight': 600 });
    svgText(svg, cx - B / 2 * s - 12, by - H / 2 * s, `H = ${H}`, { 'text-anchor': 'end', 'font-size': 12.5, 'font-weight': 600 });
    svgText(svg, 470, 120, '단위: mm', { class: 'svg-muted', 'font-size': 12 });
    return svg;
  }

  /* ---------- 문제 생성기 ---------- */
  const GENS = [
    { topic: 'beam', gen() {
      const L = pick([6, 8, 9, 10, 12]), a = randInt(1, L - 1), b = L - a, P = pick([10, 15, 20, 30, 40]);
      const RA = P * b / L, RB = P * a / L, M = P * a * b / L;
      return {
        title: '단순보 — 집중하중', text: `길이 ${L} m 단순보의 A점에서 ${a} m 위치에 집중하중 ${P} kN이 작용합니다. 반력과 최대 휨모멘트를 구하세요.`,
        fig: () => beamFig({ L, sups: [{ x: 0, type: 'pin', name: 'A' }, { x: L, type: 'roller', name: 'B' }], loads: [{ type: 'point', x: a, P }], dims: [a] }),
        asks: [{ label: 'R<sub>A</sub>', unit: 'kN', ans: RA }, { label: 'R<sub>B</sub>', unit: 'kN', ans: RB }, { label: 'M<sub>max</sub>', unit: 'kN·m', ans: M }],
        sol: `<div class="eq">ΣM<sub>A</sub> = 0 : ${P}×${a} − R<sub>B</sub>×${L} = 0 → R<sub>B</sub> = <b>${fmt(RB)}</b> kN</div>
          <div class="eq">ΣF<sub>y</sub> = 0 : R<sub>A</sub> = ${P} − ${fmt(RB)} = <b>${fmt(RA)}</b> kN</div>
          <div class="eq">M<sub>max</sub> = R<sub>A</sub>×${a} = Pab/L = ${P}×${a}×${b}/${L} = <b>${fmt(M)}</b> kN·m (하중 작용점)</div>`,
      };
    } },
    { topic: 'beam', gen() {
      const L = pick([8, 10, 12]), c = randInt(Math.ceil(L / 3), L - 2), w = pick([2, 3, 4, 5, 6]);
      const RB = w * c * c / (2 * L), RA = w * c - RB, x0 = RA / w, M = RA * RA / (2 * w);
      return {
        title: '단순보 — 부분 등분포하중', text: `길이 ${L} m 단순보의 왼쪽 ${c} m 구간에 등분포하중 ${w} kN/m가 작용합니다. R<sub>A</sub>, 전단력이 0이 되는 위치 x, 최대 휨모멘트를 구하세요.`,
        fig: () => beamFig({ L, sups: [{ x: 0, type: 'pin', name: 'A' }, { x: L, type: 'roller', name: 'B' }], loads: [{ type: 'dist', x1: 0, x2: c, w }], dims: [c] }),
        asks: [{ label: 'R<sub>A</sub>', unit: 'kN', ans: RA }, { label: 'V = 0 위치 x', unit: 'm', ans: x0 }, { label: 'M<sub>max</sub>', unit: 'kN·m', ans: M }],
        sol: `<div class="eq">합력 W = ${w}×${c} = ${fmt(w * c)} kN, 작용점 x = ${fmt(c / 2)} m</div>
          <div class="eq">ΣM<sub>A</sub> = 0 : ${fmt(w * c)}×${fmt(c / 2)} − R<sub>B</sub>×${L} = 0 → R<sub>B</sub> = ${fmt(RB)} kN, R<sub>A</sub> = <b>${fmt(RA)}</b> kN</div>
          <div class="eq">V(x) = R<sub>A</sub> − w·x = 0 → x = ${fmt(RA)}/${w} = <b>${fmt(x0)}</b> m</div>
          <div class="eq">M<sub>max</sub> = R<sub>A</sub>·x − w·x²/2 = R<sub>A</sub>²/(2w) = <b>${fmt(M)}</b> kN·m</div>`,
      };
    } },
    { topic: 'beam', gen() {
      const L = pick([3, 4, 5, 6]), P = pick([5, 10, 15, 20]), w = pick([2, 3, 4, 5]);
      const V = P + w * L, M = P * L + w * L * L / 2;
      return {
        title: '캔틸레버 — 끝단 하중 + 등분포하중', text: `길이 ${L} m 캔틸레버에 등분포하중 ${w} kN/m와 자유단 집중하중 ${P} kN이 작용합니다. 고정단의 전단력과 휨모멘트 크기를 구하세요.`,
        fig: () => beamFig({ L, sups: [{ x: 0, type: 'fixed', name: 'A' }], loads: [{ type: 'dist', x1: 0, x2: L, w }, { type: 'point', x: L, P }] }),
        asks: [{ label: '|V<sub>A</sub>|', unit: 'kN', ans: V }, { label: '|M<sub>A</sub>|', unit: 'kN·m', ans: M }],
        sol: `<div class="eq">V<sub>A</sub> = P + wL = ${P} + ${w}×${L} = <b>${fmt(V)}</b> kN</div>
          <div class="eq">M<sub>A</sub> = P·L + wL²/2 = ${P}×${L} + ${w}×${L}²/2 = <b>${fmt(M)}</b> kN·m (부모멘트, 위쪽 인장)</div>`,
      };
    } },
    { topic: 'beam', gen() {
      const s = pick([6, 8, 10]), a = pick([2, 3]), w = pick([2, 3, 4]), P = pick([5, 10, 15]);
      const RB = (w * s * s / 2 + P * (s + a)) / s, RA = w * s + P - RB, MB = -P * a;
      return {
        title: '내민보 — 지점 B 위의 부모멘트', text: `지간 ${s} m, 내민 길이 ${a} m인 내민보입니다. 지간에 ${w} kN/m, 내민 끝에 ${P} kN이 작용합니다. 반력과 지점 B의 휨모멘트(부호 포함)를 구하세요.`,
        fig: () => beamFig({ L: s + a, sups: [{ x: 0, type: 'pin', name: 'A' }, { x: s, type: 'roller', name: 'B' }], loads: [{ type: 'dist', x1: 0, x2: s, w }, { type: 'point', x: s + a, P }], dims: [s] }),
        asks: [{ label: 'R<sub>A</sub>', unit: 'kN', ans: RA }, { label: 'R<sub>B</sub>', unit: 'kN', ans: RB }, { label: 'M<sub>B</sub>', unit: 'kN·m', ans: MB }],
        sol: `<div class="eq">ΣM<sub>A</sub> = 0 : ${fmt(w * s)}×${fmt(s / 2)} + ${P}×${s + a} − R<sub>B</sub>×${s} = 0 → R<sub>B</sub> = <b>${fmt(RB)}</b> kN</div>
          <div class="eq">ΣF<sub>y</sub> = 0 : R<sub>A</sub> = ${fmt(w * s)} + ${P} − ${fmt(RB)} = <b>${fmt(RA)}</b> kN</div>
          <div class="eq">B점 오른쪽(내민 부분)만 보면 M<sub>B</sub> = −P×a = −${P}×${a} = <b>${fmt(MB)}</b> kN·m</div>`,
      };
    } },
    { topic: 'truss', gen() {
      const d = pick([3, 4]), h = pick([3, 4]), P = pick([10, 20, 30]);
      const R = 1.5 * P, len = Math.hypot(d, h), sin = h / len;
      const which = pick(['U1U2', 'L1L2', 'U1L2', 'U1L1']);
      const F = { U1U2: -2 * P * d / h, L1L2: R * d / h, U1L2: (R - P) / sin, U1L1: -(R - P) }[which];
      const sols = {
        U1U2: `<div class="eq">패널 2를 자르고 왼쪽 덩어리에서 L2점(나머지 두 부재가 만나는 점)에 대한 모멘트:</div><div class="eq">ΣM<sub>L2</sub> = 0 : −R<sub>A</sub>×${2 * d} + ${P}×${d} − F×${h} = 0 → F = <b>${fmt(F)}</b> kN (압축)</div>`,
        L1L2: `<div class="eq">패널 2를 자르고 U1점에 대한 모멘트:</div><div class="eq">ΣM<sub>U1</sub> = 0 : −R<sub>A</sub>×${d} + F×${h} = 0 → F = ${fmt(R)}×${d}/${h} = <b>${fmt(F)}</b> kN (인장)</div>`,
        U1L2: `<div class="eq">패널 2를 자르면 상·하현재가 평행하므로 세로 방향 힘의 평형:</div><div class="eq">ΣF<sub>y</sub> = 0 : R<sub>A</sub> − ${P} − F·sinθ = 0, sinθ = ${h}/${fmt(len)} → F = <b>${fmt(F)}</b> kN (인장)</div>`,
        U1L1: `<div class="eq">먼저 절단법으로 F<sub>U1L2</sub> = (R<sub>A</sub> − P)/sinθ = ${fmt((R - P) / sin)} kN</div><div class="eq">절점 U1에서 ΣF<sub>y</sub> = 0 : −F<sub>U1L1</sub> − F<sub>U1L2</sub>·sinθ = 0 → F<sub>U1L1</sub> = <b>${fmt(F)}</b> kN (압축)</div>`,
      };
      return {
        title: `프랫 트러스 — 부재 ${which}`, text: `패널 4개(각 ${d} m), 높이 ${h} m인 프랫 트러스의 하현 절점 L1, L2, L3에 각각 ${P} kN이 작용합니다. 부재 <b>${which}</b>의 부재력을 구하세요. (인장 +, 압축 −)`,
        fig: () => trussFig(d, h, P, which),
        asks: [{ label: `F<sub>${which}</sub>`, unit: 'kN', ans: F }],
        sol: `<div class="eq">대칭이므로 R<sub>A</sub> = R<sub>B</sub> = 3P/2 = ${fmt(R)} kN</div>` + sols[which],
      };
    } },
    { topic: 'section', gen() {
      const B = pick([400, 500, 600]), tf = pick([100, 120, 150]), tw = pick([200, 250, 300]), H = pick([500, 600, 700]);
      const A1 = B * tf, y1 = H - tf / 2, A2 = tw * (H - tf), y2 = (H - tf) / 2;
      const yb = (A1 * y1 + A2 * y2) / (A1 + A2);
      const I = B * tf ** 3 / 12 + A1 * (y1 - yb) ** 2 + tw * (H - tf) ** 3 / 12 + A2 * (y2 - yb) ** 2;
      return {
        title: 'T형 단면 — 도심과 단면2차모멘트', text: `그림의 T형 단면에서 아래 끝으로부터 도심까지 거리 ȳ와 도심축에 대한 단면2차모멘트 I를 구하세요.`,
        fig: () => tFig(B, tf, tw, H),
        asks: [{ label: 'ȳ', unit: 'mm', ans: yb }, { label: 'I', unit: '×10⁶ mm⁴', ans: I / 1e6 }],
        sol: `<div class="eq">플랜지 A₁ = ${B}×${tf} = ${fmt(A1)}, y₁ = ${fmt(y1)} · 웨브 A₂ = ${tw}×${H - tf} = ${fmt(A2)}, y₂ = ${fmt(y2)}</div>
          <div class="eq">ȳ = (A₁y₁ + A₂y₂)/(A₁ + A₂) = <b>${fmt(yb, 1)}</b> mm</div>
          <div class="eq">I = Σ(bh³/12 + A·d²) = <b>${fmt(I / 1e6, 1)}</b>×10⁶ mm⁴</div>`,
      };
    } },
    { topic: 'section', gen() {
      const b = pick([200, 250, 300, 400]), h = pick([400, 500, 600, 700]), M = pick([50, 80, 100, 150, 200]);
      const S = b * h * h / 6, sg = M * 1e6 / S;
      return {
        title: '직사각형 보 — 최대 휨응력', text: `폭 ${b} mm, 높이 ${h} mm인 직사각형 단면 보에 휨모멘트 ${M} kN·m가 작용합니다. 단면계수 S와 최대 휨응력 σ<sub>max</sub>를 구하세요.`,
        fig: () => { const s = svgEl('svg', { viewBox: '0 0 640 200', class: 'q-fig' }); const k = 160 / h; svgEl('rect', { x: 320 - b / 2 * k, y: 20, width: b * k, height: h * k, class: 'sec-fill' }, s); svgText(s, 320, 196, `b = ${b} mm`, { 'text-anchor': 'middle', 'font-size': 12.5 }); svgText(s, 320 + b / 2 * k + 10, 104, `h = ${h} mm`, { 'font-size': 12.5 }); return s; },
        asks: [{ label: 'S', unit: '×10⁶ mm³', ans: S / 1e6 }, { label: 'σ<sub>max</sub>', unit: 'MPa', ans: sg }],
        sol: `<div class="eq">S = bh²/6 = ${b}×${h}²/6 = <b>${fmt(S / 1e6, 2)}</b>×10⁶ mm³</div><div class="eq">σ<sub>max</sub> = M/S = ${M}×10⁶ / ${fmt(S)} = <b>${fmt(sg, 2)}</b> MPa</div>`,
      };
    } },
    { topic: 'defl', gen() {
      const L = pick([6, 8, 10]), w = pick([5, 10, 15, 20]), I = pick([237, 776, 1130]), EI = 205 * I;
      const d = 5 * w * L ** 4 / (384 * EI) * 1000;
      return {
        title: '단순보 — 등분포하중 처짐', text: `지간 ${L} m 단순보에 등분포하중 ${w} kN/m가 작용합니다. E = 205 GPa, I = ${I}×10⁶ mm⁴일 때 중앙 처짐을 구하세요.`,
        fig: () => beamFig({ L, sups: [{ x: 0, type: 'pin', name: 'A' }, { x: L, type: 'roller', name: 'B' }], loads: [{ type: 'dist', x1: 0, x2: L, w }] }),
        asks: [{ label: 'δ<sub>max</sub>', unit: 'mm', ans: d }],
        sol: `<div class="eq">EI = 205×10⁶ kN/m² × ${I}×10⁻⁶ m⁴ = ${fmt(EI)} kN·m²</div><div class="eq">δ = 5wL⁴/(384EI) = 5×${w}×${L}⁴/(384×${fmt(EI)}) = <b>${fmt(d, 2)}</b> mm</div><p class="hint">허용 처짐 L/360 = ${fmt(L * 1000 / 360, 1)} mm와 비교해 보세요.</p>`,
      };
    } },
    { topic: 'defl', gen() {
      const ends = [['양단 핀', 1], ['고정–핀', 0.7], ['양단 고정', 0.5], ['고정–자유', 2]];
      const [nm, K] = pick(ends), L = pick([3, 4, 5, 6, 8]), I = pick([16.0, 36.5, 67.5]);
      const Pcr = Math.PI ** 2 * 205000 * I * 1e6 / (K * L * 1000) ** 2 / 1000;
      return {
        title: '기둥 — 오일러 좌굴하중', text: `길이 ${L} m, 지지 조건 <b>${nm}</b>인 강재 기둥의 약축 단면2차모멘트가 I = ${I}×10⁶ mm⁴입니다 (E = 205 GPa). 유효좌굴길이 계수 K와 탄성 좌굴하중을 구하세요.`,
        fig: () => { const s = svgEl('svg', { viewBox: '0 0 640 200', class: 'q-fig' }); svgEl('line', { x1: 320, y1: 30, x2: 320, y2: 180, style: 'stroke:var(--beam);stroke-width:12' }, s); drawArrow(s, 320, -10 + 10, 320, 26, { color: 'var(--load)', width: 3 }); svgText(s, 340, 110, `L = ${L} m · ${nm}`, { 'font-size': 13, 'font-weight': 600 }); return s; },
        asks: [{ label: 'K', unit: '', ans: K }, { label: 'P<sub>cr</sub>', unit: 'kN', ans: Pcr }],
        sol: `<div class="eq">${nm} → K = <b>${K}</b>, KL = ${fmt(K * L, 2)} m</div><div class="eq">P<sub>cr</sub> = π²EI/(KL)² = π²×205,000×${I}×10⁶ / (${fmt(K * L * 1000)})² = <b>${fmt(Pcr, 0)}</b> kN</div>`,
      };
    } },
  ];

  function next() {
    const pool = GENS.filter(g => st.topic === 'all' || g.topic === st.topic);
    const g = pick(pool);
    st.cur = Object.assign({ topicName: TOPICS[g.topic] }, g.gen());
    st.checked = false; st.reveal = false;
    render();
  }

  function render() {
    const q = st.cur;
    document.querySelectorAll('#quiz-topics button').forEach(b => b.classList.toggle('active', b.dataset.v === st.topic));
    const sc = st.score;
    $('quiz-score').innerHTML = `<div class="kv"><span>정답</span><b>${sc.ok}</b></div><div class="kv"><span>시도</span><b>${sc.tried}</b></div><div class="kv"><span>정답률</span><b>${sc.tried ? Math.round(sc.ok / sc.tried * 100) : 0}%</b></div><div class="kv"><span>연속 정답</span><b>${sc.streak}</b></div>`;
    const box = $('quiz-card');
    box.innerHTML = `<div class="q-head"><span class="pill">${q.topicName}</span><h3>${q.title}</h3></div><p class="q-text">${q.text}</p><div class="q-fig-wrap"></div>
      <form class="q-answers" id="quiz-form" autocomplete="off">${q.asks.map((a, i) => `
        <label class="q-ans" data-i="${i}"><span class="q-label">${a.label}</span>
          <span class="q-input"><input type="number" step="any" id="quiz-in-${i}" inputmode="decimal" ${st.checked ? 'readonly' : ''}><em>${a.unit}</em></span>
          <span class="q-mark"></span></label>`).join('')}
        <div class="q-actions">
          <button type="submit" class="btn primary" ${st.checked ? 'disabled' : ''}>채점하기</button>
          <button type="button" class="btn" data-q="reveal">${st.reveal ? '풀이 숨기기' : '풀이 보기'}</button>
          <button type="button" class="btn ghost" data-q="next">다음 문제 →</button>
        </div></form>
      <div class="q-sol" ${st.reveal ? '' : 'hidden'}><h4>풀이</h4>${q.sol}</div>`;
    box.querySelector('.q-fig-wrap').appendChild(q.fig());
  }

  function grade(e) {
    e.preventDefault();
    if (st.checked) return;
    const q = st.cur;
    let all = true, any = false;
    q.asks.forEach((a, i) => {
      const inp = $('quiz-in-' + i), v = parseFloat(inp.value), lab = inp.closest('.q-ans');
      const ok = isFinite(v) && Math.abs(v - a.ans) <= Math.max(0.01 * Math.abs(a.ans), 0.05);
      if (isFinite(v)) any = true;
      all = all && ok;
      lab.classList.add(ok ? 'ok' : 'bad');
      lab.querySelector('.q-mark').textContent = ok ? '정답' : `오답 · 정답 ${fmt(a.ans, 2)}`;
      inp.readOnly = true;
    });
    if (!any) { q.asks.forEach((a, i) => { const lab = $('quiz-in-' + i).closest('.q-ans'); lab.classList.remove('ok', 'bad'); lab.querySelector('.q-mark').textContent = '값을 입력하세요'; $('quiz-in-' + i).readOnly = false; }); return; }
    st.checked = true;
    st.score.tried++;
    if (all) { st.score.ok++; st.score.streak++; } else st.score.streak = 0;
    save();
    e.target.querySelector('[type=submit]').disabled = true;
    const sc = st.score;
    $('quiz-score').innerHTML = `<div class="kv"><span>정답</span><b>${sc.ok}</b></div><div class="kv"><span>시도</span><b>${sc.tried}</b></div><div class="kv"><span>정답률</span><b>${Math.round(sc.ok / sc.tried * 100)}%</b></div><div class="kv"><span>연속 정답</span><b>${sc.streak}</b></div>`;
    if (!all) { st.reveal = true; $('quiz-card').querySelector('.q-sol').hidden = false; $('quiz-card').querySelector('[data-q=reveal]').textContent = '풀이 숨기기'; }
  }

  function init() {
    $('quiz-topics').innerHTML = Object.entries(TOPICS).map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('');
    $('quiz-topics').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { st.topic = b.dataset.v; next(); } });
    $('quiz-card').addEventListener('submit', grade);
    $('quiz-card').addEventListener('click', e => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      if (b.dataset.q === 'next') next();
      if (b.dataset.q === 'reveal') { st.reveal = !st.reveal; $('quiz-card').querySelector('.q-sol').hidden = !st.reveal; b.textContent = st.reveal ? '풀이 숨기기' : '풀이 보기'; }
    });
    $('quiz-reset').addEventListener('click', () => { st.score = { ok: 0, tried: 0, streak: 0 }; save(); render(); });
    next();
  }
  return { init };
})();
