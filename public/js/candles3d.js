// Glass logo and floating glass candlesticks over a glossy floor, for the landing page.
// Loaded on demand by home.js when the stage gets near the viewport.
import * as THREE from '../vendor/three/three.module.min.js';
import { SVGLoader } from '../vendor/three/SVGLoader.js';

const BG = 0x080808; // page background, so the stage melts into the section

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<path id="r" d="M44.75 12.5a4.5 4.5 0 0 1 0 9H26.75a3 3 0 0 0 0 6H33.75L26.75 36.5a12 12 0 0 1 0 -24Z"/>
<path id="w" d="M19.25 51.5a4.5 4.5 0 0 1 0 -9H37.25a3 3 0 0 0 0 -6H30.25L37.25 27.5a12 12 0 0 1 0 24Z"/></svg>`;

// open, close, low, high: an uptrend with pullbacks
const BARS = [
  [1.0, 1.7, 0.75, 2.0], [1.7, 1.3, 1.1, 1.9], [1.3, 2.05, 1.2, 2.3], [2.05, 1.75, 1.6, 2.25],
  [1.75, 2.5, 1.65, 2.75], [2.5, 2.2, 2.05, 2.7], [2.2, 3.05, 2.1, 3.3], [3.05, 2.75, 2.6, 3.2], [2.75, 3.6, 2.65, 3.85],
];

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function gradTex(size, stops, radial = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const gr = radial ? g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2) : g.createLinearGradient(0, 0, 0, size);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// rounded-edge cylinder made by spinning a profile
function roundedCylinder(r, h, b) {
  const pts = [new THREE.Vector2(0, -h / 2)];
  const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= 10; i++) { const a = a0 + ((a1 - a0) * i) / 10; pts.push(new THREE.Vector2(cx + Math.cos(a) * b, cy + Math.sin(a) * b)); } };
  arc(r - b, -h / 2 + b, -Math.PI / 2, 0); arc(r - b, h / 2 - b, 0, Math.PI / 2); pts.push(new THREE.Vector2(0, h / 2));
  return new THREE.LatheGeometry(pts, 64);
}

// a dark studio with bright soft boxes: gives glass its long crisp highlights
function studio(renderer) {
  const env = new THREE.Scene(); env.background = new THREE.Color(0x030303);
  const box = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); env.add(m);
  };
  box(10, 2.5, 0xffffff, 5, [0, 9, 2], [0, 0, 0]);       // overhead soft box
  box(0.6, 10, 0xffffff, 7, [-8, 3, 3], [0, 2, 0]);     // left strip
  box(0.6, 10, 0xff2a40, 7, [8, 3, 1], [0, 2, 0]);      // right red strip
  box(14, 0.4, 0xffffff, 5, [0, 4, -9], [0, 2, 0]);    // back line
  box(12, 5, 0x3a0a12, 1.0, [0, -2, 6], [0, 2, 0]);      // warm floor bounce
  const pm = new THREE.PMREMGenerator(renderer); const tex = pm.fromScene(env, 0.005).texture; pm.dispose(); return tex;
}

export function mount(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene(); scene.background = new THREE.Color(BG);
  scene.environment = studio(renderer); scene.environmentIntensity = 1.7;
  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 100);

  // backdrop the glass refracts: page black with a red glow behind the logo
  const back = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ map: gradTex(512, [[0, '#d6c8cc'], [0.1, '#9a5560'], [0.24, '#55101e'], [0.45, '#1e080c'], [0.7, '#0a0808'], [1, '#080808']]), toneMapped: false }));
  back.position.set(0.2, 2.4, -7);

  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(-3, 7, 6); scene.add(key);

  // materials
  const glass = (o) => new THREE.MeshPhysicalMaterial({ metalness: 0, roughness: 0.03, transmission: 1, ior: 1.52, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, envMapIntensity: 1.4, ...o });
  const mBull = glass({ color: 0xff4a60, thickness: 0.9, attenuationColor: new THREE.Color('#ff1a38'), attenuationDistance: 0.6 });
  const mBear = glass({ color: 0xffffff, transmission: 0.68, roughness: 0.06, thickness: 0.9, attenuationColor: new THREE.Color('#ececf2'), attenuationDistance: 3, emissive: 0x3a3a40, emissiveIntensity: 1 });
  const mWick = glass({ color: 0xffffff, thickness: 0.1, roughness: 0.05, emissive: 0xaaaaaa, emissiveIntensity: 0.5 });
  const mRed = glass({ color: 0xff3a52, thickness: 1.4, attenuationColor: new THREE.Color('#e0102e'), attenuationDistance: 0.7 });
  const mClear = glass({ color: 0xffffff, transmission: 0.68, roughness: 0.08, thickness: 1.4, attenuationColor: new THREE.Color('#f4f4f8'), attenuationDistance: 4, emissive: 0x4a4a50, emissiveIntensity: 1 });

  const root = new THREE.Group(); scene.add(root); root.add(back);  // pointer parallax spins this (around y only, so the mirror stays true)
  const world = new THREE.Group(); root.add(world);

  // logo: a thin glass slab with flat chamfered edges, standing on the floor and leaning back a touch
  const logo = new THREE.Group();
  new SVGLoader().parse(LOGO).paths.forEach((p) => {
    const isRed = (p.userData?.node?.id || '') === 'r';
    SVGLoader.createShapes(p).forEach((s) => {
      const geo = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.9, bevelSize: 0.9, bevelSegments: 1, curveSegments: 48 });
      logo.add(new THREE.Mesh(geo, isRed ? mRed : mClear));
    });
  });
  const lb = new THREE.Box3().setFromObject(logo); const lc = lb.getCenter(new THREE.Vector3()); const lsz = lb.getSize(new THREE.Vector3());
  logo.children.forEach((m) => m.geometry.translate(-lc.x, -lc.y, -lc.z));
  const S = 0.108; logo.scale.set(S, -S, S);
  const logoPivot = new THREE.Group(); logoPivot.add(logo);
  logoPivot.position.set(-1.3, (lsz.y * S) / 2 + 0.02, -2.0); logoPivot.rotation.set(-0.06, 0.45, 0);
  world.add(logoPivot);

  // candles float in front of the logo, each on its own rhythm
  const K = 0.62, R = 0.25, candles = [];
  BARS.forEach(([o, c, l, h], i) => {
    const up = c >= o; const g = new THREE.Group();
    const bh = Math.max(0.3, Math.abs(c - o) * K * 1.35);
    const mid = ((o + c) / 2) * K; const body = new THREE.Mesh(roundedCylinder(R, bh, 0.09), up ? mBull : mBear); body.position.y = mid;
    const wl = Math.max(bh + 0.5, (h - l) * K * 1.35); const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, wl, 16), mWick); wick.position.y = mid;
    g.add(wick, body); g.userData = { x: -2.3 + i * 0.66, z: 0.8 - (i % 2) * 0.3 - i * 0.04, y: 0.75, sp: 0.55 + ((i * 37) % 10) / 20, ph: i * 1.7, amp: 0.07 + (i % 3) * 0.025 };
    g.position.set(g.userData.x, g.userData.y, g.userData.z);
    world.add(g); candles.push(g);
  });

  // reflection: a mirrored twin under a glossy floor
  const mirror = world.clone(); mirror.scale.y = -1; root.add(mirror);
  const pairs = []; world.traverse((o) => pairs.push(o)); const twins = []; mirror.traverse((o) => twins.push(o));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshBasicMaterial({ color: BG, transparent: true, toneMapped: false, alphaMap: gradTex(512, [[0, '#1a1a1a'], [0.3, '#4a4a4a'], [0.5, '#8a8a8a'], [0.62, '#d0d0d0'], [0.75, '#ffffff'], [1, '#ffffff']], false) }));
  floor.rotation.x = -Math.PI / 2; floor.renderOrder = 1; scene.add(floor);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: gradTex(256, [[0, '#ff304840'], [0.45, '#ff304814'], [1, '#ff304800']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0.2, 0.01, 0.4); pool.renderOrder = 2; scene.add(pool);

  // framing: on wide screens the scene sits right of the heading; on narrow ones it is centred
  const frame = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1, a = w / h; renderer.setSize(w, h, false); camera.aspect = a;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(12.5, 8.6 / (2 * tanH * a));
    camera.position.set(0.4, 2.7, dist); camera.lookAt(0.4, 1.95, 0); camera.updateProjectionMatrix();
    const visW = 2 * dist * tanH * a; root.position.x = a > 1.5 ? Math.min(visW * 0.2, 5) : 0; floor.position.x = pool.position.x = root.position.x;
  };
  frame();

  let tx = 0, px = 0;
  const host = canvas.parentElement;
  host.addEventListener('pointermove', (e) => { const r = host.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * 2; });
  host.addEventListener('pointerleave', () => { tx = 0; });

  const pose = (t) => {
    const s = t / 1000;
    candles.forEach((g, i) => {
      const u = g.userData; const k = reduced ? 1 : easeOut((s - 0.2 - i * 0.1) / 0.9);
      g.position.y = u.y + (reduced ? 0 : Math.sin(s * u.sp + u.ph) * u.amp) - (1 - k) * 0.8;
      g.rotation.z = reduced ? 0 : Math.sin(s * u.sp * 0.7 + u.ph) * 0.035; g.rotation.x = reduced ? 0 : Math.cos(s * u.sp * 0.6 + u.ph) * 0.03;
      g.scale.setScalar(Math.max(0.001, 0.6 + 0.4 * k)); g.visible = k > 0.01;
    });
    const lk = reduced ? 1 : easeOut((s - 0.1) / 1.2);
    logoPivot.rotation.y = 0.45 + (reduced ? 0 : Math.sin(s * 0.35) * 0.05) - (1 - lk) * 0.4;
    px += (tx - px) * 0.04; root.rotation.y = px * 0.12;
    for (let i = 0; i < pairs.length; i++) { const a = pairs[i], b = twins[i]; if (a === world) continue; b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale); b.visible = a.visible; }
  };

  let running = false, raf = 0, t0 = 0;
  const loop = (t) => { if (!t0) t0 = t; pose(t - t0); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
  const play = () => { if (running || reduced) return; running = true; raf = requestAnimationFrame(loop); };
  const pause = () => { running = false; cancelAnimationFrame(raf); };
  const still = () => { pose(99999); renderer.render(scene, camera); };
  new ResizeObserver(() => { frame(); if (!running) still(); }).observe(canvas);
  if (reduced) still();
  new IntersectionObserver(([e]) => (e.isIntersecting ? play() : pause()), { rootMargin: '80px' }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : canvas.getBoundingClientRect().top < innerHeight && play()));
  return { play, pause };
}
