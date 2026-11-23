// Glass logo and floating glass candlesticks in a studio lit from the top left.
// Loaded on demand by home.js when the stage gets near the viewport. (scene v11)
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
  box(0.9, 12, 0xffffff, 7, [-5.5, 3, 9]);   // tall strip front left: the bright stripe down each candle
  box(0.45, 12, 0xffe8ec, 3.5, [6.5, 3, 8]); // thinner strip front right: the rim on the other side
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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: location.hash === '#snap3d' });
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
  // candle glass: clear in the middle so the wick shows through, deepening to a dark tinted rim at the
  // edges (where light travels through more glass), strong refraction, slight rainbow at the edges
  const edgeGlass = (o, edge, power) => {
    const m = glass(o); const uEdge = { value: new THREE.Color(edge) };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uEdge = uEdge;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uEdge;')
        .replace('#include <transmission_fragment>', `#include <transmission_fragment>
        float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), ${power.toFixed(2)});
        totalDiffuse *= mix(vec3(1.0), uEdge, rim);`);
    };
    m.customProgramCacheKey = () => 'edge' + edge + power; return m;
  };
  const mBull = edgeGlass({ color: 0xff8a98, roughness: 0, thickness: 1.6, ior: 1.5, dispersion: 0.3, attenuationColor: new THREE.Color('#ff2a44'), attenuationDistance: 2.2, envMapIntensity: 2.4 }, 0x3a0008, 1.6);
  const mBear = edgeGlass({ color: 0xffffff, roughness: 0.015, thickness: 1.6, ior: 1.5, dispersion: 0.45, attenuationColor: new THREE.Color('#e6ecf6'), attenuationDistance: 2.2, envMapIntensity: 2.6, emissive: 0x08080a }, 0x1a1c22, 1.8);
  // wick: a clear glass rod outside the body; inside the body a solid core, so the rod still reads through the glass
  const mWick = glass({ color: 0xffffff, roughness: 0, thickness: 0.08, ior: 1.5, envMapIntensity: 3.2, emissive: 0x16161a, emissiveIntensity: 1 });
  const mCore = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f4, roughness: 0.06, metalness: 0, clearcoat: 1, envMapIntensity: 2, emissive: 0x4a4a50, emissiveIntensity: 1 });
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

  // candles: one rising row along the foot of the logo, sized from the logo's height
  // [bull, body bottom above the first, body height], in units of the logo's height
  const LH = lsz.y * S, LW = lsz.x * S;
  const ROW = [[1, 0, 0.205], [1, 0.062, 0.205], [0, 0.082, 0.178], [1, 0.123, 0.205], [0, 0.116, 0.151], [1, 0.219, 0.295], [0, 0.329, 0.178], [1, 0.39, 0.24]];
  const R = 0.06 * LH, WICK = 0.07 * LH, GAP = 0.15 * LH, candles = [];
  const x0 = -1.3 - LW * 0.36, floorGap = 0.13 * LH;
  ROW.forEach(([up, b0, bh0], i) => {
    const bh = bh0 * LH, bot = bh / 2 + WICK, top = bh / 2 + WICK * 1.1;
    const g = new THREE.Group();
    const bodyM = new THREE.Mesh(roundedCylinder(R, bh, R * 0.2), up ? mBull : mBear);
    const wr = 0.035, inset = bh / 2 - 0.04;
    const wUp = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, top - inset, 16), mWick); wUp.position.y = (top + inset) / 2;
    const wDn = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, bot - inset, 16), mWick); wDn.position.y = -(bot + inset) / 2;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.9, wr * 0.9, inset * 2, 12), mCore);
    g.add(wUp, wDn, core, bodyM);
    const h = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1; // fixed per-candle randomness
    const x = x0 + i * GAP, z = 0.55 - i * 0.12;
    g.userData = { up: !!up, sz: R / 0.3, x, z, y: floorGap + WICK + b0 * LH + bh / 2, sp: 0.45 + h(1) * 0.5, ph: h(2) * 6.28, amp: 0.03 + h(3) * 0.05, tilt: 0.015 + h(4) * 0.025, sway: 0.01 + h(5) * 0.02, low: -bot };
    g.position.set(x, g.userData.y, z);
    world.add(g); candles.push(g);
  });

  // reflection: a mirrored twin in soft, fading materials (not a crisp copy)
  const RM = new Map([[mRed, reflMat(0xff2a40, 0.55)], [mClear, reflMat(0xd6d6dc, 0.4)], [mBull, reflMat(0xff2a40, 0.5)], [mBear, reflMat(0xd6d6dc, 0.35)], [mWick, reflMat(0xffffff, 0.18)], [mCore, reflMat(0xffffff, 0.2)]]);
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
    const visW = 2 * dist * tanH * a; root.position.x = a > 1.5 ? Math.min(visW * 0.2, 5) : 0.7;
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
