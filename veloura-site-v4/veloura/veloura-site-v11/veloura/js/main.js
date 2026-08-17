import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeGradientEnv, makeShadowTexture } from './model.js';
import { VARIETIES, SIZES } from './varieties.js';
import { FLAVOURS, FLAVOUR_BY_ID } from './flavours.js';

const canvas = document.getElementById('scene');
const wrap = document.querySelector('.canvas-wrap');
const tooltipEl = document.getElementById('tooltip');
const hotspotsEl = document.getElementById('hotspots');

/* ---------------- WebGL guard ---------------- */
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}
if (!webglOK()) {
  document.getElementById('webgl-fallback').hidden = false;
  canvas.style.display = 'none';
  document.body.dataset.ready = '1';
  throw new Error('WebGL unavailable');
}

/* ---------------- Renderer / scene ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.environment = makeGradientEnv(renderer);
scene.environmentIntensity = 0.85;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 1.0, 9.6);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 5.2;
controls.maxDistance = 15;
controls.minPolarAngle = Math.PI * 0.16;
controls.maxPolarAngle = Math.PI * 0.62;
controls.enableZoom = false; // manual, so the page can still scroll
controls.autoRotate = true;
controls.autoRotateSpeed = 0.9;
controls.target.set(0, 0.25, 0);

/* ---------------- Lighting ---------------- */
scene.add(new THREE.AmbientLight(0xFFF3E2, 0.4));

const key = new THREE.DirectionalLight(0xFFF6E8, 2.5);
key.position.set(2.0, 9.4, 3.6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1; key.shadow.camera.far = 26;
key.shadow.camera.left = -7; key.shadow.camera.right = 7;
key.shadow.camera.top = 9; key.shadow.camera.bottom = -7;
key.shadow.bias = -0.0009;
key.shadow.radius = 4;
scene.add(key);

const rimLight = new THREE.DirectionalLight(0xFFD9A6, 2.1);
rimLight.position.set(-5, 3.4, -4.6);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xE9F0FF, 0.8);
fillLight.position.set(-3.5, 1.2, 5.5);
scene.add(fillLight);

const bounce = new THREE.PointLight(0xF6CFA0, 14, 20, 2);
bounce.position.set(0.4, -3.2, 5.2);
scene.add(bounce);

/* ---------------- Stage rig ---------------- */
const GROUND = -2.2;
const pivot = new THREE.Group();
scene.add(pivot);

const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(5.6, 5.6),
  new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false, opacity: 0.95 })
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = GROUND - 0.015;
shadowPlane.renderOrder = -1;
scene.add(shadowPlane);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), new THREE.ShadowMaterial({ opacity: 0.12 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = GROUND - 0.02;
floor.receiveShadow = true;
scene.add(floor);

/* ---------------- State ---------------- */
let varietyId = 'cone';
let flavourId = 'vanilla';
let sizeId = 'regular';

let current = null;           // { group, meshes, hotspots, fit }
let hoverTargets = [];
let tintTargets = { base: [], swirl: [], accent: [] };
const tw = { base: new THREE.Color(), swirl: new THREE.Color(), accent: new THREE.Color(), tBase: new THREE.Color(), tSwirl: new THREE.Color(), tAccent: new THREE.Color() };

const variety = () => VARIETIES.find((v) => v.id === varietyId) || VARIETIES[0];
const flavour = () => FLAVOUR_BY_ID[flavourId] || FLAVOURS[0];
const size = () => SIZES.find((s) => s.id === sizeId) || SIZES[1];

/* ---------------- Build / dispose ---------------- */
function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m && m.dispose());
    }
  });
}

function collect(group) {
  hoverTargets = [];
  tintTargets = { base: [], swirl: [], accent: [] };
  group.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    if (o.userData && o.userData.label) hoverTargets.push(o);
    const t = o.userData && o.userData.tint;
    if (t && tintTargets[t]) tintTargets[t].push(o);
  });
}

function buildHotspots(list) {
  hotspotsEl.innerHTML = '';
  return list.map((h) => {
    const el = document.createElement('div');
    el.className = 'hotspot';
    el.innerHTML = `<span class="pin">${h.n}</span><span class="hs-label">${h.label}</span>`;
    hotspotsEl.appendChild(el);
    return { ...h, el, world: new THREE.Vector3() };
  });
}

let HOTSPOTS = [];

function buildModel() {
  const v = variety();
  const f = flavour();
  const s = size();
  const ctx = {
    renderer,
    scoops: s.scoops,
    sizeId: s.id,
    f: {
      name: f.name.replace(/ \(.*\)$/, ''),
      base: f.base, swirl: f.swirl, sheen: f.sheen, accent: f.base,
      accentHex: f.accentHex, note: f.note, tag: (f.tag || '').toUpperCase(),
      inclusionName: f.inclusionName, swirlName: f.swirlName,
    },
  };
  const built = v.build(ctx);
  const g = built.group;

  // auto-fit: scale so the piece fills the stage, then plant it on the shadow plane
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  const sizeV = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const targetH = 4.5;
  const targetW = 4.2;
  let k = Math.min(targetH / Math.max(0.001, sizeV.y), targetW / Math.max(0.001, Math.max(sizeV.x, sizeV.z)));
  k *= s.scale;
  if (!isFinite(k) || k <= 0) k = 1; // guard: never let a bad bound poison the camera
  if (!isFinite(center.x) || !isFinite(center.y) || !isFinite(center.z)) center.set(0, 0, 0);
  if (!isFinite(box.min.y)) box.min.y = 0;
  const holder = new THREE.Group();
  holder.add(g);
  g.scale.setScalar(k);
  g.position.set(-center.x * k, GROUND - box.min.y * k, -center.z * k);
  pivot.add(holder);

  collect(g);
  HOTSPOTS = buildHotspots(built.hotspots || []);
  HOTSPOTS.forEach((h) => h.pos.multiplyScalar(1)); // local coords, converted via g.localToWorld

  // colour targets
  tw.tBase.set(f.base); tw.tSwirl.set(f.swirl); tw.tAccent.set(f.base);
  tw.base.copy(tw.tBase); tw.swirl.copy(tw.tSwirl); tw.accent.copy(tw.tAccent);
  applyTint(1);

  const footprint = Math.max(sizeV.x, sizeV.z) * k;
  const height = sizeV.y * k;
  shadowPlane.scale.setScalar(Math.max(0.55, footprint / 3.4));
  current = { holder, model: g, fit: { k, height, footprint, centerY: GROUND + height / 2 } };
  return current;
}

function applyTint(alpha) {
  tintTargets.base.forEach((m) => { if (m.material && m.material.color) m.material.color.lerp(tw.base, alpha); });
  tintTargets.swirl.forEach((m) => { if (m.material && m.material.color) m.material.color.lerp(tw.swirl, alpha); });
  tintTargets.accent.forEach((m) => { if (m.material && m.material.color) m.material.color.lerp(tw.accent, alpha); });
}

/* transition state */
let transition = null; // {phase:'out'|'in', t}

function rebuild(immediate) {
  if (!current) { buildModel(); modelScaleSpring = 1; return; }
  if (immediate) {
    const old = current;
    pivot.remove(old.holder);
    disposeGroup(old.holder);
    buildModel();
    modelScaleSpring = 1;
    return;
  }
  transition = { phase: 'out', t: 0, start: performance.now() };
}

let modelScaleSpring = 1;

function finishSwap() {
  const old = current;
  pivot.remove(old.holder);
  disposeGroup(old.holder);
  buildModel();
  transition = { phase: 'in', t: 0, start: performance.now() };
  modelScaleSpring = 0.6;
}

/* ---------------- Public API (called by ui.js) ---------------- */
export function setVariety(id) {
  if (id === varietyId) return;
  varietyId = id;
  rebuild(false);
  idleTimer = 0;
  window.dispatchEvent(new CustomEvent('veloura:dismiss'));
}
export function setSize(id) {
  if (id === sizeId) return;
  sizeId = id;
  rebuild(false);
  idleTimer = 0;
}
export function setFlavour(id) {
  if (!FLAVOUR_BY_ID[id]) return;
  const structural = varietyId === 'tub'; // printed label has to be re-rendered
  flavourId = id;
  const f = flavour();
  tw.tBase.set(f.base); tw.tSwirl.set(f.swirl); tw.tAccent.set(f.base);
  if (structural) rebuild(false);
  else relabel();
  idleTimer = 0;
}
function relabel() {
  const f = flavour();
  const short = f.name.replace(/ \(.*\)$/, '');
  hoverTargets.forEach((m) => {
    const u = m.userData;
    if (!u) return;
    if (u.tint === 'base' && /Scoop|Layer|Gelato|Kulfi|Bar|Slab|Mochi|Shake|Surface/.test(u.label)) {
      u.label = u.label.replace(/^.*?(Scoop|Layer|Gelato|Kulfi|Bar|Slab|Mochi|Shake|Surface)/, `${short} $1`);
      u.body = f.note;
    }
  });
}
export function getState() { return { varietyId, flavourId, sizeId }; }
window.Veloura = {
  setVariety, setSize, setFlavour, getState, VARIETIES, SIZES, FLAVOURS,
  _debug: () => {
    const info = { hasCurrent: !!current, pivotChildren: pivot.children.length, scrollProg, stageVisible };
    if (current) {
      const b = new THREE.Box3().setFromObject(current.holder);
      info.box = { min: b.min.toArray().map(n => +n.toFixed(2)), max: b.max.toArray().map(n => +n.toFixed(2)) };
      info.fit = current.fit;
      let n = 0, opac = [];
      current.holder.traverse((o) => { if (o.isMesh) { n++; if (opac.length < 4) opac.push(+o.material.opacity.toFixed(2)); } });
      info.meshes = n; info.opacity = opac;
    }
    info.cam = camera.position.toArray().map(n => +n.toFixed(2));
    info.target = controls.target.toArray().map(n => +n.toFixed(2));
    return info;
  },
};

/* ---------------- Particle burst ---------------- */
const BURST = 90;
const burstMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.045, 10, 8),
  new THREE.MeshPhysicalMaterial({ color: 0xE0A83C, roughness: 0.3, clearcoat: 1, metalness: 0 }),
  BURST
);
burstMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BURST * 3), 3);
burstMesh.frustumCulled = false;
burstMesh.visible = false;
scene.add(burstMesh);
const bp = [];
for (let i = 0; i < BURST; i++) bp.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, spin: new THREE.Vector3() });
const _d = new THREE.Object3D();

function burstAt(worldPos) {
  const f = flavour();
  const cols = [f.base, f.swirl, 0xFFF6E0, 0xE0A83C, 0x2A1E17];
  burstMesh.visible = true;
  for (let i = 0; i < BURST; i++) {
    const p = bp[i];
    p.pos.copy(worldPos);
    const u = Math.random() * Math.PI * 2, w = Math.acos(2 * Math.random() - 1);
    const s = 2.4 + Math.random() * 3.0;
    p.vel.set(Math.sin(w) * Math.cos(u), Math.abs(Math.cos(w)) * 1.5 + 1.2, Math.sin(w) * Math.sin(u)).multiplyScalar(s * 0.5);
    p.life = 1;
    p.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
    burstMesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  }
  if (burstMesh.instanceColor) burstMesh.instanceColor.needsUpdate = true;
}
function updateBurst(dt) {
  if (!burstMesh.visible) return;
  let alive = 0;
  for (let i = 0; i < BURST; i++) {
    const p = bp[i];
    if (p.life <= 0) { _d.scale.setScalar(0.0001); _d.position.set(0, -999, 0); _d.updateMatrix(); burstMesh.setMatrixAt(i, _d.matrix); continue; }
    alive++;
    p.life -= dt * 0.62;
    p.vel.y -= 9.2 * dt;
    p.vel.multiplyScalar(1 - 1.1 * dt);
    p.pos.addScaledVector(p.vel, dt);
    if (p.pos.y < GROUND + 0.04) { p.pos.y = GROUND + 0.04; p.vel.y *= -0.42; p.vel.x *= 0.7; p.vel.z *= 0.7; }
    _d.position.copy(p.pos);
    _d.rotation.set(p.pos.x * p.spin.x, p.pos.y * p.spin.y, p.pos.z * p.spin.z);
    _d.scale.setScalar(Math.max(0.001, Math.min(1, p.life * 1.6)));
    _d.updateMatrix();
    burstMesh.setMatrixAt(i, _d.matrix);
  }
  burstMesh.instanceMatrix.needsUpdate = true;
  if (!alive) burstMesh.visible = false;
}

/* ---------------- Raycasting / hover ---------------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInside = false;
let hovered = null;
let idleTimer = 0;

function updatePointer(e) {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  tooltipEl.style.left = (e.clientX - r.left) + 'px';
  tooltipEl.style.top = (e.clientY - r.top) + 'px';
  pointerInside = true;
}
function pick() {
  if (!hoverTargets.length) return null;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(hoverTargets, false);
  if (!hits.length) return null;
  return { obj: hits[0].object, point: hits[0].point };
}
const hoverState = new Map();
function setHover(target) {
  if (hovered === target) return;
  hovered = target;
  if (target && target.userData.label) {
    tooltipEl.textContent = target.userData.label;
    tooltipEl.classList.add('is-on');
    canvas.classList.add('is-hot');
  } else {
    tooltipEl.classList.remove('is-on');
    tooltipEl.textContent = '';
    canvas.classList.remove('is-hot');
  }
}

canvas.addEventListener('pointermove', (e) => {
  updatePointer(e);
  idleTimer = 0;
  setHover(pick()?.obj || null);
}, { passive: true });
canvas.addEventListener('pointerleave', () => { pointerInside = false; setHover(null); });
canvas.addEventListener('pointerdown', (e) => {
  updatePointer(e);
  canvas.classList.add('is-grabbing');
  idleTimer = 0;
  controls.autoRotate = false;
});
window.addEventListener('pointerup', () => canvas.classList.remove('is-grabbing'));

const bounceTargets = new Map();
let downPos = null;
canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 8) return;
  updatePointer(e);
  const hit = pick();
  if (!hit) { window.dispatchEvent(new CustomEvent('veloura:dismiss')); setHover(null); return; }
  bounceTargets.set(hit.obj, { t: 0, base: hit.obj.scale.clone(), baseY: hit.obj.position.y });
  burstAt(hit.point.clone());
  window.dispatchEvent(new CustomEvent('veloura:info', { detail: hit.obj.userData }));
});

/* ---------------- Manual zoom ---------------- */
const activePointers = new Map();
let pinchPrev = null;
let userZoom = 0;

canvas.addEventListener('wheel', (e) => {
  updatePointer(e);
  const hit = pick();
  if (!hit) { e.preventDefault(); window.scrollBy({ top: e.deltaY, behavior: 'auto' }); return; }
  e.preventDefault();
  zoomBy(e.deltaY * 0.0022);
}, { passive: false });
canvas.addEventListener('pointerdown', (e) => activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointermove', (e) => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2) {
    const [a, b] = [...activePointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchPrev !== null) zoomBy((pinchPrev - d) * 0.008);
    pinchPrev = d;
  }
});
function endPointer(e) { activePointers.delete(e.pointerId); if (activePointers.size < 2) pinchPrev = null; }
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', endPointer);
function zoomBy(amount) {
  userZoom = Math.max(-2.2, Math.min(3.6, userZoom + amount));
  idleTimer = 0;
  controls.autoRotate = false;
}

/* ---------------- Hotspots ---------------- */
function updateHotspots() {
  if (!current) return;
  const r = canvas.getBoundingClientRect();
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  for (const h of HOTSPOTS) {
    h.world.copy(h.pos);
    current.model.localToWorld(h.world);
    const v = h.world.clone().project(camera);
    const x = (v.x * 0.5 + 0.5) * r.width;
    const y = (-v.y * 0.5 + 0.5) * r.height;
    const toCam = h.world.clone().sub(camera.position).normalize();
    const facing = toCam.dot(camDir);
    const behind = v.z > 1;
    const off = behind || facing < 0.55 || transition;
    h.el.style.left = x + 'px';
    h.el.style.top = y + 'px';
    h.el.style.opacity = off ? 0 : 1;
    h.el.style.pointerEvents = off ? 'none' : 'auto';
  }
}

/* ---------------- Scroll-driven camera ---------------- */
let scrollProg = 0;
let stageVisible = true;
const stageEl = document.getElementById('stage');
const studioEl = document.getElementById('studio');
function onScroll() {
  const studioBottom = studioEl.getBoundingClientRect().bottom;
  const nowVisible = studioBottom > 40;
  if (nowVisible !== stageVisible) {
    stageVisible = nowVisible;
    stageEl.classList.toggle('is-away', !stageVisible);
  }
  const range = Math.max(1, studioEl.offsetTop + studioEl.offsetHeight - window.innerHeight);
  scrollProg = Math.min(1, Math.max(0, window.scrollY / range));
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------------- Resize ---------------- */
function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const wide = w > 900;
  camera.setViewOffset(w, h, wide ? -w * 0.2 : 0, 0, w, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ---------------- First build ---------------- */
buildModel();
document.body.dataset.ready = '1';

/* ---------------- Render loop ---------------- */
let visible = true;
document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
let last = performance.now();
let elapsed = 0;

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  if (!visible || !stageVisible) { last = now; return; }
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  elapsed += dt;

  /* variety cross-fade */
  if (transition) {
    transition.t = (performance.now() - transition.start) / 1000;
    if (transition.phase === 'out') {
      const p = Math.min(1, transition.t / 0.22);
      modelScaleSpring = 1 - p * 0.45;
      setOpacity(1 - p);
      if (p >= 1) finishSwap();
    } else {
      const p = Math.min(1, transition.t / 0.5);
      const spring = 1 - Math.exp(-p * 7) * Math.cos(p * 9) * 0.4 - (1 - p) * 0.12;
      modelScaleSpring = 0.6 + (spring - 0.6) * 1;
      setOpacity(Math.min(1, p * 2));
      if (p >= 1) { transition = null; modelScaleSpring = 1; setOpacity(1); }
    }
  }
  if (current) current.holder.scale.setScalar(modelScaleSpring);

  /* colour tweening */
  const a = 1 - Math.pow(0.002, dt);
  tw.base.lerp(tw.tBase, a); tw.swirl.lerp(tw.tSwirl, a); tw.accent.lerp(tw.tAccent, a);
  applyTint(Math.min(1, dt * 6));

  /* hover squish + emissive */
  for (const m of hoverTargets) {
    const st = hoverState.get(m) || { t: 0 };
    const want = hovered === m ? 1 : 0;
    st.t += (want - st.t) * Math.min(1, dt * 9);
    hoverState.set(m, st);
    if (m.material && !Array.isArray(m.material) && 'emissiveIntensity' in m.material) {
      m.material.emissiveIntensity = st.t * 0.22;
    }
    if (m.userData.part === 'scoop' || m.userData.part === 'mochi' || m.userData.part === 'spade') {
      if (!bounceTargets.has(m)) m.scale.set(1 + st.t * 0.06, 1 - st.t * 0.05, 1 + st.t * 0.06);
    }
  }

  /* click bounce */
  for (const [obj, s] of bounceTargets) {
    s.t += dt;
    const k = Math.exp(-s.t * 5.5) * Math.sin(s.t * 22);
    obj.scale.set(s.base.x * (1 + k * 0.1), s.base.y * (1 - k * 0.16), s.base.z * (1 + k * 0.1));
    if (s.t > 1.6) { obj.scale.copy(s.base); bounceTargets.delete(obj); }
  }

  updateBurst(dt);

  idleTimer += dt;
  if (idleTimer > 2.6 && !controls.autoRotate) controls.autoRotate = true;

  /* scroll-driven camera */
  const focusY = current ? current.fit.centerY + 0.15 : 0.25;
  const targetY = focusY - scrollProg * 0.45;
  controls.target.y += (targetY - controls.target.y) * Math.min(1, dt * 2.4);
  const dir = camera.position.clone().sub(controls.target);
  const cur = dir.length();
  const fitDist = current ? 3.1 + Math.max(current.fit.height, current.fit.footprint * 0.95) * 1.45 : 9.6;
  const baseDist = fitDist + Math.sin(scrollProg * Math.PI) * 1.4 - scrollProg * 0.5;
  const targetDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, baseDist + userZoom));
  const next = cur + (targetDist - cur) * Math.min(1, dt * 4.5);
  camera.position.copy(controls.target).add(dir.setLength(next));
  pivot.rotation.y += ((scrollProg * Math.PI * 0.9) - pivot.rotation.y) * Math.min(1, dt * 1.8);
  if (current) {
    current.holder.position.y = Math.sin(elapsed * 0.9) * 0.035;
    shadowPlane.position.y = GROUND - 0.015;
  }

  controls.update();
  if (hovered && !pointerInside) tooltipEl.classList.remove('is-on');
  updateHotspots();
  renderer.render(scene, camera);
}

function setOpacity(o) {
  if (!current) return;
  current.model.traverse((m) => {
    if (!m.material || Array.isArray(m.material)) return;
    if (o >= 1) { m.material.opacity = m.userData.__op ?? 1; m.material.transparent = m.userData.__tr ?? m.material.transparent; return; }
    if (m.userData.__op === undefined) { m.userData.__op = m.material.opacity; m.userData.__tr = m.material.transparent; }
    m.material.transparent = true;
    m.material.opacity = (m.userData.__op ?? 1) * o;
  });
}

tick();

window.addEventListener('veloura:refocus', () => { controls.autoRotate = false; idleTimer = 0; });
