'use strict';
/* 단면과 응력: 도심·단면2차모멘트(평행축 정리), 휨응력 σ = M·y/I, 전단응력 τ = V·Q/(I·b)
   단위: mm, kN, kN·m → 응력 MPa */

const Section = (() => {
  const $ = id => document.getElementById(id);
  const SHAPES = {
    rect: { name: '직사각형', dims: [['b', '폭 b', 300, 100, 800], ['h', '높이 h', 600, 100, 1200]] },
    H: { name: 'H형강', dims: [['H', '전체 높이 H', 400, 150, 900], ['B', '플랜지 폭 B', 200, 100, 400], ['tw', '웨브 두께 tw', 8, 4, 30], ['tf', '플랜지 두께 tf', 13, 5, 40]] },
    T: { name: 'T형', dims: [['H', '전체 높이 H', 500, 150, 1000], ['B', '플랜지 폭 B', 600, 150, 1500], ['tf', '플랜지 두께 tf', 120, 50, 300], ['tw', '웨브 폭 tw', 250, 100, 600]] },
    circle: { name: '원형', dims: [['D', '지름 D', 400, 100, 1000]] },
  };
  const st = { shape: 'H', d: {}, M: 120, V: 150, hoverY: null };
  Object.keys(SHAPES).forEach(k => { st.d[k] = {}; SHAPES[k].dims.forEach(([key, , def]) => { st.d[k][key] = def; }); });

  /* 직사각형 조각들 (y0: 아래에서부터) */
  function parts() {
    const d = st.d[st.shape];
    if (st.shape === 'rect') return [{ name: '단면', b: d.b, h: d.h, y0: 0 }];
    if (st.shape === 'H') {
      const tf = Math.min(d.tf, d.H / 2 - 1), tw = Math.min(d.tw, d.B);
      return [{ name: '하부 플랜지', b: d.B, h: tf, y0: 0 }, { name: '웨브', b: tw, h: d.H - 2 * tf, y0: tf }, { name: '상부 플랜지', b: d.B, h: tf, y0: d.H - tf }];
    }
    if (st.shape === 'T') {
      const tf = Math.min(d.tf, d.H - 10), tw = Math.min(d.tw, d.B);
      return [{ name: '웨브', b: tw, h: d.H - tf, y0: 0 }, { name: '플랜지', b: d.B, h: tf, y0: d.H - tf }];
    }
    return null;
  }
  const height = () => st.shape === 'circle' ? st.d.circle.D : st.shape === 'rect' ? st.d.rect.h : st.d[st.shape].H;
  function widthAt(y) {
    if (st.shape === 'circle') { const r = st.d.circle.D / 2; const q = r * r - (y - r) * (y - r); return q > 0 ? 2 * Math.sqrt(q) : 0; }
    let b = 0;
    for (const p of parts()) if (y >= p.y0 - 1e-9 && y <= p.y0 + p.h + 1e-9) b = Math.max(b, p.b);
    return b;
  }

  function props() {
    const Ht = height();
    let A, yb, I, table = null;
    if (st.shape === 'circle') {
      const D = st.d.circle.D; A = Math.PI * D * D / 4; yb = D / 2; I = Math.PI * D ** 4 / 64;
    } else {
      const ps = parts();
      A = ps.reduce((s, p) => s + p.b * p.h, 0);
      yb = ps.reduce((s, p) => s + p.b * p.h * (p.y0 + p.h / 2), 0) / A;
      table = ps.map(p => {
        const a = p.b * p.h, yc = p.y0 + p.h / 2, I0 = p.b * p.h ** 3 / 12, dd = yc - yb;
        return { name: p.name, b: p.b, h: p.h, A: a, y: yc, Ay: a * yc, I0, d: dd, Ad2: a * dd * dd };
      });
      I = table.reduce((s, r) => s + r.I0 + r.Ad2, 0);
    }
    // Q(y) 수치 적분 (위에서부터 누적)
    const N = 1200, dy = Ht / N, Qs = new Float64Array(N + 1);
    let q = 0;
    Qs[N] = 0;
    for (let i = N - 1; i >= 0; i--) { const ym = (i + 0.5) * dy; q += widthAt(ym) * (ym - yb) * dy; Qs[i] = q; }
    const Qat = y => { const t = clamp(y / dy, 0, N), i = Math.min(N - 1, Math.floor(t)); return Qs[i] + (Qs[i + 1] - Qs[i]) * (t - i); };
    return { A, yb, I, Ht, table, Qat, ct: Ht - yb, cb: yb, St: I / (Ht - yb), Sb: I / yb, r: Math.sqrt(I / A) };
  }

  const sigma = (P, y) => -st.M * 1e6 * (y - P.yb) / P.I; // + 인장
  const tau = (P, y) => { const b = widthAt(y); return b > 0 ? st.V * 1e3 * P.Qat(y) / (P.I * b) : 0; };

  /* ---------- 3D 응력 블록 (사투상) ---------- */
  function render3D(P) {
    const svg = $('sec-3d'); clearSvg(svg);
    const Ht = P.Ht, maxB = st.shape === 'circle' ? st.d.circle.D : Math.max(...parts().map(p => p.b));
    const s = Math.min(210 / Ht, 240 / maxB);
    const cx = 300, cy = 250, ang = Math.PI / 6, depth = 230;
    const proj = (x, y, z) => [cx + x * s + z * Math.cos(ang), cy - (y - P.yb) * s - z * Math.sin(ang)];
    const g = svgEl('g', {}, svg);
    const outline = [];
    if (st.shape === 'circle') {
      const r = st.d.circle.D / 2;
      for (let i = 0; i < 48; i++) { const a = i / 48 * 2 * Math.PI; outline.push([r * Math.cos(a), r + r * Math.sin(a)]); }
    } else if (st.shape === 'rect') {
      const { b, h } = st.d.rect; outline.push([-b / 2, 0], [b / 2, 0], [b / 2, h], [-b / 2, h]);
    } else {
      const ps = parts();
      if (st.shape === 'H') {
        const [bf, web, tfp] = ps;
        outline.push([-bf.b / 2, 0], [bf.b / 2, 0], [bf.b / 2, bf.h], [web.b / 2, bf.h], [web.b / 2, tfp.y0], [tfp.b / 2, tfp.y0], [tfp.b / 2, Ht], [-tfp.b / 2, Ht], [-tfp.b / 2, tfp.y0], [-web.b / 2, tfp.y0], [-web.b / 2, bf.h], [-bf.b / 2, bf.h]);
      } else {
        const [web, fl] = ps;
        outline.push([-web.b / 2, 0], [web.b / 2, 0], [web.b / 2, fl.y0], [fl.b / 2, fl.y0], [fl.b / 2, Ht], [-fl.b / 2, Ht], [-fl.b / 2, fl.y0], [-web.b / 2, fl.y0]);
      }
    }
    const pts = (z) => outline.map(([x, y]) => proj(x, y, z).join(',')).join(' ');
    // 보 몸체 (뒤쪽으로 뻗음)
    svgEl('polygon', { points: pts(depth), class: 's3-back' }, g);
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const nx = b[1] - a[1], ny = -(b[0] - a[0]); // 변의 법선 (명암 결정용)
      const quad = [proj(a[0], a[1], 0), proj(b[0], b[1], 0), proj(b[0], b[1], depth), proj(a[0], a[1], depth)];
      const shade = ny > 0.1 ? 's3-top' : nx > 0.1 ? 's3-side' : 's3-dim';
      svgEl('polygon', { points: quad.map(p => p.join(',')).join(' '), class: shade }, g);
    }
    svgEl('polygon', { points: pts(0), class: 's3-face' }, g);
    // 중립축
    const xL = -maxB / 2 - 30, xR = maxB / 2 + 30;
    const [n1x, n1y] = proj(xL, P.yb, 0), [n2x, n2y] = proj(xR, P.yb, 0), [n3x, n3y] = proj(xR, P.yb, depth);
    svgEl('polyline', { points: `${n1x},${n1y} ${n2x},${n2y} ${n3x},${n3y}`, style: 'fill:none;stroke:var(--accent);stroke-width:1.6;stroke-dasharray:6 4' }, g);
    svgText(g, n1x - 6, n1y + 4, '중립축', { 'text-anchor': 'end', 'font-size': 12, 'font-weight': 700, style: 'fill:var(--accent)' });

    // 응력 블록: 면에서 보 축 방향(z)으로. 인장은 면 바깥(−z), 압축은 면 안쪽(+z)
    const smax = Math.max(Math.abs(sigma(P, 0)), Math.abs(sigma(P, Ht)), 1e-9);
    const k = 110 / smax;
    const zOf = sg => -sg * k; // 인장(+) → −z (밖으로)
    const levels = 14;
    // 중심면 응력 쐐기: 중립축 위쪽 삼각형과 아래쪽 삼각형
    if (Math.abs(st.M) > 1e-9) {
      const yn = clamp(P.yb, 0, Ht);
      const wedge = (ya, yb2) => {
        const pts = [proj(0, ya, 0), proj(0, ya, zOf(sigma(P, ya))), proj(0, yb2, zOf(sigma(P, yb2))), proj(0, yb2, 0)];
        const cls = sigma(P, (ya + yb2) / 2) >= 0 ? 's3-tension' : 's3-comp';
        svgEl('polygon', { points: pts.map(p => p.join(',')).join(' '), class: cls }, g);
      };
      if (yn < Ht) wedge(yn, Ht);
      if (yn > 0) wedge(0, yn);
      // 상·하연 섬유 전체 폭에 걸친 응력 면
      [[Ht - 1e-6, Ht], [1e-6, 0]].forEach(([yw, y]) => {
        const b = widthAt(yw), z = zOf(sigma(P, y));
        const q = [proj(-b / 2, y, 0), proj(b / 2, y, 0), proj(b / 2, y, z), proj(-b / 2, y, z)];
        svgEl('polygon', { points: q.map(p => p.join(',')).join(' '), class: sigma(P, y) >= 0 ? 's3-tension' : 's3-comp', style: 'opacity:.55' }, g);
      });
    }
    // 화살표
    for (let i = 0; i <= levels; i++) {
      const y = Ht * i / levels, sg = sigma(P, y);
      if (Math.abs(sg) < smax * 0.06) continue;
      const [ax, ay] = proj(0, y, 0), [bx, by] = proj(0, y, zOf(sg));
      const color = sg > 0 ? 'var(--tension)' : 'var(--comp)';
      if (sg > 0) drawArrow(g, ax, ay, bx, by, { color, width: 1.8, head: 8 });
      else drawArrow(g, bx, by, ax, ay, { color, width: 1.8, head: 8 });
    }
    // 상하연 라벨
    const sT = sigma(P, Ht), sB = sigma(P, 0);
    const [tx, ty] = proj(0, Ht, zOf(sT)), [bx, by] = proj(0, 0, zOf(sB));
    svgText(g, tx - 8, ty - 10, `${fmtS(sT, 1)} MPa`, { 'text-anchor': 'end', class: 'val-label', style: `fill:${sT >= 0 ? 'var(--tension)' : 'var(--comp)'}` });
    svgText(g, bx - 8, by + 20, `${fmtS(sB, 1)} MPa`, { 'text-anchor': 'end', class: 'val-label', style: `fill:${sB >= 0 ? 'var(--tension)' : 'var(--comp)'}` });
    // 휨모멘트 표시 (보 축 방향 벡터 대신 곡선 화살표)
    const [mx, my] = proj(maxB / 2 + 120, P.yb, depth * 0.5);
    drawArcArrow(g, mx, my, 30, st.M < 0, { color: 'var(--violet)', width: 2.6 });
    svgText(g, mx, my + 52, `M = ${fmt(Math.abs(st.M))} kN·m`, { 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 13, style: 'fill:var(--violet)' });
    svgText(g, mx, my + 68, st.M >= 0 ? '정(+)모멘트: 위 압축 · 아래 인장' : '부(−)모멘트: 위 인장 · 아래 압축', { 'text-anchor': 'middle', 'font-size': 11.5, class: 'svg-muted' });
  }

  /* ---------- 단면 + σ + τ 분포 ---------- */
  let geom = null;
  function renderDist(P) {
    const svg = $('sec-dist'); clearSvg(svg);
    const g = svgEl('g', {}, svg);
    const Ht = P.Ht, top = 34;
    const maxB = st.shape === 'circle' ? st.d.circle.D : Math.max(...parts().map(p => p.b));
    const sy = Math.min(270 / Ht, 230 / maxB), scx = sy, Hpx = Ht * sy; // 가로·세로 같은 축척
    const Y = y => top + (Ht - y) * sy;
    const cx0 = 140;
    // 단면 그림
    if (st.shape === 'circle') {
      svgEl('circle', { cx: cx0, cy: Y(Ht / 2), r: Ht / 2 * sy, class: 'sec-fill' }, g);
    } else {
      parts().forEach(p => svgEl('rect', { x: cx0 - p.b / 2 * scx, y: Y(p.y0 + p.h), width: p.b * scx, height: p.h * sy, class: 'sec-fill' }, g));
    }
    svgEl('line', { x1: 20, y1: Y(P.yb), x2: 740, y2: Y(P.yb), style: 'stroke:var(--accent);stroke-width:1.4;stroke-dasharray:6 4' }, g);
    svgText(g, 22, Y(P.yb) - 6, `중립축 (ȳ = ${fmt(P.yb, 1)} mm)`, { 'font-size': 11.5, style: 'fill:var(--accent)', 'font-weight': 700 });
    svgText(g, cx0, 20, '단면', { 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 13 });

    // σ
    const sx0 = 420, smax = Math.max(Math.abs(sigma(P, 0)), Math.abs(sigma(P, Ht)), 1e-9), ssc = 95 / smax;
    svgText(g, sx0, 20, '휨응력 σ = M·y / I', { 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 13 });
    svgEl('line', { x1: sx0, y1: Y(Ht) - 6, x2: sx0, y2: Y(0) + 6, class: 'axis-strong' }, g);
    const sT = sigma(P, Ht), sB = sigma(P, 0);
    const yn = clamp(P.yb, 0, Ht);
    const triT = `${sx0},${Y(Ht)} ${sx0 + sT * ssc},${Y(Ht)} ${sx0},${Y(yn)}`;
    const triB = `${sx0},${Y(0)} ${sx0 + sB * ssc},${Y(0)} ${sx0},${Y(yn)}`;
    svgEl('polygon', { points: triT, style: `fill:${sT >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)'};stroke:${sT >= 0 ? 'var(--tension)' : 'var(--comp)'};stroke-width:2` }, g);
    svgEl('polygon', { points: triB, style: `fill:${sB >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)'};stroke:${sB >= 0 ? 'var(--tension)' : 'var(--comp)'};stroke-width:2` }, g);
    svgText(g, sx0 + sT * ssc + (sT >= 0 ? 6 : -6), Y(Ht) + 4, `${fmtS(sT, 1)}`, { 'text-anchor': sT >= 0 ? 'start' : 'end', class: 'val-label', style: `fill:${sT >= 0 ? 'var(--tension)' : 'var(--comp)'}` });
    svgText(g, sx0 + sB * ssc + (sB >= 0 ? 6 : -6), Y(0) + 4, `${fmtS(sB, 1)}`, { 'text-anchor': sB >= 0 ? 'start' : 'end', class: 'val-label', style: `fill:${sB >= 0 ? 'var(--tension)' : 'var(--comp)'}` });
    svgText(g, sx0 - 100, Y(0) + 26, '← 압축(−)', { 'font-size': 11, style: 'fill:var(--comp)' });
    svgText(g, sx0 + 100, Y(0) + 26, '인장(+) →', { 'font-size': 11, style: 'fill:var(--tension)', 'text-anchor': 'end' });

    // τ
    const tx0 = 600;
    const N = 240, tv = [];
    let tmax = 1e-9, ytmax = P.yb;
    for (let i = 0; i <= N; i++) {
      const y = Ht * i / N, t = tau(P, Math.min(Ht - 1e-6, Math.max(1e-6, y)));
      tv.push([y, t]); if (t > tmax) { tmax = t; ytmax = y; }
    }
    const tsc = 105 / tmax;
    svgText(g, tx0 + 50, 20, '전단응력 τ = V·Q / (I·b)', { 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 13 });
    svgEl('line', { x1: tx0, y1: Y(Ht) - 6, x2: tx0, y2: Y(0) + 6, class: 'axis-strong' }, g);
    svgEl('polygon', { points: `${tx0},${Y(0)} ` + tv.map(([y, t]) => `${tx0 + t * tsc},${Y(y)}`).join(' ') + ` ${tx0},${Y(Ht)}`, style: 'fill:color-mix(in srgb, var(--violet) 18%, transparent);stroke:var(--violet);stroke-width:2;stroke-linejoin:round' }, g);
    if (st.V > 0) svgText(g, tx0 + tmax * tsc, Y(ytmax) - 10, `τmax ${fmt(tmax, 2)}`, { 'text-anchor': 'end', class: 'val-label', style: 'fill:var(--violet)' });
    svgText(g, tx0, Y(0) + 26, '단위: MPa', { 'font-size': 11, class: 'svg-muted' });
    svgEl('g', { class: 'cursor-layer' }, svg);
    geom = { Y, Ht, top, Hpx, sx0, ssc, tx0, tsc };
  }

  function drawHover(P) {
    const layer = $('sec-dist').querySelector('.cursor-layer');
    if (!layer) return;
    clearSvg(layer);
    const out = $('sec-hover');
    if (st.hoverY === null) { out.innerHTML = '<span class="muted">단면 그림 위에 마우스를 올리면 그 높이의 σ, τ, Q, b 값이 나옵니다.</span>'; return; }
    const y = st.hoverY, { Y, sx0, ssc, tx0, tsc } = geom;
    const sg = sigma(P, y), t = tau(P, y), b = widthAt(y), Q = P.Qat(y);
    svgEl('line', { x1: 20, y1: Y(y), x2: 740, y2: Y(y), class: 'cursor-line' }, layer);
    svgEl('circle', { cx: sx0 + sg * ssc, cy: Y(y), r: 5, style: `fill:${sg >= 0 ? 'var(--tension)' : 'var(--comp)'}` }, layer);
    svgEl('circle', { cx: tx0 + t * tsc, cy: Y(y), r: 5, style: 'fill:var(--violet)' }, layer);
    out.innerHTML = `<span>y = <b>${fmt(y, 1)}</b> mm (중립축에서 ${fmtS(y - P.yb, 1)})</span><span>b = <b>${fmt(b, 1)}</b> mm</span><span>Q = <b>${fmt(Q / 1e3, 1)}</b>×10³ mm³</span><span>σ = <b style="color:${sg >= 0 ? 'var(--tension)' : 'var(--comp)'}">${fmtS(sg, 2)}</b> MPa</span><span>τ = <b style="color:var(--violet)">${fmt(t, 3)}</b> MPa</span>`;
  }

  function renderInfo(P) {
    const e = n => n >= 1e6 ? `${fmt(n / 1e6, 2)}×10⁶` : n >= 1e3 ? `${fmt(n / 1e3, 2)}×10³` : fmt(n, 1);
    $('sec-props').innerHTML = `
      <div class="kv"><span>단면적 A</span><b>${e(P.A)} mm²</b></div>
      <div class="kv"><span>도심 ȳ (아래에서)</span><b>${fmt(P.yb, 1)} mm</b></div>
      <div class="kv"><span>단면2차모멘트 I</span><b>${e(P.I)} mm⁴</b></div>
      <div class="kv"><span>단면계수 S<sub>상</sub> = I/c<sub>상</sub></span><b>${e(P.St)} mm³</b></div>
      <div class="kv"><span>단면계수 S<sub>하</sub> = I/c<sub>하</sub></span><b>${e(P.Sb)} mm³</b></div>
      <div class="kv"><span>회전반경 r = √(I/A)</span><b>${fmt(P.r, 1)} mm</b></div>`;
    let h = '';
    if (P.table) {
      h += `<p>여러 직사각형으로 나누고 <b>도심</b> ȳ = ΣA·y / ΣA를 구한 뒤, 각 조각의 I를 <b>평행축 정리</b> I = I₀ + A·d²로 옮겨 더합니다.</p>`;
      h += `<div class="tbl-wrap"><table class="tbl num"><tr><th>조각</th><th>b×h (mm)</th><th>A (mm²)</th><th>y (mm)</th><th>A·y</th><th>I₀ = bh³/12</th><th>d = y − ȳ</th><th>A·d²</th></tr>`;
      P.table.forEach(r => { h += `<tr><td>${r.name}</td><td>${fmt(r.b)}×${fmt(r.h)}</td><td>${e(r.A)}</td><td>${fmt(r.y, 1)}</td><td>${e(r.Ay)}</td><td>${e(r.I0)}</td><td>${fmtS(r.d, 1)}</td><td>${e(r.Ad2)}</td></tr>`; });
      const sA = P.table.reduce((s, r) => s + r.A, 0), sAy = P.table.reduce((s, r) => s + r.Ay, 0);
      h += `<tr class="sum"><td>합계</td><td></td><td>${e(sA)}</td><td></td><td>${e(sAy)}</td><td>${e(P.table.reduce((s, r) => s + r.I0, 0))}</td><td></td><td>${e(P.table.reduce((s, r) => s + r.Ad2, 0))}</td></tr></table></div>`;
      h += `<div class="eq">ȳ = ${e(sAy)} / ${e(sA)} = <span class="ans">${fmt(P.yb, 1)} mm</span> &nbsp;·&nbsp; I = ΣI₀ + ΣA·d² = <span class="ans">${e(P.I)} mm⁴</span></div>`;
      if (P.table.length > 1) h += `<p class="hint">A·d² 항이 I₀보다 훨씬 큰 것을 보세요. 재료를 중립축에서 <b>멀리</b> 둘수록 I가 커지므로, H형강은 플랜지에 재료를 모아 효율을 높입니다.</p>`;
    } else {
      h += `<div class="eq">원형: A = πD²/4 = ${e(P.A)} mm², I = πD⁴/64 = <span class="ans">${e(P.I)} mm⁴</span></div>`;
    }
    $('sec-table').innerHTML = h;

    const sT = sigma(P, P.Ht), sB = sigma(P, 0);
    const Qna = P.Qat(clamp(P.yb, 0, P.Ht)), bna = widthAt(clamp(P.yb, 1e-6, P.Ht - 1e-6));
    const tna = bna > 0 ? st.V * 1e3 * Qna / (P.I * bna) : 0;
    let s = `<div class="step"><h4><span class="step-dot">1</span>휨응력 — 중립축에서 멀수록 크다</h4>
      <p>휨모멘트를 받으면 단면은 평면을 유지한 채 회전하므로 변형률이 중립축으로부터의 거리 y에 <b>비례</b>합니다. 따라서 응력도 직선 분포이고, 맨 위·맨 아래 섬유에서 최대입니다.</p>
      <div class="eq">σ<sub>상</sub> = −M·c<sub>상</sub>/I = −${fmt(st.M)}×10⁶ × ${fmt(P.ct, 1)} / ${e(P.I)} = <span class="ans">${fmtS(sT, 2)} MPa</span></div>
      <div class="eq">σ<sub>하</sub> = +M·c<sub>하</sub>/I = ${fmt(st.M)}×10⁶ × ${fmt(P.cb, 1)} / ${e(P.I)} = <span class="ans">${fmtS(sB, 2)} MPa</span></div>
      <p class="hint">같은 식을 σ = M / S로 쓰기도 합니다. 강재(SS275)의 항복강도 F<sub>y</sub> = 275 MPa과 비교해 보세요: 최대 |σ| = ${fmt(Math.max(Math.abs(sT), Math.abs(sB)), 1)} MPa → ${Math.max(Math.abs(sT), Math.abs(sB)) <= 275 ? '<b class="ok">탄성 범위</b>' : '<b class="bad">항복 초과</b>'}</p></div>`;
    s += `<div class="step"><h4><span class="step-dot">2</span>전단응력 — 중립축에서 가장 크다</h4>
      <p>Q는 "구하려는 높이보다 바깥쪽 부분의 단면1차모멘트"입니다. 바깥 끝에서는 Q = 0이고 중립축에서 최대이므로 전단응력은 <b>중립축에서 최대, 위아래 끝에서 0</b>이 됩니다. 폭 b가 갑자기 좁아지는 곳(플랜지→웨브)에서는 τ가 <b>계단처럼 커집니다</b>.</p>
      <div class="eq">τ<sub>max</sub> = V·Q<sub>NA</sub>/(I·b) = ${fmt(st.V)}×10³ × ${e(Qna)} / (${e(P.I)} × ${fmt(bna, 1)}) = <span class="ans">${fmt(tna, 2)} MPa</span></div>`;
    if (st.shape === 'rect') s += `<p class="hint">직사각형은 τ<sub>max</sub> = 1.5·V/A = ${fmt(1.5 * st.V * 1e3 / P.A, 2)} MPa 로 평균값의 1.5배입니다.</p>`;
    if (st.shape === 'circle') s += `<p class="hint">원형은 τ<sub>max</sub> = (4/3)·V/A = ${fmt(4 / 3 * st.V * 1e3 / P.A, 2)} MPa 입니다.</p>`;
    if (st.shape === 'H') { const p = parts()[1]; s += `<p class="hint">H형강 실무 근사: τ ≈ V / (웨브 면적 H·t<sub>w</sub>) = ${fmt(st.V * 1e3 / (height() * p.b), 2)} MPa. 전단력은 대부분 웨브가 받습니다.</p>`; }
    s += `</div>`;
    $('sec-steps').innerHTML = s;
  }

  function renderControls() {
    document.querySelectorAll('#sec-shape button').forEach(b => b.classList.toggle('active', b.dataset.v === st.shape));
    const box = $('sec-dims');
    box.innerHTML = SHAPES[st.shape].dims.map(([k, lab, , mn, mx]) => `
      <label class="field"><span>${lab} <output>${fmt(st.d[st.shape][k])} mm</output></span>
      <input type="range" id="sec-dim-${k}" data-k="${k}" min="${mn}" max="${mx}" step="${mx > 300 ? 10 : 1}" value="${st.d[st.shape][k]}"></label>`).join('');
  }

  function update() {
    const P = props();
    $('sec-M-out').textContent = `${fmt(st.M)} kN·m`;
    $('sec-V-out').textContent = `${fmt(st.V)} kN`;
    render3D(P);
    renderDist(P);
    renderInfo(P);
    drawHover(P);
  }

  function init() {
    document.querySelectorAll('#sec-shape button').forEach(b => b.addEventListener('click', () => { st.shape = b.dataset.v; st.hoverY = null; renderControls(); update(); }));
    $('sec-dims').addEventListener('input', e => {
      const k = e.target.dataset.k; if (!k) return;
      st.d[st.shape][k] = +e.target.value;
      e.target.parentElement.querySelector('output').textContent = `${fmt(+e.target.value)} mm`;
      update();
    });
    $('sec-M').addEventListener('input', e => { st.M = +e.target.value; update(); });
    $('sec-V').addEventListener('input', e => { st.V = +e.target.value; update(); });
    const svg = $('sec-dist');
    svg.addEventListener('pointermove', e => {
      if (!geom) return;
      const p = svgPoint(svg, e);
      const y = geom.Ht - (p.y - geom.top) / (geom.Hpx / geom.Ht);
      st.hoverY = (y >= 0 && y <= geom.Ht) ? y : null;
      drawHover(props());
    });
    svg.addEventListener('pointerleave', () => { st.hoverY = null; drawHover(props()); });
    $('sec-M').value = st.M; $('sec-V').value = st.V;
    renderControls();
    update();
  }
  return { init };
})();
