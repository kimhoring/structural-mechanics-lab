'use strict';
/* 3D 보 모델: 단면을 보 축을 따라 쓸어 만든 메시. 처짐만큼 휘고, 휨응력 σ = −M·y/I 를 색으로 표시 */

const Beam3D = (() => {
  const LEN = 10; // 화면상 보 길이

  function make(container) {
    const v = Viewer3D.create(container, { theta: -0.5, phi: 1.12, r: 15.5, ty: -0.3, groundY: -2.2 });
    if (!v) return null;
    const beamG = new THREE.Group(), deco = new THREE.Group();
    v.root.add(beamG, deco);
    let model = null, mesh = null, base = null, f = 1, animStart = null;
    const tmpC = new THREE.Color();

    function profile(sec) {
      // 단면 외곽선 (y: 위, z: 폭), 화면 단위
      const H = 0.62;
      if (sec.type === 'rect') { const B = 0.42; return { pts: [[-H / 2, -B / 2], [-H / 2, B / 2], [H / 2, B / 2], [H / 2, -B / 2]], H }; }
      const B = 0.62 * sec.B / sec.h, tf = 0.075, tw = 0.045;
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
      const N = 120, np = pts.length;
      const xs = []; for (let i = 0; i <= N; i++) xs.push(i / N);
      // 측면: 외곽선의 각 변 × 각 분절 → 사각형 2개 (평면 셰이딩 위해 정점 비공유)
      const quads = [];
      for (let j = 0; j < N; j++) for (let k = 0; k < np; k++) {
        const a = pts[k], b = pts[(k + 1) % np];
        // 외곽선 방향이 바깥 법선을 향하도록 정렬
        quads.push([[xs[j], a], [xs[j + 1], a], [xs[j + 1], b], [xs[j], b]]);
      }
      // 끝면 삼각분할
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
      // 원래 위치(점선 윤곽)
      const ghost = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(LEN, H, 0.02)),
        new THREE.LineDashedMaterial({ color: 0x8a93a6, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.6 }));
      ghost.computeLineDistances();
      beamG.add(ghost);
    }

    // 처짐 형상(화면 단위) 보간
    let dScale = 1, sArr = null, dArr = null, mArr = null;
    function prepSamples() {
      const N = 240, L = model.L;
      sArr = []; dArr = []; mArr = [];
      const dmax = Math.max(1e-12, ...model.nodes.map((x, i) => Math.abs(model.defl[i])));
      dScale = 0.9 / dmax;
      for (let i = 0; i <= N; i++) {
        const x = L * i / N;
        sArr.push(i / N); dArr.push(model.deflAt(x)); mArr.push(model.Mat(x));
      }
    }
    const interp = (arr, s) => { const t = s * (arr.length - 1), i = Math.min(arr.length - 2, Math.floor(t)), u = t - i; return arr[i] + (arr[i + 1] - arr[i]) * u; };

    function applyDeform() {
      if (!mesh) return;
      const pos = mesh.geometry.attributes.position.array, col = mesh.geometry.attributes.color.array;
      const n = base.s.length, Mabs = Math.max(1e-12, model.Mabs), hh = base.H / 2;
      for (let i = 0; i < n; i++) {
        const s = base.s[i];
        const d = interp(dArr, s) * dScale * f;
        pos[3 * i] = -LEN / 2 + s * LEN;
        pos[3 * i + 1] = base.y[i] + d;
        pos[3 * i + 2] = base.z[i];
        const sig = -interp(mArr, s) * base.y[i] / (Mabs * hh) * f; // + 인장
        Viewer3D.stressColor(sig, tmpC);
        col[3 * i] = tmpC.r; col[3 * i + 1] = tmpC.g; col[3 * i + 2] = tmpC.b;
      }
      mesh.geometry.attributes.position.needsUpdate = true;
      mesh.geometry.attributes.color.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      placeDeco();
    }

    const X = x => -LEN / 2 + x / model.L * LEN;
    let decoItems = [];
    function buildDeco() {
      Viewer3D.clearGroup(deco);
      decoItems = [];
      const H = base.H;
      const orange = 0xf06a1d, green = 0x2f9e44, violet = 0x7b3fe4;
      // 지점
      model.sups.forEach(s => {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x5b6577, roughness: 0.7 });
        if (s.type === 'fixed') {
          const wall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 1.6), mat);
          wall.position.set(s.x < model.L / 2 ? -0.125 : 0.125, 0, 0);
          g.add(wall);
        } else {
          // 삼각기둥: 꼭짓점이 위로 향하게
          const prism = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 3), mat);
          prism.rotation.set(-Math.PI / 2, 0, 0);
          prism.position.y = -H / 2 - 0.28;
          g.add(prism);
          if (s.type === 'roller') {
            [-0.15, 0.15].forEach(dx => {
              const c = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 16), mat);
              c.rotation.x = Math.PI / 2; c.position.set(dx, -H / 2 - 0.47, 0);
              g.add(c);
            });
          }
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.9), mat);
          pad.position.y = s.type === 'roller' ? -H / 2 - 0.58 : -H / 2 - 0.47;
          g.add(pad);
        }
        g.position.x = X(s.x);
        deco.add(g);
        // 반력 화살표
        if (Math.abs(s.R) > 1e-6) {
          const len = 0.6 + 0.9 * Math.abs(s.R) / model.Rmax;
          const a = Viewer3D.arrow(green, len, 0.04);
          if (s.R > 0) { a.rotation.z = Math.PI; }
          deco.add(a);
          decoItems.push({ obj: a, x: s.x, kind: 'react', up: s.R > 0, H, len });
        }
      });
      // 하중
      const wmax = Math.max(1e-9, ...model.loads.filter(l => l.type === 'dist').map(l => Math.max(l.w1, l.w2)));
      const pmax = Math.max(1e-9, ...model.loads.filter(l => l.type === 'point').map(l => Math.abs(l.P)));
      model.loads.forEach(l => {
        if (l.type === 'point') {
          const len = 0.9 + 0.8 * Math.abs(l.P) / pmax;
          const a = Viewer3D.arrow(orange, len, 0.05);
          if (l.P < 0) a.rotation.z = Math.PI;
          deco.add(a);
          decoItems.push({ obj: a, x: l.x, kind: 'load', down: l.P >= 0, H, len });
        } else if (l.type === 'dist') {
          const n = Math.max(2, Math.round((l.x2 - l.x1) / model.L * 22));
          for (let i = 0; i <= n; i++) {
            const x = l.x1 + (l.x2 - l.x1) * i / n;
            const w = l.w1 + (l.w2 - l.w1) * i / n;
            if (w / wmax < 0.04) continue;
            const len = 0.25 + 0.85 * w / wmax;
            const a = Viewer3D.arrow(orange, len, 0.022);
            deco.add(a);
            decoItems.push({ obj: a, x, kind: 'load', down: true, H, len });
          }
        } else if (l.type === 'moment') {
          const g = new THREE.Group();
          const mat = new THREE.MeshStandardMaterial({ color: violet });
          const tor = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 40, Math.PI * 1.5), mat);
          tor.rotation.z = -Math.PI * 0.25 * 3 + Math.PI;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 16), mat);
          // 끝 화살촉 (시계/반시계)
          const endA = tor.rotation.z + (l.M >= 0 ? 0 : Math.PI * 1.5);
          cone.position.set(0.55 * Math.cos(endA), 0.55 * Math.sin(endA), 0);
          cone.rotation.z = endA + (l.M >= 0 ? Math.PI : 0);
          g.add(tor, cone);
          deco.add(g);
          decoItems.push({ obj: g, x: l.x, kind: 'moment', H });
        }
      });
    }

    function placeDeco() {
      decoItems.forEach(it => {
        const s = it.x / model.L, d = interp(dArr, s) * dScale * f;
        const y0 = d;
        if (it.kind === 'load') {
          const drop = (1 - easeOut(Math.min(1, f * 1.4))) * 2.2; // 위에서 떨어지는 효과
          if (it.down) { it.obj.position.set(X(it.x), y0 + it.H / 2 + 0.02 + drop, 0); }
          else { it.obj.position.set(X(it.x), y0 + it.H / 2 + it.len + 0.02 + drop, 0); }
          it.obj.visible = f > 0.01;
        } else if (it.kind === 'react') {
          const k = easeOut(f);
          it.obj.scale.set(1, Math.max(0.01, k), 1);
          const base = -it.H / 2 - 0.68; // 지점 바로 아래
          // 위 방향(↑)은 화살촉이 지점에 닿고, 아래 방향(↓)은 지점에서 내려감
          it.obj.position.set(X(it.x), it.up ? base : base - it.len * k, 0.75);
        } else if (it.kind === 'moment') {
          it.obj.position.set(X(it.x), y0, 0.5);
          it.obj.scale.setScalar(Math.max(0.01, easeOut(f)));
        }
      });
    }
    const easeOut = t => 1 - Math.pow(1 - t, 3);

    v.onTick(now => {
      if (animStart === null) return;
      const t = (now - animStart) / 1600;
      f = easeOut(Math.min(1, Math.max(0, t)));
      applyDeform();
      if (t >= 1) animStart = null;
    });

    let lastSig = '';
    return {
      update(m, { animate = false } = {}) {
        model = m;
        const sig = JSON.stringify([m.sec.type, m.sec.B, m.sec.h]);
        if (!mesh || sig !== lastSig) { build(); lastSig = sig; }
        prepSamples();
        buildDeco();
        if (animate) { f = 0; animStart = performance.now(); }
        applyDeform();
      },
      play() { f = 0; animStart = performance.now(); v.start(); },
      start: () => v.start(),
      reset: () => v.reset(),
    };
  }

  return { make };
})();
