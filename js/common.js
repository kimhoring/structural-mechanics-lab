'use strict';
/* 공용 유틸: SVG 그리기, 선형방정식 풀이, 숫자 포맷 */

const SVGNS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

function svgText(parent, x, y, str, attrs) {
  const t = svgEl('text', Object.assign({ x, y }, attrs || {}), parent);
  t.textContent = str;
  return t;
}

function clearSvg(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

/* 화살촉: (tx,ty)가 끝점, (dx,dy)는 진행 방향 */
function arrowHead(parent, tx, ty, dx, dy, size, color) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const bx = tx - ux * size, by = ty - uy * size;
  return svgEl('polygon', {
    points: `${tx},${ty} ${bx + nx * size * 0.5},${by + ny * size * 0.5} ${bx - nx * size * 0.5},${by - ny * size * 0.5}`,
    style: `fill:${color}`
  }, parent);
}

/* 직선 화살표: (x1,y1) → (x2,y2) */
function drawArrow(parent, x1, y1, x2, y2, o = {}) {
  const color = o.color || 'var(--text)', w = o.width || 2.2, h = o.head || 11;
  const g = svgEl('g', { class: o.cls }, parent);
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  svgEl('line', {
    x1, y1, x2: x2 - ux * h * 0.75, y2: y2 - uy * h * 0.75,
    style: `stroke:${color};stroke-width:${w}px;stroke-linecap:round` + (o.dash ? `;stroke-dasharray:${o.dash}` : '')
  }, g);
  arrowHead(g, x2, y2, ux, uy, h, color);
  return g;
}

/* 원호 화살표 (모멘트 표시). clockwise=true 면 화면상 시계방향. 아래쪽이 트인 270° 호 */
function drawArcArrow(parent, cx, cy, r, clockwise, o = {}) {
  const color = o.color || 'var(--text)', w = o.width || 2.2, h = o.head || 10;
  const g = svgEl('g', { class: o.cls }, parent);
  const D = Math.PI / 180;
  const sgn = clockwise ? 1 : -1;
  const a0 = clockwise ? 135 * D : 45 * D;
  const a1 = clockwise ? 405 * D : -225 * D;
  const p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const aEnd = a1 - sgn * (h * 0.7 / r);
  const [sx, sy] = p(a0), [ex, ey] = p(aEnd), [tx, ty] = p(a1);
  svgEl('path', {
    d: `M ${sx} ${sy} A ${r} ${r} 0 1 ${clockwise ? 1 : 0} ${ex} ${ey}`,
    style: `fill:none;stroke:${color};stroke-width:${w}px;stroke-linecap:round`
  }, g);
  arrowHead(g, tx, ty, sgn * -Math.sin(a1), sgn * Math.cos(a1), h, color);
  return g;
}

/* 지면 빗금 */
function drawHatch(parent, x1, y, x2, down = true, cls = 'ground') {
  const g = svgEl('g', {}, parent);
  svgEl('line', { x1, y1: y, x2, y2: y, class: cls, 'stroke-width': 2 }, g);
  for (let x = x1 + 4; x <= x2; x += 8) {
    svgEl('line', { x1: x, y1: y, x2: x - 7, y2: y + (down ? 8 : -8), class: cls, 'stroke-width': 1.3 }, g);
  }
  return g;
}

/* 가우스 소거 (부분 피벗). A: 2차원 배열, b: 배열. 특이행렬이면 null */
function solveLinear(Ain, bin) {
  const n = bin.length;
  const A = Ain.map(r => Array.from(r));
  const b = Array.from(bin);
  let scale = 0;
  for (const r of A) for (const v of r) scale = Math.max(scale, Math.abs(v));
  const tol = 1e-11 * (scale || 1);
  for (let c = 0; c < n; c++) {
    let p = c, best = Math.abs(A[c][c]);
    for (let r = c + 1; r < n; r++) { const v = Math.abs(A[r][c]); if (v > best) { best = v; p = r; } }
    if (best < tol) return null;
    if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [b[p], b[c]] = [b[c], b[p]]; }
    const Ac = A[c], piv = Ac[c];
    for (let r = c + 1; r < n; r++) {
      const Ar = A[r], f = Ar[c] / piv;
      if (f === 0) continue;
      for (let k = c; k < n; k++) Ar[k] -= f * Ac[k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

/* 숫자 포맷: 소수 d자리 반올림, 끝의 0 제거, 마이너스는 '−' */
function fmt(v, d = 2) {
  if (!isFinite(v)) return '—';
  const p = Math.pow(10, d);
  let r = Math.round(v * p) / p;
  if (Math.abs(r) < 0.5 / p) r = 0;
  return String(r).replace('-', '−');
}
/* 부호를 붙인 포맷 (+12.5 / −3) */
function fmtS(v, d = 2) { const s = fmt(v, d); return (s[0] === '−' || s === '0') ? s : '+' + s; }

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

/* 라벨 겹침 방지용 간단한 배치기 */
function LabelPlacer() {
  const boxes = [];
  return {
    ok(x, y, w = 50, h = 16) {
      for (const b of boxes) if (Math.abs(b.x - x) < (b.w + w) / 2 && Math.abs(b.y - y) < (b.h + h) / 2) return false;
      boxes.push({ x, y, w, h });
      return true;
    }
  };
}
