'use strict';
/* Three.js 공용 뷰어: 장면·조명·궤도 카메라(직접 구현)·렌더 루프. THREE 가 없으면 안내만 표시 */

const Viewer3D = (() => {
  const has = () => typeof THREE !== 'undefined';

  function cssColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function create(container, opt = {}) {
    if (!has()) {
      container.innerHTML = '<div class="v3d-missing">3D 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침하세요.</div>';
      return null;
    }
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);
    renderer.domElement.className = 'v3d-canvas';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(6, 12, 9);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.3);
    rim.position.set(-8, 4, -10);
    scene.add(rim);

    // 바닥 격자
    const grid = new THREE.GridHelper(40, 40, 0x8892a6, 0x8892a6);
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    grid.position.y = opt.groundY ?? -2;
    scene.add(grid);

    const root = new THREE.Group();
    scene.add(root);

    // 궤도 카메라
    const orb = { theta: opt.theta ?? -0.55, phi: opt.phi ?? 1.15, r: opt.r ?? 16, target: new THREE.Vector3(0, opt.ty ?? 0, 0) };
    const place = () => {
      orb.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.02, orb.phi));
      orb.r = Math.max(5, Math.min(60, orb.r));
      camera.position.set(
        orb.target.x + orb.r * Math.sin(orb.phi) * Math.sin(orb.theta),
        orb.target.y + orb.r * Math.cos(orb.phi),
        orb.target.z + orb.r * Math.sin(orb.phi) * Math.cos(orb.theta));
      camera.lookAt(orb.target);
    };
    place();
    let dragging = null;
    const el = renderer.domElement;
    el.addEventListener('pointerdown', e => { dragging = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      orb.theta -= (e.clientX - dragging.x) * 0.008;
      orb.phi -= (e.clientY - dragging.y) * 0.006;
      dragging = { x: e.clientX, y: e.clientY };
      place();
    });
    const end = () => { dragging = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => { e.preventDefault(); orb.r *= Math.exp(e.deltaY * 0.001); place(); }, { passive: false });

    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(container);

    let tickFn = null, running = false;
    function loop(now) {
      if (!running) return;
      if (container.offsetParent === null) { running = false; return; }
      if (tickFn) tickFn(now);
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    }
    function start() { if (running) return; running = true; resize(); requestAnimationFrame(loop); }
    function stop() { running = false; }

    function reset() { Object.assign(orb, { theta: opt.theta ?? -0.55, phi: opt.phi ?? 1.15, r: opt.r ?? 16 }); place(); }

    return { scene, camera, renderer, root, grid, start, stop, reset, onTick: f => { tickFn = f; }, orb, place };
  }

  /* 화살표 메시 (원기둥 + 원뿔), 끝점이 tip */
  function arrow(color, len = 1.2, rad = 0.04) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const head = Math.min(0.35, len * 0.35);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, Math.max(0.01, len - head), 12), mat);
    shaft.position.y = head + (len - head) / 2;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rad * 3, head, 16), mat);
    cone.rotation.x = Math.PI;
    cone.position.y = head / 2;
    g.add(shaft, cone);
    return g; // 기본: +y 쪽에서 원점(tip)을 향해 아래로
  }

  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    }
  }

  /* 응력/부재력 색: t∈[-1,1], 음수 = 압축(빨강), 양수 = 인장(파랑) */
  const cNeutral = () => new THREE.Color(0xd5dae3), cT = () => new THREE.Color(0x1f6fe0), cC = () => new THREE.Color(0xe0352f);
  function stressColor(t, out) {
    const a = Math.min(1, Math.abs(t));
    out.copy(cNeutral()).lerp(t >= 0 ? cT() : cC(), Math.pow(a, 0.8));
    return out;
  }

  return { has, create, arrow, clearGroup, stressColor, cssColor };
})();
