// Glass logo and floating glass candlesticks in a studio lit from the top left.
// Loaded on demand by home.js when the stage gets near the viewport. (scene v4)
import * as THREE from '../vendor/three/three.module.min.js';
import { SVGLoader } from '../vendor/three/SVGLoader.js';

const BG = 0x080808; // page background, so the stage melts into the section
const LIGHT = new THREE.Vector3(-7, 10, 6); // the big soft box everything is lit by

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<path id="r" d="M44.75 12.5a4.5 4.5 0 0 1 0 9H26.75a3 3 0 0 0 0 6H33.75L26.75 36.5a12 12 0 0 1 0 -24Z"/>
<path id="w" d="M19.25 51.5a4.5 4.5 0 0 1 0 -9H37.25a3 3 0 0 0 0 -6H30.25L37.25 27.5a12 12 0 0 1 0 24Z"/></svg>`;

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function blobTex(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#ffffff88'); gr.addColorStop(0.7, '#ffffff22'); gr.addColorStop(1, '#ffffff00');
  g.fillStyle = gr; g.fillRect(0, 0, size, size); return new THREE.CanvasTexture(c);
}

// rounded-edge cylinder made by spinning a profile
function roundedCylinder(r, h, b) {
  const pts = [new THREE.Vector2(0, -h / 2)];
  const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= 10; i++) { const a = a0 + ((a1 - a0) * i) / 10; pts.push(new THREE.Vector2(cx + Math.cos(a) * b, cy + Math.sin(a) * b)); } };
  arc(r - b, -h / 2 + b, -Math.PI / 2, 0); arc(r - b, h / 2 - b, 0, Math.PI / 2); pts.push(new THREE.Vector2(0, h / 2));
  return new THREE.LatheGeometry(pts, 64);
}

// what the glass reflects: one big soft box top left, a faint red kicker right, a thin back line
function studio(renderer) {
  const env = new THREE.Scene(); env.background = new THREE.Color(0x020202);
  const box = (w, h, color, k, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 1.5, 0); env.add(m);
  };
  box(7, 7, 0xffffff, 9, [LIGHT.x, LIGHT.y, LIGHT.z]);
  box(2, 4, 0xffffff, 2.5, [-9, 2, -2]);
  box(0.5, 8, 0xff2a40, 2.2, [9, 3, 2]);
  box(16, 0.35, 0xffffff, 2, [0, 5, -10]);
  const pm = new THREE.PMREMGenerator(renderer); const tex = pm.fromScene(env, 0.01).texture; pm.dispose(); return tex;
}

// one continuous floor-and-wall (no horizon seam), lit by a warm pool high on the left
function cyclorama() {
  const g = new THREE.PlaneGeometry(70, 1, 1, 120); const p = g.attributes.position;
  const Lf = 24, r = 4, arcL = (Math.PI / 2) * r, Hw = 28, T = Lf + arcL + Hw;
  for (let i = 0; i < p.count; i++) {
    const s = (p.getY(i) + 0.5) * T; let y, z;
    if (s < Lf) { y = 0; z = 14 - s; }
    else if (s < Lf + arcL) { const a = (s - Lf) / r; z = 14 - Lf - Math.sin(a) * r; y = r - Math.cos(a) * r; }
    else { z = 14 - Lf - r; y = r + (s - Lf - arcL); }
    p.setXYZ(i, p.getX(i), y, z);
  }
  g.computeVertexNormals();
  const m = new THREE.ShaderMaterial({
    depthWrite: false,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW;
      float g(vec3 p, vec3 c, vec3 s){ vec3 d = (p - c) / s; return exp(-dot(d, d)); }
      void main(){
        vec3 col = vec3(0.031);
        col += vec3(0.62, 0.56, 0.58) * g(vW, vec3(-4.5, 7.5, -12.0), vec3(8.0, 6.5, 6.0));   // soft box glow on the wall, top left
        col += vec3(0.30, 0.03, 0.06) * g(vW, vec3(3.5, 2.5, -11.0), vec3(10.0, 6.0, 6.0));   // red falloff to the right
        col += vec3(0.10, 0.09, 0.09) * g(vW, vec3(-1.5, 0.0, -4.0), vec3(7.0, 0.6, 3.5));    // sheen on the floor behind the glass
        col *= 1.0 - smoothstep(2.0, 11.0, vW.z) * 0.85;                                      // floor darkens toward the viewer
        gl_FragColor = vec4(max(col, vec3(0.031)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = -1; return mesh;
}

// reflection material: soft, slightly rough and fading out within a short distance of the floor
function reflMat(color, opacity) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0, transparent: true, opacity, depthWrite: false, emissive: color, emissiveIntensity: 0.25 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWy;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvWy = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWy;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= pow(smoothstep(-1.5, 0.0, vWy), 2.2);');
  };
  return m;
}

export function mount(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene(); scene.background = new THREE.Color(BG);
  scene.environment = studio(renderer); scene.environmentIntensity = 1.5;
  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 100);

  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.copy(LIGHT); scene.add(key);

  // glass
  const glass = (o) => new THREE.MeshPhysicalMaterial({ metalness: 0, roughness: 0.03, transmission: 1, ior: 1.52, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, envMapIntensity: 1.5, ...o });
  const mBull = glass({ color: 0xff4a60, thickness: 0.9, attenuationColor: new THREE.Color('#ff1a38'), attenuationDistance: 0.6 });
  const mBear = glass({ color: 0xffffff, transmission: 0.82, roughness: 0.38, thickness: 1.2, ior: 1.5, attenuationColor: new THREE.Color('#ffffff'), attenuationDistance: 6, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0x6a6a70, emissiveIntensity: 1, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color('#ffffff') });
  const mWick = glass({ color: 0xffffff, thickness: 0.1, roughness: 0.05, emissive: 0x888888, emissiveIntensity: 0.5 });
  const mRed = glass({ color: 0xff3a52, thickness: 1.4, attenuationColor: new THREE.Color('#e0102e'), attenuationDistance: 0.7 });
  const mClear = glass({ color: 0xffffff, transmission: 0.82, roughness: 0.34, thickness: 1.6, ior: 1.5, attenuationColor: new THREE.Color('#ffffff'), attenuationDistance: 6, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0x6e6e74, emissiveIntensity: 1, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color('#ffffff') });

  const root = new THREE.Group(); scene.add(root);  // pointer parallax spins this (around y only, so the mirror stays true)
  root.add(cyclorama());
  const world = new THREE.Group(); root.add(world);

  // logo: glass slab with flat chamfered edges, standing on the floor, leaning back a touch
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

  // candles float in front of the logo: different sizes, heights and depths, each on its own rhythm
  // [bull, body, upper wick, lower wick, size, x, clearance above the floor, z]
  const SPEC = [
    [1, 0.9, 0.35, 0.25, 1.0, -2.75, 0.45, 1.0], [0, 1.0, 0.3, 0.35, 1.05, -1.95, 1.0, 0.15],
    [1, 1.4, 0.3, 0.4, 1.25, -1.0, 0.55, 1.25], [0, 0.4, 0.3, 0.25, 0.78, -0.15, 1.75, 0.1],
    [1, 0.75, 0.25, 0.45, 0.95, 0.7, 1.1, 0.95], [0, 1.35, 0.35, 0.3, 1.25, 1.55, 0.7, 0.55],
    [1, 1.7, 0.4, 0.3, 1.4, 2.5, 0.95, 1.35], [0, 0.6, 0.3, 0.4, 0.9, 3.4, 1.9, 0.45],
  ];
  const R = 0.3, candles = [];
  SPEC.forEach(([up, body, wu, wd, sz, x, clear, z], i) => {
    const g = new THREE.Group(); const r = R * sz, bh = body * sz, top = bh / 2 + wu * sz, bot = bh / 2 + wd * sz;
    const bodyM = new THREE.Mesh(roundedCylinder(r, bh, Math.min(0.12, bh * 0.3)), up ? mBull : mBear);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * sz, 0.03 * sz, top + bot, 16), mWick); wick.position.y = (top - bot) / 2;
    g.add(wick, bodyM);
    const h = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1; // fixed per-candle randomness
    g.userData = { up: !!up, sz, x, z, y: clear + bot, sp: 0.35 + h(1) * 0.75, ph: h(2) * 6.28, amp: 0.07 + h(3) * 0.17, tilt: 0.03 + h(4) * 0.07, sway: 0.02 + h(5) * 0.06, low: -bot };
    g.position.set(x, g.userData.y, z);
    world.add(g); candles.push(g);
  });

  // reflection: a mirrored twin in soft, fading materials (not a crisp copy)
  const RM = new Map([[mRed, reflMat(0xff2a40, 0.55)], [mClear, reflMat(0xd6d6dc, 0.4)], [mBull, reflMat(0xff2a40, 0.5)], [mBear, reflMat(0xd6d6dc, 0.35)], [mWick, reflMat(0xffffff, 0.25)]]);
  const mirror = world.clone(); mirror.scale.y = -1; root.add(mirror);
  mirror.traverse((o) => { if (o.isMesh) o.material = RM.get(o.material) || o.material; });
  const pairs = []; world.traverse((o) => pairs.push(o)); const twins = []; mirror.traverse((o) => twins.push(o));

  // light that passes through the glass lands on the floor down and to the right of each piece
  const blob = blobTex();
  const spill = (color, w, d, op) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blob, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.rotation.set(-Math.PI / 2, 0, -0.2); m.renderOrder = 2; root.add(m); return m;
  };
  const logoSpillR = spill(0xff2040, 4.2, 1.5, 0.5); logoSpillR.position.set(0.6, 0.012, -0.4);
  const logoSpillW = spill(0xffe6ea, 3.4, 1.2, 0.22); logoSpillW.position.set(0.9, 0.011, 0.5);
  candles.forEach((g) => { const z = g.userData.sz; g.userData.spill = spill(g.userData.up ? 0xff2040 : 0xffffff, 1.5 * z, 1.3 * z, 0.3); });

  // framing: on wide screens the scene sits right of the heading; on narrow ones it is centred
  const frame = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1, a = w / h; renderer.setSize(w, h, false); camera.aspect = a;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(12.5, 8.6 / (2 * tanH * a));
    camera.position.set(0.4, 4.3, dist); camera.lookAt(0.4, 2.15, 0); camera.updateProjectionMatrix();
    const visW = 2 * dist * tanH * a; root.position.x = a > 1.5 ? Math.min(visW * 0.2, 5) : 0;
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
      g.position.x = u.x + (reduced ? 0 : Math.sin(s * u.sp * 0.45 + u.ph * 1.3) * u.sway);
      g.rotation.z = reduced ? 0 : Math.sin(s * u.sp * 0.7 + u.ph) * u.tilt; g.rotation.x = reduced ? 0 : Math.cos(s * u.sp * 0.55 + u.ph * 0.7) * u.tilt * 0.7;
      g.scale.setScalar(Math.max(0.001, 0.6 + 0.4 * k)); g.visible = k > 0.01;
      // spill: offset away from the light, wider and fainter the higher the candle floats
      const lift = g.position.y + u.low * g.scale.y; const sp = u.spill;
      sp.position.set(g.position.x + 0.25 + lift * 0.15, 0.013, g.position.z + 0.35);
      sp.scale.setScalar(1 + lift * 0.2); sp.material.opacity = (u.up ? 0.32 : 0.12) * k / (1 + lift * 0.5);
    });
    const lk = reduced ? 1 : easeOut((s - 0.1) / 1.2);
    logoPivot.rotation.y = 0.45 + (reduced ? 0 : Math.sin(s * 0.35) * 0.05) - (1 - lk) * 0.4;
    logoSpillR.material.opacity = 0.5 * lk; logoSpillW.material.opacity = 0.22 * lk;
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
