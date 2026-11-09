'use strict';
/* 3D 보 모델 (선형 탄성 · 미소변형 이론을 확대해서 보여 줌)
   - 길이·단면 치수는 실제 비율 (1 m = U 화면 단위)
   - 처짐은 정해진 배율 k 로만 확대 (k 는 화면에 표시)
   - 오일러-베르누이 가정: 단면은 평면을 유지하고 변형된 축에 수직 → 수평변위 u = −y·θ
   - 핀: 보 하단의 핀 점이 움직이지 않고 보가 그 점을 중심으로 회전
   - 롤러: 보 하단 섬유가 늘어난 만큼 윗판이 수평 이동, 바퀴는 미끄럼 없이 굴러 그 절반만 이동
   - 고정단: 처짐·처짐각 0 → 단면이 벽에 붙은 채 수직 유지
   - 하중 재하: 하중·반력·처짐·응력이 모두 같은 비율 f 로 함께 증가 (선형이므로 δ ∝ 하중) */

const Beam3D = (() => {
  const U = 0.6;          // 화면 단위 / m
  const ROLL_R = 0.075;   // 롤러 바퀴 반지름 (화면 단위)

  function make(container, opt = {}) {
    const v = Viewer3D.create(container, { theta: -0.42, phi: 1.22, r: 12, ty: -0.3, groundY: -2.1 });
    if (!v) return null;
    const beamG = new THREE.Group(), deco = new THREE.Group(), ghostG = new THREE.Group();
    v.root.add(beamG, deco, ghostG);
    let model = null, mesh = null, base = null, f = 1, animStart = null;
    let kCur = 1;
    const tmpC = new THREE.Color();

    /* 단면 외곽선 (y: 위, z: 폭) — 실제 치수 비율 */
    function profile(sec) {
      const H = sec.h / 1000 * U, B = sec.B / 1000 * U;
      if (sec.type === 'rect') return { pts: [[-H / 2, -B / 2], [-H / 2, B / 2], [H / 2, B / 2], [H / 2, -B / 2]], H };
      const tf = sec.tf / 1000 * U, tw = sec.tw / 1000 * U;
      return {
        H, pts: [
          [-H / 2, -B / 2], [-H / 2, B / 2], [-H / 2 + tf, B / 2], [-H / 2 + tf, tw / 2], [H / 2 - tf, tw / 2], [H / 2 - tf, B / 2],
          [H / 2, B / 2], [H / 2, -B / 2], [H / 2 - tf, -B / 2], [H / 2 - tf, -tw / 2], [-H / 2 + tf, -tw / 2], [-H / 2 + tf, -B / 2],
        ]
      };
    }

    function build() {
      Viewer3D.clearGroup(beamG);
      const { pts, H } = profile(model.sec);
      const N = 160, np = pts.length;
      const xs = []; for (let i = 0; i <= N; i++) xs.push(i / N);
      const quads = [];
      for (let j = 0; j < N; j++) for (let k = 0; k < np; k++) {
        const a = pts[k], b = pts[(k + 1) % np];
        quads.push([[xs[j], a], [xs[j + 1], a], [xs[j + 1], b], [xs[j], b]]);
      }
      const contour = pts.map(p => new THREE.Vector2(p[1], p[0]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const verts = [];
      quads.forEach(q => { const [p0, p1, p2, p3] = q; verts.push(p0, p2, p1, p0, p3, p2); });
      tris.forEach(t => { verts.push([0, pts[t[0]]], [0, pts[t[1]]], [0, pts[t[2]]]); });
      tris.forEach(t => { verts.push([1, pts[t[0]]], [1, pts[t[2]]], [1, pts[t[1]]]); });
      const n = verts.length;
      base = { s: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), H };
      verts.forEach((vv, i) => { base.s[i] = vv[0]; base.y[i] = vv[1][0]; base.z[i] = vv[1][1]; });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide }));
      beamG.add(mesh);
    }

    /* 하중 전 원래 위치 (점선) */
    function buildGhost() {
      Viewer3D.clearGroup(ghostG);
      const H = base.H, L = model.L * U;
      const ghost = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, 0.01)),
        new THREE.LineDashedMaterial({ color: 0x8a93a6, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.7 }));
      ghost.computeLineDistances();
      ghost.position.y = H / 2;
      ghostG.add(ghost);
      // 1 m 눈금자 (보 앞쪽 바닥)
      const mat = new THREE.LineBasicMaterial({ color: 0x8a93a6, transparent: true, opacity: 0.8 });
      const g = new THREE.BufferGeometry(), p = [];
      const zr = 0.9, yr = -0.62;
      p.push(-L / 2, yr, zr, L / 2, yr, zr);
      for (let x = 0; x <= model.L + 1e-9; x += 1) {
        const big = Math.abs(x % 5) < 1e-9 || Math.abs(x - model.L) < 1e-9;
        const X = -L / 2 + x * U;
        p.push(X, yr, zr, X, yr, zr + (big ? 0.22 : 0.1));
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      ghostG.add(new THREE.LineSegments(g, mat));
    }

    /* 처짐 δ(mm)·처짐각 θ(rad)·모멘트 샘플 */
    let sArr = null, dArr = null, tArr = null, mArr = null, sRef = null;
    function prepSamples() {
      const N = 480, L = model.L;
      sArr = []; dArr = []; mArr = []; tArr = [];
      for (let i = 0; i <= N; i++) { const x = L * i / N; sArr.push(i / N); dArr.push(model.deflAt(x)); mArr.push(model.Mat(x)); }
      for (let i = 0; i <= N; i++) {
        tArr.push(model.slopeAt(L * i / N)); // rad (Hermite 형상함수의 도함수)
      }
      // 수평 기준점: 핀(하단 고정) → 없으면 고정단(θ=0) → 없으면 왼쪽 끝
      const pin = model.sups.find(s => s.type === 'pin') || model.sups.find(s => s.type === 'fixed');
      sRef = pin ? pin.x / L : 0;
    }
    const interp = (arr, s) => { const t = clamp(s, 0, 1) * (arr.length - 1), i = Math.min(arr.length - 2, Math.floor(t)), u = t - i; return arr[i] + (arr[i + 1] - arr[i]) * u; };
    const scaleNow = () => kCur * f;                       // 현재 표시 배율 × 하중 비율
    const vDisp = s => interp(dArr, s) / 1000 * U * scaleNow();  // 축의 수직변위 (화면 단위)
    const phiDisp = s => interp(tArr, s) * scaleNow();           // 화면상 단면 회전각
    const uShift = () => -(base.H / 2) * phiDisp(sRef);          // 기준점 하단의 수평변위를 0으로
    const uBottom = s => (base.H / 2) * phiDisp(s) + uShift();   // 하단 섬유(y=−H/2)의 수평변위

    function applyDeform() {
      if (!mesh) return;
      const pos = mesh.geometry.attributes.position.array, col = mesh.geometry.attributes.color.array;
      const n = base.s.length, Mabs = Math.max(1e-12, model.Mabs), hh = base.H / 2, L = model.L * U, c = uShift();
      for (let i = 0; i < n; i++) {
        const s = base.s[i], y = base.y[i];
        pos[3 * i] = -L / 2 + s * L - y * phiDisp(s) + c;
        pos[3 * i + 1] = hh + y + vDisp(s);
        pos[3 * i + 2] = base.z[i];
        const sig = -interp(mArr, s) * y / (Mabs * hh) * f; // + 인장 (σ = −M·y/I), 하중 비율 f 에 비례
        Viewer3D.stressColor(sig, tmpC);
        col[3 * i] = tmpC.r; col[3 * i + 1] = tmpC.g; col[3 * i + 2] = tmpC.b;
      }
      mesh.geometry.attributes.position.needsUpdate = true;
      mesh.geometry.attributes.color.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      placeDeco();
    }

    const X = x => (-model.L / 2 + x) * U;
    let decoItems = [];
    const supMat = () => new THREE.MeshStandardMaterial({ color: 0x5b6577, roughness: 0.7 });

    function momentArc(color, R, cw) {
      const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color });
      const tor = new THREE.Mesh(new THREE.TorusGeometry(R, 0.03, 8, 40, Math.PI * 1.5), mat);
      tor.rotation.z = Math.PI * 0.25;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 16), mat);
      const endA = Math.PI * 0.25 + (cw ? 0 : Math.PI * 1.5);
      cone.position.set(R * Math.cos(endA), R * Math.sin(endA), 0);
      cone.rotation.z = endA + (cw ? Math.PI : 0);
      g.add(tor, cone);
      return g;
    }

    function buildDeco() {
      Viewer3D.clearGroup(deco);
      decoItems = [];
      const H = base.H;
      const orange = 0xf06a1d, green = 0x2f9e44, violet = 0x7b3fe4;
      // 힘 화살표 공통 축척 (kN → 화면 단위): 집중하중과 반력이 같은 축척이라 길이 합이 평형을 그대로 보여 줌
      const Fmax = Math.max(1e-9, ...model.loads.filter(l => l.type === 'point').map(l => Math.abs(l.P)), ...model.sups.map(s => Math.abs(s.R)));
      const fs = Math.min(0.06, 2.2 / Fmax);
      const wmax = Math.max(1e-9, ...model.loads.filter(l => l.type === 'dist').map(l => Math.max(Math.abs(l.w1), Math.abs(l.w2))));
      const ws = Math.min(0.16, 1.2 / wmax);

      model.sups.forEach(s => {
        const mat = supMat();
        if (s.type === 'fixed') {
          const g = new THREE.Group();
          const left = s.x < model.L / 2;
          const wall = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 1.4), mat);
          wall.position.set(left ? -0.11 : 0.11, H / 2, 0);
          g.add(wall); g.position.x = X(s.x); deco.add(g);
          if (Math.abs(s.Mr) > 1e-6) {
            const arc = momentArc(green, 0.5, s.Mr < 0);
            deco.add(arc);
            decoItems.push({ obj: arc, kind: 'arc', x: s.x, z: 0.75, H });
          }
        } else {
          const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.6, 3), mat);
          tri.rotation.set(-Math.PI / 2, 0, 0); // 꼭짓점이 위 (보 하단에 닿음)
          const triG = new THREE.Group(); tri.position.y = -0.26; triG.add(tri);
          const pinDot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.66, 12), new THREE.MeshStandardMaterial({ color: 0x2b3240 }));
          pinDot.rotation.x = Math.PI / 2; triG.add(pinDot);
          deco.add(triG);
          const item = { kind: s.type, x: s.x, tri: triG };
          if (s.type === 'roller') {
            const wheels = [];
            [-0.12, 0.12].forEach(dx => {
              const wg = new THREE.Group();
              const c = new THREE.Mesh(new THREE.CylinderGeometry(ROLL_R, ROLL_R, 0.6, 20), mat);
              c.rotation.x = Math.PI / 2; wg.add(c);
              const mark = new THREE.Mesh(new THREE.BoxGeometry(ROLL_R * 1.9, 0.018, 0.62), new THREE.MeshStandardMaterial({ color: 0xe9ecf2 }));
              wg.add(mark);
              deco.add(wg); wheels.push({ g: wg, dx });
            });
            const pad = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), mat);
            pad.position.set(X(s.x), -0.39 - 2 * ROLL_R - 0.025, 0); deco.add(pad);
            item.wheels = wheels;
          } else {
            const pad = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), mat);
            pad.position.set(X(s.x), -0.39 - 0.025, 0); deco.add(pad);
          }
          decoItems.push(item);
        }
        if (Math.abs(s.R) > 1e-6) {
          const len = Math.abs(s.R) * fs;
          const a = Viewer3D.arrow(green, len, 0.035);
          if (s.R > 0) a.rotation.z = Math.PI; // 위 방향
          deco.add(a);
          decoItems.push({ obj: a, kind: 'react', x: s.x, up: s.R > 0, len, fixed: s.type === 'fixed', left: s.x < model.L / 2 });
        }
      });

      model.loads.forEach(l => {
        if (l.type === 'point') {
          const len = Math.abs(l.P) * fs;
          const a = Viewer3D.arrow(orange, len, 0.045);
          if (l.P < 0) a.rotation.z = Math.PI;
          deco.add(a);
          decoItems.push({ obj: a, kind: 'load', x: l.x, down: l.P >= 0, len, H });
        } else if (l.type === 'dist') {
          const n = Math.max(2, Math.round((l.x2 - l.x1) / 0.5));
          for (let i = 0; i <= n; i++) {
            const x = l.x1 + (l.x2 - l.x1) * i / n;
            const w = l.w1 + (l.w2 - l.w1) * i / n;
            if (Math.abs(w) < 1e-9) continue;
            const len = Math.abs(w) * ws;
            const a = Viewer3D.arrow(orange, len, 0.02);
            if (w < 0) a.rotation.z = Math.PI;
            deco.add(a);
            decoItems.push({ obj: a, kind: 'load', x, down: w >= 0, len, H });
          }
        } else if (l.type === 'moment') {
          const arc = momentArc(violet, 0.5, l.M >= 0);
          deco.add(arc);
          decoItems.push({ obj: arc, kind: 'arc', x: l.x, z: 0.45, H });
        }
      });
    }

    function placeDeco() {
      const L = model.L;
      decoItems.forEach(it => {
        const s = it.x / L;
        if (it.kind === 'load') {
          // 보 윗면(변형 후)에 화살촉이 닿게, 길이는 하중 비율 f 에 비례
          const top = base.H + vDisp(s), xs = X(it.x) - (base.H / 2) * phiDisp(s) + uShift();
          const k = Math.max(0.001, f);
          it.obj.scale.set(1, k, 1);
          it.obj.position.set(xs, it.down ? top + 0.01 : top + 0.01 + it.len * k, 0);
          it.obj.visible = f > 0.005;
        } else if (it.kind === 'react') {
          const k = Math.max(0.001, f);
          it.obj.scale.set(1, k, 1);
          const yb = it.fixed ? 0 : -0.62;
          const xr = X(it.x) + (it.fixed ? (it.left ? 0.12 : -0.12) : 0);
          it.obj.position.set(xr, it.up ? yb : yb - it.len * k, it.fixed ? 0.85 : 0.62); // 고정단은 벽 앞쪽에 그림
          it.obj.visible = f > 0.005;
        } else if (it.kind === 'arc') {
          it.obj.position.set(X(it.x), base.H / 2 + vDisp(s), it.z);
          it.obj.scale.setScalar(Math.max(0.001, f));
        } else if (it.kind === 'pin') {
          it.tri.position.set(X(it.x), 0, 0); // 핀은 움직이지 않음 (보가 이 점을 중심으로 회전)
        } else if (it.kind === 'roller') {
          const du = uBottom(s); // 보 하단 섬유가 이동한 거리 = 윗판 이동
          it.tri.position.set(X(it.x) + du, 0, 0);
          it.wheels.forEach(w => {
            w.g.position.set(X(it.x) + w.dx + du / 2, -0.39 - ROLL_R, 0); // 미끄럼 없이 구르면 중심은 절반 이동
            w.g.rotation.z = -(du / 2) / ROLL_R;
          });
        }
      });
    }
    const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    v.onTick(now => {
      let dirty = false;
      if (animStart !== null) {
        const t = (now - animStart) / 2200;
        f = easeInOut(Math.min(1, Math.max(0, t)));
        if (opt.onLoad) opt.onLoad(f);
        dirty = true;
        if (t >= 1) animStart = null;
      }
      if (dirty && model) applyDeform();
    });

    let lastSig = '';
    return {
      update(m, { animate = false } = {}) {
        model = m;
        const sig = JSON.stringify(m.sec);
        if (!mesh || sig !== lastSig) { build(); lastSig = sig; }
        buildGhost();
        prepSamples();
        buildDeco();
        kCur = m.k; // 표시 배율은 화면 라벨과 항상 같게 즉시 적용
        if (animate) { f = 0; animStart = performance.now(); if (opt.onLoad) opt.onLoad(0); }
        applyDeform();
      },
      play() { f = 0; animStart = performance.now(); if (opt.onLoad) opt.onLoad(0); v.start(); },
      start: () => v.start(),
      reset: () => v.reset(),
    };
  }

  return { make };
})();
