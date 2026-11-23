// Glass candlesticks and the extruded logo for the landing bento card.
// Loaded on demand by home.js when the card gets near the viewport.
import * as THREE from '../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { SVGLoader } from '../vendor/three/SVGLoader.js';

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<path id="r" d="M44.75 12.5a4.5 4.5 0 0 1 0 9H26.75a3 3 0 0 0 0 6H33.75L26.75 36.5a12 12 0 0 1 0 -24Z" fill="#ff3048"/>
<path id="w" d="M19.25 51.5a4.5 4.5 0 0 1 0 -9H37.25a3 3 0 0 0 0 -6H30.25L37.25 27.5a12 12 0 0 1 0 24Z" fill="#ffffff"/></svg>`;

// open, close, low, high: a short uptrend with two pullbacks
const BARS = [
  [1.0, 1.7, 0.7, 2.0], [1.7, 1.35, 1.15, 1.9], [1.35, 2.1, 1.25, 2.35], [2.1, 2.75, 1.95, 3.0], [2.75, 2.45, 2.25, 2.95],
  [2.45, 3.2, 2.35, 3.45], [3.2, 3.85, 3.05, 4.1], [3.85, 3.55, 3.35, 4.0], [3.55, 4.35, 3.45, 4.6],
];

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function radial(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// a cylinder with rounded top and bottom edges, made by spinning a profile
function capsuleBody(r, h, b) {
  const pts = [new THREE.Vector2(0, -h / 2)];
  const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= 8; i++) { const a = a0 + ((a1 - a0) * i) / 8; pts.push(new THREE.Vector2(cx + Math.cos(a) * b, cy + Math.sin(a) * b)); } };
  arc(r - b, -h / 2 + b, -Math.PI / 2, 0); arc(r - b, h / 2 - b, 0, Math.PI / 2); pts.push(new THREE.Vector2(0, h / 2));
  return new THREE.LatheGeometry(pts, 48);
}

export function mount(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(28, 2, 0.1, 100);

  // backdrop the glass refracts: dark with a red glow behind the candles
  const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 22), new THREE.MeshBasicMaterial({ map: radial(512, [[0, '#5a0d1a'], [0.35, '#2a0810'], [0.75, '#0d0b0c'], [1, '#0b0b0c']]) }));
  back.position.set(0.8, 2.2, -7); scene.add(back);

  // glow pool on the floor
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshBasicMaterial({ map: radial(256, [[0, '#ff304855'], [0.5, '#ff304818'], [1, '#ff304800']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0.4, 0.001, 0.2); scene.add(pool);

  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 6, 5); scene.add(key);
  const red = new THREE.PointLight(0xff3048, 40, 14, 1.6); red.position.set(-2.5, 2, 2.5); scene.add(red);
  const rim = new THREE.PointLight(0xffffff, 26, 14, 1.6); rim.position.set(3, 4, -3); scene.add(rim);

  const glassBull = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.08, transmission: 1, thickness: 0.9, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.04, attenuationColor: new THREE.Color('#ffe3e7'), attenuationDistance: 2.5, specularIntensity: 1 });
  const glassBear = new THREE.MeshPhysicalMaterial({ color: 0xff3048, metalness: 0, roughness: 0.1, transmission: 0.92, thickness: 1.2, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.05, attenuationColor: new THREE.Color('#ff1030'), attenuationDistance: 0.7, emissive: 0x3a0008, emissiveIntensity: 0.6 });
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xe6e6ea, metalness: 1, roughness: 0.18 });

  const world = new THREE.Group(); scene.add(world);

  // candles, receding from front-left to back-right
  const K = 0.95, R = 0.2, candles = [];
  BARS.forEach(([o, c, l, h], i) => {
    const up = c >= o; const g = new THREE.Group();
    const bh = Math.max(0.18, Math.abs(c - o) * K);
    const body = new THREE.Mesh(capsuleBody(R, bh, 0.07), up ? glassBull : glassBear);
    body.position.y = Math.min(o, c) * K + bh / 2;
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, (h - l) * K, 12), steel);
    wick.position.y = ((h + l) / 2) * K;
    g.add(wick, body);
    g.position.set(-3.6 + i * 0.54, 0, 1.6 - i * 0.12);
    world.add(g); candles.push({ g, i, by: 0 });
  });

  // the logo, extruded from the same paths as brand/mark.svg?v=8
  const logo = new THREE.Group();
  const data = new SVGLoader().parse(LOGO);
  const redLogo = new THREE.MeshPhysicalMaterial({ color: 0xff3048, roughness: 0.12, transmission: 0.55, thickness: 2, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0x5a0010, emissiveIntensity: 0.55, attenuationColor: new THREE.Color('#ff2040'), attenuationDistance: 1.5 });
  const whiteLogo = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, transmission: 0.7, emissive: 0x2a2a2e, emissiveIntensity: 0.6, thickness: 2, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.08, attenuationColor: new THREE.Color('#f4e8ea'), attenuationDistance: 4 });
  data.paths.forEach((p) => {
    const isRed = (p.userData?.node?.id || '') === 'r';
    SVGLoader.createShapes(p).forEach((s) => {
      const geo = new THREE.ExtrudeGeometry(s, { depth: 5, bevelEnabled: true, bevelThickness: 1.4, bevelSize: 1.1, bevelSegments: 8, curveSegments: 40 });
      logo.add(new THREE.Mesh(geo, isRed ? redLogo : whiteLogo));
    });
  });
  const box = new THREE.Box3().setFromObject(logo); const ctr = box.getCenter(new THREE.Vector3());
  logo.children.forEach((m) => m.geometry.translate(-ctr.x, -ctr.y, -ctr.z));
  const logoPivot = new THREE.Group(); logoPivot.add(logo);
  logo.scale.set(0.075, -0.075, 0.075); // svg y runs down
  logoPivot.position.set(2.5, 2.55, -2.6); logoPivot.rotation.set(0.05, -0.42, 0);
  world.add(logoPivot);

  // camera framing follows the card's shape
  let aspect = 2;
  const frame = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1; aspect = w / h;
    renderer.setSize(w, h, false); camera.aspect = aspect;
    const z = aspect > 1.6 ? 11 : aspect > 1.1 ? 13 : 16.5;
    camera.position.set(0.2, 3.0, z); camera.lookAt(0.1, 2.25, 0); camera.updateProjectionMatrix();
  };
  frame();
  const ro = new ResizeObserver(() => { frame(); if (!running) renderer.render(scene, camera); }); ro.observe(canvas);

  // pointer parallax
  let tx = 0, ty = 0, px = 0, py = 0;
  const onMove = (e) => { const r = canvas.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2; };
  canvas.parentElement.addEventListener('pointermove', onMove);
  canvas.parentElement.addEventListener('pointerleave', () => { tx = 0; ty = 0; });

  let running = false, raf = 0, t0 = 0;
  const pose = (t) => {
    const s = t / 1000;
    candles.forEach((c) => {
      const k = reduced ? 1 : easeOut((s - 0.15 - c.i * 0.09) / 0.7);
      c.g.scale.set(1, Math.max(0.001, k), 1);
      c.g.position.y = reduced ? 0 : Math.sin(s * 1.1 + c.i * 0.6) * 0.035;
    });
    const lk = reduced ? 1 : easeOut((s - 0.5) / 1.1);
    logoPivot.position.y = 2.75 + (reduced ? 0 : Math.sin(s * 0.8) * 0.09) - (1 - lk) * 0.6;
    logo.rotation.y = reduced ? 0 : Math.sin(s * 0.45) * 0.16;
    redLogo.opacity = whiteLogo.opacity = 1;
    logoPivot.scale.setScalar(0.85 + lk * 0.15);
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    world.rotation.y = px * 0.14; world.rotation.x = py * 0.05;
  };
  const loop = (t) => { if (!t0) t0 = t; pose(t - t0); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
  const play = () => { if (running || reduced) return; running = true; raf = requestAnimationFrame(loop); };
  const pause = () => { running = false; cancelAnimationFrame(raf); };

  if (reduced) { pose(99999); renderer.render(scene, camera); }
  const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : pause()), { rootMargin: '80px' });
  io.observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : canvas.getBoundingClientRect().top < innerHeight && play()));
  return { play, pause };
}
