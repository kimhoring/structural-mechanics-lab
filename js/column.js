'use strict';
/* 기둥 좌굴: 오일러 하중 Pcr = π²EI/(KL)², 초기 처짐 증폭 δ = δ₀/(1 − P/Pcr), 설계 곡선(KDS/AISC) 비교 */

const Column = (() => {
  const $ = id => document.getElementById(id);
  const E = 205000, FY = 275; // MPa (SS275)
  const ENDS = {
    pp: { name: '양단 핀', K: 1.0, note: '가장 기본. 전체 길이가 한 개의 반파장(sin 곡선)으로 휩니다.' },
    fp: { name: '고정 – 핀', K: 0.7, note: '아래가 고정되어 휨이 위쪽으로 치우칩니다. 이론값 0.699 ≈ 0.7.' },
    ff: { name: '양단 고정', K: 0.5, note: '양끝을 꽉 잡아 변곡점이 L/4, 3L/4에 생깁니다. 그 사이 L/2가 실제로 휘는 길이입니다.' },
    fr: { name: '고정 – 자유', K: 2.0, note: '깃대·캔틸레버 기둥. 거울에 비춘 것처럼 2L 길이의 양단 핀 기둥과 같습니다.' },
  };
  const SECS = [
    { name: 'H-200×200×8×12', A: 6353, I: 16.0e6 },
    { name: 'H-250×250×9×14', A: 9218, I: 36.5e6 },
    { name: 'H-300×300×10×15', A: 11980, I: 67.5e6 },
    { name: '□-200×200×9 (각형강관)', A: 6667, I: 40.2e6 },
    { name: 'φ216.3×8 (원형강관)', A: 5235, I: 28.4e6 },
  ];
  const st = { end: 'pp', L: 6, sec: 0, pct: 60, playing: false };

  function shape(end, s) { // s: 0(아래)~1(위) → 정규화 횡변위
    if (end === 'pp') return Math.sin(Math.PI * s);
    if (end === 'ff') return (1 - Math.cos(2 * Math.PI * s)) / 2;
    if (end === 'fr') return 1 - Math.cos(Math.PI * s / 2);
    const b = 4.4934, u = b * s;
    return (Math.sin(u) - b * Math.cos(u) - u + b) / 6.2832; // 최대값 1 로 정규화 (변곡점 s ≈ 0.30)
  }

  function calc() {
    const sec = SECS[st.sec], K = ENDS[st.end].K;
    const KL = K * st.L * 1000, r = Math.sqrt(sec.I / sec.A), lam = KL / r;
    const Pcr = Math.PI ** 2 * E * sec.I / KL ** 2 / 1000; // kN
    const Fe = Math.PI ** 2 * E / lam ** 2;
    const Fcr = lam <= 4.71 * Math.sqrt(E / FY) ? Math.pow(0.658, FY / Fe) * FY : 0.877 * Fe;
    return { sec, K, KL, r, lam, Pcr, Fe, Fcr, Pn: Fcr * sec.A / 1000, Py: FY * sec.A / 1000 };
  }

  function drawSupport(g, x, y, type, top) {
    const dir = top ? -1 : 1;
    if (type === 'fixed') {
      svgEl('rect', { x: x - 34, y: top ? y - 16 : y, width: 68, height: 16, style: 'fill:var(--ground-fill);stroke:var(--ground);stroke-width:1.5' }, g);
      for (let i = -30; i <= 30; i += 8) svgEl('line', { x1: x + i, y1: y + dir * 16, x2: x + i - 6, y2: y + dir * 24, class: 'ground', 'stroke-width': 1.2 }, g);
    } else if (type === 'pin') {
      svgEl('polygon', { points: `${x},${y} ${x - 14},${y + dir * 22} ${x + 14},${y + dir * 22}`, class: 'sup-fill' }, g);
      if (top) { // 수직 이동 가능한 안내(롤러)
        svgEl('line', { x1: x - 22, y1: y - 22, x2: x + 22, y2: y - 22, class: 'ground', 'stroke-width': 2 }, g);
        svgText(g, x + 30, y - 18, '수직 이동 가능', { 'font-size': 10.5, class: 'svg-muted' });
      } else drawHatch(g, x - 22, y + 22, x + 22);
    }
  }

  function render() {
    const c = calc(), end = ENDS[st.end];
    const P = st.pct / 100 * c.Pcr;
    const svg = $('col-svg'); clearSvg(svg);
    const g = svgEl('g', {}, svg);
    const cx = 230, base = 440, Lpx = st.end === 'fr' ? 175 : 330, topY = base - Lpx;
    const ratio = st.pct / 100;
    const buckled = ratio >= 1;
    const a0 = 5;
    const amp = buckled ? 120 : Math.min(120, a0 / (1 - ratio));
    // 유효 길이 표시
    let k0 = 0, k1 = 1;
    if (st.end === 'ff') { k0 = 0.25; k1 = 0.75; }
    if (st.end === 'fp') { k0 = 0.3; k1 = 1; }
    if (st.end === 'fr') {
      // 거울상 (점선)
      const ghost = [];
      for (let i = 0; i <= 40; i++) { const s = i / 40; ghost.push(`${cx + amp * (1 - Math.cos(Math.PI * (1 - s) / 2))},${topY - s * Lpx}`); }
      svgEl('polyline', { points: ghost.join(' '), style: 'fill:none;stroke:var(--muted);stroke-width:6;stroke-dasharray:6 6;opacity:.45;stroke-linecap:round' }, g);
      svgText(g, cx + 20, topY - Lpx + 10, '거울상', { 'font-size': 11, class: 'svg-muted' });
    }
    const bx = 470, yA = base - (st.end === 'fr' ? 0 : k0 * Lpx), yB = st.end === 'fr' ? base - 2 * Lpx : base - k1 * Lpx;
    svgEl('line', { x1: bx, y1: yA, x2: bx, y2: yB, style: 'stroke:var(--accent);stroke-width:2' }, g);
    [yA, yB].forEach(y => svgEl('line', { x1: bx - 7, y1: y, x2: bx + 7, y2: y, style: 'stroke:var(--accent);stroke-width:2' }, g));
    svgText(g, bx + 12, (yA + yB) / 2 + 5, `KL = ${fmt(end.K, 1)} × ${fmt(st.L, 1)} = ${fmt(end.K * st.L, 2)} m`, { 'font-size': 13, 'font-weight': 700, style: 'fill:var(--accent)' });
    if (st.end === 'ff' || st.end === 'fp') {
      [k0, k1].filter(k => k > 0 && k < 1).forEach(k => {
        const y = base - k * Lpx, x = cx + amp * shape(st.end, k);
        svgEl('circle', { cx: x, cy: y, r: 5, style: 'fill:var(--accent)' }, g);
        svgEl('line', { x1: x + 8, y1: y, x2: bx - 10, y2: y, style: 'stroke:var(--accent);stroke-width:1;stroke-dasharray:3 4' }, g);
      });
      svgText(g, cx - 120, base - k0 * Lpx + 4, '변곡점', { 'font-size': 11, style: 'fill:var(--accent)' });
    }
    // 원래 위치
    svgEl('line', { x1: cx, y1: base, x2: cx, y2: topY, style: 'stroke:var(--zero);stroke-width:2;stroke-dasharray:5 5' }, g);
    // 기둥
    const pts = [];
    for (let i = 0; i <= 60; i++) { const s = i / 60; pts.push(`${(cx + amp * shape(st.end, s)).toFixed(1)},${(base - s * Lpx).toFixed(1)}`); }
    const heat = Math.min(1, ratio);
    const colStroke = buckled ? 'var(--comp)' : `color-mix(in srgb, var(--comp) ${Math.round(heat * heat * 100)}%, var(--beam))`;
    svgEl('polyline', { points: pts.join(' '), style: `fill:none;stroke:${colStroke};stroke-width:16;stroke-linecap:butt;stroke-linejoin:round` }, g);
    // 지점
    const topX = cx + amp * shape(st.end, 1);
    drawSupport(g, cx, base, st.end === 'pp' ? 'pin' : 'fixed', false);
    if (st.end === 'pp' || st.end === 'fp') drawSupport(g, topX, topY, 'pin', true);
    if (st.end === 'ff') drawSupport(g, topX, topY, 'fixed', true);
    // 하중
    const ay = topY - (st.end === 'fr' ? 6 : 30);
    drawArrow(g, topX, ay - 70, topX, ay, { color: 'var(--load)', width: 4, head: 15 });
    svgText(g, topX + 12, ay - 52, `P = ${fmt(P, 0)} kN`, { 'text-anchor': 'start', 'font-weight': 700, 'font-size': 14, style: 'fill:var(--load)', class: 'val-label' });
    // 상태 배지
    const badge = buckled ? ['좌굴 발생', 'var(--comp)'] : ratio > 0.85 ? ['임계 하중에 근접', 'var(--load)'] : ['안정', 'var(--react)'];
    svgEl('rect', { x: 20, y: 20, width: 150, height: 30, rx: 15, style: `fill:color-mix(in srgb, ${badge[1]} 16%, transparent)` }, g);
    svgText(g, 95, 40, badge[0], { 'text-anchor': 'middle', 'font-weight': 800, 'font-size': 14, style: `fill:${badge[1]}` });
    svgText(g, 20, 72, `P / Pcr = ${fmt(ratio * 100, 0)}%`, { 'font-size': 13, 'font-weight': 700 });
    svgText(g, 20, 92, buckled ? '횡변위가 한없이 커짐' : `횡변위 증폭 1/(1−P/Pcr) = ${fmt(1 / (1 - ratio), 2)}배`, { 'font-size': 12, class: 'svg-muted' });

    // 결과
    $('col-P-out').textContent = `${fmt(st.pct)}% (${fmt(P, 0)} kN)`;
    $('col-L-out').textContent = `${fmt(st.L, 1)} m`;
    document.querySelectorAll('#col-end button').forEach(b => b.classList.toggle('active', b.dataset.v === st.end));
    $('col-end-note').textContent = end.note;
    $('col-results').innerHTML = `
      <div class="kv"><span>유효좌굴길이 KL</span><b>${fmt(c.KL / 1000, 2)} m</b></div>
      <div class="kv"><span>회전반경 r = √(I/A)</span><b>${fmt(c.r, 1)} mm</b></div>
      <div class="kv"><span>세장비 λ = KL / r</span><b>${fmt(c.lam, 1)}</b></div>
      <div class="kv hl"><span>오일러 좌굴하중 P<sub>cr</sub></span><b>${fmt(c.Pcr, 0)} kN</b></div>
      <div class="kv"><span>좌굴응력 σ<sub>cr</sub> = P<sub>cr</sub>/A</span><b>${fmt(c.Fe, 1)} MPa</b></div>
      <div class="kv"><span>설계 공칭강도 P<sub>n</sub> (KDS)</span><b>${fmt(c.Pn, 0)} kN</b></div>`;
    const elastic = c.lam > 4.71 * Math.sqrt(E / FY);
    $('col-steps').innerHTML = `
      <div class="step"><h4><span class="step-dot">1</span>오일러 좌굴하중</h4>
        <p>곧은 기둥에 축하중 P를 늘려 가면, 어느 순간 <b>옆으로 휜 모양도 평형을 이룰 수 있는</b> 하중에 도달합니다. 이 하중이 좌굴하중입니다. 미분방정식 EI·y″ + P·y = 0의 해에서 얻어집니다.</p>
        <div class="eq">P<sub>cr</sub> = π²EI / (KL)² = π² × 205,000 × ${fmt(c.sec.I / 1e6, 1)}×10⁶ / (${fmt(c.KL, 0)})² = <span class="ans">${fmt(c.Pcr, 0)} kN</span></div>
        <p class="hint">약축(I가 작은 축)으로 먼저 좌굴하므로 I는 약축 값을 씁니다. 길이가 2배가 되면 P<sub>cr</sub>는 1/4로 줄어듭니다.</p></div>
      <div class="step"><h4><span class="step-dot">2</span>세장비와 적용 범위</h4>
        <div class="eq">λ = KL / r = ${fmt(c.KL, 0)} / ${fmt(c.r, 1)} = <span class="ans">${fmt(c.lam, 1)}</span> &nbsp;·&nbsp; 경계 4.71√(E/F<sub>y</sub>) = ${fmt(4.71 * Math.sqrt(E / FY), 1)}</div>
        <p>${elastic ? '세장비가 커서 <b>탄성 좌굴</b> 영역입니다. 오일러 공식이 그대로 잘 맞습니다.' : '세장비가 작아 <b>비탄성 좌굴</b> 영역입니다. 좌굴 전에 재료가 항복하기 시작하므로 오일러 공식은 강도를 과대평가합니다. 설계에서는 아래 그래프의 설계 곡선을 씁니다.'}</p></div>
      <div class="step"><h4><span class="step-dot">3</span>초기 처짐의 증폭</h4>
        <p>실제 기둥은 완벽하게 곧지 않습니다. 초기 처짐 δ₀가 있으면 하중이 P일 때 처짐은 <b>δ = δ₀ / (1 − P/P<sub>cr</sub>)</b>로 커지고, P가 P<sub>cr</sub>에 가까워질수록 무한대로 발산합니다. 슬라이더를 움직여 확인해 보세요.</p></div>`;
    renderCurve(c);
  }

  function renderCurve(c) {
    const svg = $('col-curve'); clearSvg(svg);
    const g = svgEl('g', {}, svg);
    const x0 = 60, x1 = 730, y0 = 250, y1 = 20, lmax = 250, smax = 350;
    const X = l => x0 + l / lmax * (x1 - x0), Y = s => y0 - Math.min(s, smax) / smax * (y0 - y1);
    for (let l = 0; l <= lmax; l += 50) { svgEl('line', { x1: X(l), y1: y0, x2: X(l), y2: y1, class: 'axis' }, g); svgText(g, X(l), y0 + 18, String(l), { 'text-anchor': 'middle', class: 'svg-muted', 'font-size': 11 }); }
    for (let s = 0; s <= smax; s += 100) { svgEl('line', { x1: x0, y1: Y(s), x2: x1, y2: Y(s), class: 'axis' }, g); svgText(g, x0 - 8, Y(s) + 4, String(s), { 'text-anchor': 'end', class: 'svg-muted', 'font-size': 11 }); }
    svgText(g, x1, y0 + 36, '세장비 λ = KL/r', { 'text-anchor': 'end', class: 'svg-muted', 'font-size': 12 });
    svgText(g, x0, 12, '응력 (MPa)', { class: 'svg-muted', 'font-size': 12 });
    svgEl('line', { x1: x0, y1: Y(FY), x2: x1, y2: Y(FY), style: 'stroke:var(--muted);stroke-width:1.5;stroke-dasharray:6 4' }, g);
    svgText(g, x1, Y(FY) - 6, `항복강도 Fy = ${FY}`, { 'text-anchor': 'end', class: 'svg-muted', 'font-size': 11 });
    const eul = [], des = [];
    for (let l = 8; l <= lmax; l += 2) {
      const Fe = Math.PI ** 2 * E / l ** 2;
      if (Fe <= smax) eul.push(`${X(l)},${Y(Fe)}`);
      const Fcr = l <= 4.71 * Math.sqrt(E / FY) ? Math.pow(0.658, FY / Fe) * FY : 0.877 * Fe;
      des.push(`${X(l)},${Y(Fcr)}`);
    }
    svgEl('polyline', { points: eul.join(' '), style: 'fill:none;stroke:var(--comp);stroke-width:2.5' }, g);
    svgEl('polyline', { points: des.join(' '), style: 'fill:none;stroke:var(--accent);stroke-width:2.5' }, g);
    svgText(g, X(128), Y(235), '오일러 곡선 π²E/λ²', { style: 'fill:var(--comp)', 'font-size': 12, 'font-weight': 700 });
    svgText(g, X(30), Y(250), '설계 곡선 (KDS·AISC)', { style: 'fill:var(--accent)', 'font-size': 12, 'font-weight': 700 });
    const lam = Math.min(c.lam, lmax);
    svgEl('line', { x1: X(lam), y1: y0, x2: X(lam), y2: Y(c.Fe), style: 'stroke:var(--text);stroke-width:1;stroke-dasharray:3 3' }, g);
    svgEl('circle', { cx: X(lam), cy: Y(c.Fe), r: 6, style: 'fill:var(--comp);stroke:var(--surface);stroke-width:2' }, g);
    svgEl('circle', { cx: X(lam), cy: Y(c.Fcr), r: 6, style: 'fill:var(--accent);stroke:var(--surface);stroke-width:2' }, g);
    svgText(g, X(lam) - 10, Y(Math.max(c.Fe, c.Fcr)) - 12, `현재 λ = ${fmt(c.lam, 0)}`, { 'text-anchor': 'end', 'font-weight': 700, 'font-size': 12, class: 'val-label' });
  }

  function renderModes() {
    const svg = $('col-modes'); clearSvg(svg);
    const keys = ['pp', 'fp', 'ff', 'fr'];
    keys.forEach((k, i) => {
      const g = svgEl('g', { class: 'mode-thumb' + (k === st.end ? ' sel' : ''), 'data-end': k }, svg);
      const cx = 95 + i * 190, base = 180, H = k === 'fr' ? 70 : 130;
      svgEl('rect', { x: cx - 88, y: 4, width: 176, height: 232, rx: 12, class: 'thumb-bg' }, g);
      const path = (amp) => { const p = []; for (let j = 0; j <= 30; j++) { const s = j / 30; p.push(`${j ? 'L' : 'M'}${(cx - 20 + amp * shape(k, s)).toFixed(1)},${(base - s * H).toFixed(1)}`); } return p.join(' '); };
      const pth = svgEl('path', { d: path(0), style: 'fill:none;stroke:var(--beam);stroke-width:7;stroke-linecap:round' }, g);
      svgEl('animate', { attributeName: 'd', values: `${path(2)};${path(30)};${path(2)}`, dur: '2.6s', repeatCount: 'indefinite' }, pth);
      svgEl('line', { x1: cx - 20, y1: base, x2: cx - 20, y2: base - H, style: 'stroke:var(--zero);stroke-width:1.5;stroke-dasharray:4 4' }, g);
      svgText(g, cx, 28, ENDS[k].name, { 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 13 });
      svgText(g, cx, 206, `K = ${ENDS[k].K}`, { 'text-anchor': 'middle', 'font-weight': 800, 'font-size': 15, style: 'fill:var(--accent)' });
      svgText(g, cx, 226, `Pcr 비 = ${fmt(1 / ENDS[k].K ** 2, 2)}배`, { 'text-anchor': 'middle', 'font-size': 11.5, class: 'svg-muted' });
    });
  }

  function play() {
    if (st.playing) return;
    st.playing = true;
    const t0 = performance.now();
    const btn = $('col-play'); btn.disabled = true;
    const step = now => {
      const t = Math.min(1, (now - t0) / 5000);
      st.pct = Math.round(105 * t);
      $('col-P').value = st.pct;
      render();
      if (t < 1 && document.getElementById('page-column').classList.contains('active')) requestAnimationFrame(step);
      else { st.playing = false; btn.disabled = false; }
    };
    requestAnimationFrame(step);
  }

  function init() {
    const sel = $('col-sec');
    SECS.forEach((s, i) => sel.insertAdjacentHTML('beforeend', `<option value="${i}">${s.name} — I(약축) = ${fmt(s.I / 1e6, 1)}×10⁶ mm⁴</option>`));
    document.querySelectorAll('#col-end button').forEach(b => b.addEventListener('click', () => { st.end = b.dataset.v; render(); renderModes(); }));
    $('col-L').addEventListener('input', e => { st.L = +e.target.value; render(); });
    $('col-P').addEventListener('input', e => { st.pct = +e.target.value; render(); });
    sel.addEventListener('change', e => { st.sec = +e.target.value; render(); });
    $('col-play').addEventListener('click', play);
    $('col-modes').addEventListener('click', e => { const t = e.target.closest('[data-end]'); if (t) { st.end = t.dataset.end; render(); renderModes(); } });
    $('col-L').value = st.L; $('col-P').value = st.pct;
    render(); renderModes();
  }
  return { init };
})();
