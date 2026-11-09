'use strict';
/* 3D 트러스 교량: 같은 평면 트러스 두 개를 가로보로 연결. 부재 색·굵기 = 부재력,
   움직이는 점 = 힘의 흐름(인장: 가운데→양끝으로 당김, 압축: 양끝→가운데로 밀림) */

const Truss3D = (() => {
  function make(container) {
    const v = Viewer3D.create(container, { theta: -0.62, phi: 1.1, r: 17, ty: 0.6, groundY: -1.6 });
    if (!v) return null;
    const G = new THREE.Group();
    v.root.add(G);
    let M = null, items = [], dots = [], loads = [], t0 = performance.now();
    let deformOn = true, flowOn = true;

    const up = new THREE.Vector3(0, 1, 0);
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpD = new THREE.Vector3();
    const dotGeo = new THREE.SphereGeometry(1, 10, 8);

    function nodeWorld(i, plane, k, out) {
      const n = M.nodes[i], s = M.scale;
      const ux = M.u ? M.u[2 * i] * M.uScale * k : 0, uy = M.u ? M.u[2 * i + 1] * M.uScale * k : 0;
      return out.set((n.x + ux) * s - M.L * s / 2, (n.y + uy) * s, plane * M.W / 2);
    }

    function setCyl(mesh, a, b, rad) {
      tmpD.subVectors(b, a);
      const len = tmpD.length();
      mesh.position.copy(a).addScaledVector(tmpD, 0.5);
      mesh.quaternion.setFromUnitVectors(up, tmpD.normalize());
      mesh.scale.set(rad, len, rad);
    }

    function build() {
      Viewer3D.clearGroup(G);
      items = []; dots = []; loads = [];
      const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
      const col = new THREE.Color();
      const planes = [-1, 1];
      planes.forEach(p => {
        M.members.forEach((mb, k) => {
          const f = M.F[k], t = f / M.Fmax;
          Viewer3D.stressColor(Math.abs(f) < 1e-6 ? 0 : (f > 0 ? 0.35 + 0.65 * Math.abs(t) : -(0.35 + 0.65 * Math.abs(t))), col);
          const mat = new THREE.MeshStandardMaterial({ color: col.clone(), roughness: 0.45, metalness: 0.2 });
          const mesh = new THREE.Mesh(cylGeo, mat);
          G.add(mesh);
          const rad = Math.abs(f) < 1e-6 ? 0.035 : 0.05 + 0.09 * Math.abs(t);
          items.push({ mesh, a: mb.a, b: mb.b, p, rad });
          // 힘의 흐름 점
          if (Math.abs(f) > 1e-6) {
            const dm = new THREE.MeshBasicMaterial({ color: f > 0 ? 0x9cc3ff : 0xffb3ae });
            for (let q = 0; q < 4; q++) {
              const d = new THREE.Mesh(dotGeo, dm);
              d.scale.setScalar(rad * 0.75 + 0.02);
              G.add(d);
              dots.push({ d, a: mb.a, b: mb.b, p, T: f > 0, phase: q / 4, speed: 0.25 + 0.5 * Math.abs(t) });
            }
          }
        });
        // 절점
        M.nodes.forEach((n, i) => {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshStandardMaterial({ color: 0x3d4656, roughness: 0.6 }));
          G.add(s);
          items.push({ node: i, mesh: s, p });
        });
      });
      // 가로보 (하현 절점끼리), 상부 가새
      const greyMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b4, roughness: 0.7 });
      M.nodes.forEach((n, i) => {
        const mesh = new THREE.Mesh(cylGeo, greyMat);
        G.add(mesh);
        items.push({ cross: i, mesh, rad: n.y < 1e-9 ? 0.045 : 0.03 });
      });
      // 바닥판
      const deck = new THREE.Mesh(new THREE.BoxGeometry(M.L * M.scale, 0.06, M.W * 0.92),
        new THREE.MeshStandardMaterial({ color: 0xb8c0cc, transparent: true, opacity: 0.35, roughness: 0.9 }));
      deck.position.y = -0.09;
      G.add(deck);
      // 지점 블록
      [M.pin, M.roller].forEach((i, idx) => {
        [-1, 1].forEach(p => {
          const blk = new THREE.Mesh(idx === 0 ? new THREE.ConeGeometry(0.3, 0.5, 4) : new THREE.CylinderGeometry(0.22, 0.22, 0.6, 16),
            new THREE.MeshStandardMaterial({ color: 0x5b6577, roughness: 0.7 }));
          const n = M.nodes[i];
          blk.position.set(n.x * M.scale - M.L * M.scale / 2, -0.33, p * M.W / 2);
          if (idx === 1) blk.rotation.x = Math.PI / 2;
          G.add(blk);
        });
      });
      // 하중 화살표
      M.loaded.forEach(i => {
        [-1, 1].forEach(p => {
          const a = Viewer3D.arrow(0xf06a1d, 1.1, 0.04);
          G.add(a);
          loads.push({ a, i, p });
        });
      });
    }

    function frame(now) {
      if (!M) return;
      const t = (now - t0) / 1000;
      const k = deformOn ? (1 - Math.cos(t * 2 * Math.PI / 2.4)) / 2 : 0;
      items.forEach(it => {
        if (it.node !== undefined) { nodeWorld(it.node, it.p, k, it.mesh.position); return; }
        if (it.cross !== undefined) {
          nodeWorld(it.cross, -1, k, tmpA); nodeWorld(it.cross, 1, k, tmpB);
          setCyl(it.mesh, tmpA, tmpB, it.rad); return;
        }
        nodeWorld(it.a, it.p, k, tmpA); nodeWorld(it.b, it.p, k, tmpB);
        setCyl(it.mesh, tmpA, tmpB, it.rad);
      });
      dots.forEach(o => {
        o.d.visible = flowOn;
        if (!flowOn) return;
        nodeWorld(o.a, o.p, k, tmpA); nodeWorld(o.b, o.p, k, tmpB);
        let s = (t * o.speed + o.phase) % 1; // 0→1
        // 인장: 가운데(0.5)에서 양끝으로, 압축: 양끝에서 가운데로
        const half = o.phase < 0.5 ? 1 : -1;
        const r = o.T ? 0.5 + half * 0.46 * s : 0.5 + half * 0.46 * (1 - s);
        o.d.position.lerpVectors(tmpA, tmpB, r);
      });
      loads.forEach(o => {
        nodeWorld(o.i, o.p, k, tmpA);
        const bob = Math.sin(t * 3) * 0.05;
        o.a.position.set(tmpA.x, tmpA.y + 0.14 + bob, tmpA.z);
      });
    }
    v.onTick(frame);

    return {
      update(model) {
        const span = 11;
        M = Object.assign({}, model, { scale: span / model.L });
        M.W = Math.max(2.2, model.h * M.scale * 0.9);
        const umax = Math.max(1e-12, ...(model.u || [0]).map(Math.abs));
        M.uScale = 0.045 * model.L / umax;
        v.orb.target.set(0, model.h * M.scale / 2, 0);
        v.place();
        build();
        frame(performance.now());
      },
      setDeform(b) { deformOn = b; },
      setFlow(b) { flowOn = b; },
      start: () => v.start(),
      reset: () => v.reset(),
    };
  }
  return { make };
})();
