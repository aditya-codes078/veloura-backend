/* Veloura — shared procedural geometry/material/texture helpers.
   Everything here is generated at runtime; no external assets. */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- tiny deterministic 3D value noise ---------- */
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function smooth(t) { return t * t * (3 - 2 * t); }
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = smooth(xf), v = smooth(yf), w = smooth(zf);
  let n = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    const wx = i ? u : 1 - u, wy = j ? v : 1 - v, wz = k ? w : 1 - w;
    n += wx * wy * wz * hash3(xi + i, yi + j, zi + k);
  }
  return n * 2 - 1;
}
export function fbm(x, y, z) {
  return noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.12;
}

/* ---------- texture cache (built once, shared, never disposed on swap) ---------- */
const TEX = {};
function cache(key, make) { if (!TEX[key]) TEX[key] = make(); return TEX[key]; }
export function disposeTextureCache() {
  Object.values(TEX).forEach((t) => {
    if (t && t.dispose) t.dispose();
    else if (t && t.map) { t.map.dispose(); t.bump && t.bump.dispose(); }
  });
}

/* ---------- procedural waffle texture ---------- */
export function makeWaffleTexture(renderer) {
  return cache('waffle', () => {
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, '#E7B776');
    grd.addColorStop(0.5, '#D9A055');
    grd.addColorStop(1, '#B87A38');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const a = Math.random() * 0.14;
      g.fillStyle = Math.random() > 0.5 ? `rgba(90,52,20,${a})` : `rgba(255,225,180,${a})`;
      g.fillRect(x, y, 2, 2);
    }
    const cell = S / 16;
    g.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      g.save();
      g.translate(S / 2, S / 2);
      g.rotate(pass ? -Math.PI / 4 : Math.PI / 4);
      g.translate(-S / 2, -S / 2);
      for (let i = -S; i < S * 2; i += cell) {
        g.strokeStyle = 'rgba(96,55,20,0.55)';
        g.lineWidth = cell * 0.16;
        g.beginPath(); g.moveTo(i, -S); g.lineTo(i, S * 2); g.stroke();
        g.strokeStyle = 'rgba(255,229,182,0.4)';
        g.lineWidth = cell * 0.07;
        g.beginPath(); g.moveTo(i + cell * 0.13, -S); g.lineTo(i + cell * 0.13, S * 2); g.stroke();
      }
      g.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (renderer) tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const bump = new THREE.CanvasTexture(c);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(3, 2);
    return { map: tex, bump };
  });
}

/* ---------- procedural cookie texture (crumb + chips) ---------- */
export function makeCookieTexture() {
  return cache('cookie', () => {
    const S = 512, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#3A2317'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 14000; i++) {
      const a = Math.random() * 0.5;
      g.fillStyle = Math.random() > 0.5 ? `rgba(20,10,6,${a})` : `rgba(120,80,52,${a * 0.8})`;
      g.beginPath();
      g.arc(Math.random() * S, Math.random() * S, Math.random() * 3.2, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 70; i++) {
      g.fillStyle = 'rgba(15,8,4,0.85)';
      g.beginPath();
      g.arc(Math.random() * S, Math.random() * S, 5 + Math.random() * 9, 0, 7);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/* ---------- printed tub label (canvas) ---------- */
export function makeTubLabel(flavourName, accentHex) {
  const S = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = S; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#FDF8F0'; g.fillRect(0, 0, S, H);
  g.fillStyle = accentHex || '#E0A83C';
  g.fillRect(0, 0, S, 26); g.fillRect(0, H - 26, S, 26);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(42,30,23,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * S, Math.random() * H, 2, 2);
  }
  g.textAlign = 'center';
  g.fillStyle = '#2A1E17';
  g.font = '700 92px Georgia, serif';
  g.fillText('Veloura', S / 2, 178);
  g.font = '600 30px Helvetica, Arial, sans-serif';
  g.fillStyle = '#B47F22';
  g.fillText('ICE CREAM PARLOUR · KANPUR', S / 2, 226);
  g.font = 'italic 52px Georgia, serif';
  g.fillStyle = '#2A1E17';
  g.fillText(flavourName || 'Madagascar Vanilla', S / 2, 320);
  g.strokeStyle = accentHex || '#E0A83C';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(S * 0.34, 356); g.lineTo(S * 0.66, 356); g.stroke();
  g.font = '500 32px Helvetica, Arial, sans-serif';
  g.fillStyle = '#6B564A';
  g.fillText('1 L · Small batch · Net 540 g', S / 2, 412);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/* ---------- radial contact-shadow texture ---------- */
export function makeShadowTexture() {
  return cache('shadow', () => {
    const S = 512, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(96,62,34,0.55)');
    grd.addColorStop(0.45, 'rgba(96,62,34,0.22)');
    grd.addColorStop(1, 'rgba(96,62,34,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/* ---------- gradient environment map ---------- */
export function makeGradientEnv(renderer) {
  const S = 256, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.42, '#fdf3e4');
  grd.addColorStop(0.6, '#f3ddc4');
  grd.addColorStop(1, '#8d7358');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.ellipse(S * 0.25, S * 0.28, S * 0.13, S * 0.09, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,241,220,0.8)';
  g.beginPath(); g.ellipse(S * 0.75, S * 0.36, S * 0.10, S * 0.07, 0, 0, 7); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

/* =======================================================================
   Geometry factories
   ======================================================================= */

/* hand-scooped sphere */
export function scoopGeometry(radius, seed, detail = 8) {
  const geo = mergeVertices(new THREE.IcosahedronGeometry(radius, detail), 1e-4);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const lobes = fbm(n.x * 2.0 + seed, n.y * 2.0 + seed * 1.7, n.z * 2.0 - seed);
    const fine = fbm(n.x * 7.5 + seed, n.y * 7.5, n.z * 7.5 + seed);
    const swirl = Math.sin(Math.atan2(n.z, n.x) * 3 + n.y * 4 + seed) * 0.035;
    const d = radius * (1 + lobes * 0.11 + fine * 0.035) + swirl * radius;
    v.copy(n).multiplyScalar(d);
    if (v.y < -radius * 0.55) v.y = -radius * 0.55 + (v.y + radius * 0.55) * 0.55;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/* quenelle / spade-scooped gelato lump (flattened, ridged) */
export function quenelleGeometry(r, seed) {
  const geo = scoopGeometry(r, seed, 7);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ridge = Math.sin(v.x * 9 + seed) * 0.035 * r;
    v.y = v.y * 0.66 + ridge;
    v.z *= 0.92;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/* dripping sauce cap */
export function drizzleGeometry(radius, dripAmt = 1) {
  const geo = new THREE.SphereGeometry(radius, 72, 48, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const theta = Math.atan2(n.z, n.x);
    const rim = Math.pow(Math.max(0, 1 - (n.y + 0.1)), 1.6);
    const drips = Math.pow(Math.abs(Math.sin(theta * 4.5 + 0.7)), 6) * 0.55 + Math.pow(Math.abs(Math.sin(theta * 2.3)), 8) * 0.35;
    v.y -= rim * drips * radius * 1.15 * dripAmt;
    v.multiplyScalar(1 + fbm(n.x * 5, n.y * 5, n.z * 5) * 0.02);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/* swept tube along a parametric path with varying radius — soft-serve swirls, straws, spoons */
export function sweepGeometry(path, radiusAt, steps = 120, radial = 24, capEnd = true) {
  const pos = [], idx = [], nrm = [];
  const up = new THREE.Vector3(0, 1, 0);
  const eps = 1e-3;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = path(t);
    const a = path(Math.max(0, t - eps));
    const b = path(Math.min(1, t + eps));
    const tan = b.clone().sub(a).normalize();
    let n1 = new THREE.Vector3().crossVectors(tan, up);
    if (n1.lengthSq() < 1e-6) n1 = new THREE.Vector3(1, 0, 0);
    n1.normalize();
    const n2 = new THREE.Vector3().crossVectors(n1, tan).normalize();
    const r = radiusAt(t);
    for (let j = 0; j < radial; j++) {
      const a2 = (j / radial) * Math.PI * 2;
      const dir = n1.clone().multiplyScalar(Math.cos(a2)).add(n2.clone().multiplyScalar(Math.sin(a2)));
      pos.push(p.x + dir.x * r, p.y + dir.y * r, p.z + dir.z * r);
      nrm.push(dir.x, dir.y, dir.z);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  if (capEnd) {
    const tip = path(1);
    const tipIdx = pos.length / 3;
    pos.push(tip.x, tip.y, tip.z);
    const tan = path(1).clone().sub(path(1 - eps)).normalize();
    nrm.push(tan.x, tan.y, tan.z);
    for (let j = 0; j < radial; j++) {
      const a = steps * radial + j;
      const b = steps * radial + ((j + 1) % radial);
      idx.push(a, tipIdx, b);
    }
    const base = path(0);
    const bIdx = pos.length / 3;
    pos.push(base.x, base.y, base.z);
    nrm.push(-tan.x, -tan.y, -tan.z);
    for (let j = 0; j < radial; j++) {
      const a = j, b = (j + 1) % radial;
      idx.push(b, bIdx, a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* classic soft-serve / whipped-cream swirl */
export function swirlGeometry(height, baseR, turns = 3, tube = 0.3) {
  return sweepGeometry(
    (t) => {
      const a = t * Math.PI * 2 * turns;
      const r = baseR * (1 - t) ** 0.85;
      return new THREE.Vector3(Math.cos(a) * r, t * height, Math.sin(a) * r);
    },
    (t) => tube * (1 - t * 0.72) * (t < 0.06 ? t / 0.06 : 1),
    170, 22
  );
}

/* rounded box via extruded rounded rectangle */
export function roundedBoxGeometry(w, h, d, r = 0.12, bevel = 0.06) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, d - bevel * 2), bevelEnabled: bevel > 0,
    bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 12,
  });
  geo.translate(0, 0, -(d - bevel * 2) / 2 - bevel + bevel);
  geo.center();
  return geo;
}

/* popsicle silhouette with a bite taken out */
export function popsicleGeometry(w, h, d, bite = true) {
  const s = new THREE.Shape();
  const r = w * 0.34;
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  if (bite) {
    s.lineTo(x + w * 0.62, y + h);
    s.absarc(x + w * 0.44, y + h + w * 0.03, w * 0.2, 0.15, Math.PI - 0.15, false);
    s.lineTo(x + r, y + h);
  } else {
    s.lineTo(x + r, y + h);
  }
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: d * 0.7, bevelEnabled: true, bevelSize: d * 0.15, bevelThickness: d * 0.15,
    bevelSegments: 5, curveSegments: 18,
  });
  geo.center();
  return geo;
}

/* lathe helper: pts as [ [x,y], ... ] */
export function lathe(pts, segments = 64) {
  return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), segments);
}

/* =======================================================================
   Materials
   ======================================================================= */
export const MAT = {
  cream(color, sheen) {
    return new THREE.MeshPhysicalMaterial({
      color, roughness: 0.42, metalness: 0,
      clearcoat: 0.5, clearcoatRoughness: 0.35,
      sheen: 0.6, sheenColor: new THREE.Color(sheen || 0xFFE9C4), sheenRoughness: 0.5,
      ior: 1.36, emissive: new THREE.Color(0xE0A83C), emissiveIntensity: 0,
    });
  },
  matte(color) {
    return new THREE.MeshPhysicalMaterial({
      color, roughness: 0.85, metalness: 0, sheen: 0.4,
      sheenColor: new THREE.Color(0xffffff),
      emissive: new THREE.Color(0xE0A83C), emissiveIntensity: 0,
    });
  },
  sauce(color) {
    return new THREE.MeshPhysicalMaterial({
      color, roughness: 0.11, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
      ior: 1.45, emissive: new THREE.Color(0xE0A83C), emissiveIntensity: 0,
    });
  },
  glass() {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transmission: 0.94, thickness: 0.42, roughness: 0.06,
      metalness: 0, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.04,
      transparent: true, opacity: 1, side: THREE.DoubleSide,
      envMapIntensity: 1.4, specularIntensity: 1,
      emissive: new THREE.Color(0xE0A83C), emissiveIntensity: 0,
    });
  },
  fluid(color, opacity = 0.92) {
    return new THREE.MeshPhysicalMaterial({
      color, roughness: 0.14, metalness: 0, transmission: 0.35, thickness: 0.6,
      transparent: true, opacity, ior: 1.36, clearcoat: 0.8,
      emissive: new THREE.Color(0xE0A83C), emissiveIntensity: 0,
    });
  },
  wood() {
    return new THREE.MeshPhysicalMaterial({
      color: 0xD9B382, roughness: 0.82, metalness: 0, sheen: 0.2,
      emissive: new THREE.Color(0xE0A83C), emissiveIntensity: 0,
    });
  },
  paper(color) {
    return new THREE.MeshPhysicalMaterial({
      color, roughness: 0.72, metalness: 0, sheen: 0.35, side: THREE.DoubleSide,
      emissive: new THREE.Color(0xE0A83C), emissiveIntensity: 0,
    });
  },
  cookie() {
    return new THREE.MeshPhysicalMaterial({
      map: makeCookieTexture(), color: 0xB6A08E, roughness: 0.9, metalness: 0,
      bumpMap: makeCookieTexture(), bumpScale: 0.02,
      emissive: new THREE.Color(0xE0A83C), emissiveIntensity: 0,
    });
  },
  waffle(renderer) {
    const { map, bump } = makeWaffleTexture(renderer);
    return new THREE.MeshPhysicalMaterial({
      map, bumpMap: bump, bumpScale: 0.035, color: 0xffffff,
      roughness: 0.62, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.6,
      sheen: 0.3, sheenColor: new THREE.Color(0xffd9a0), side: THREE.DoubleSide,
      emissive: new THREE.Color(0xE0A83C), emissiveIntensity: 0,
    });
  },
  slate() {
    return new THREE.MeshPhysicalMaterial({
      color: 0x3B3A38, roughness: 0.78, metalness: 0.05, clearcoat: 0.2,
      emissive: new THREE.Color(0xE0A83C), emissiveIntensity: 0,
    });
  },
  metal(color = 0xCFD4DA) {
    return new THREE.MeshPhysicalMaterial({
      color, roughness: 0.22, metalness: 0.95,
      emissive: new THREE.Color(0xE0A83C), emissiveIntensity: 0,
    });
  },
};

/* tag a mesh so the flavour system can recolour it and the raycaster can name it */
export function tag(mesh, o) {
  mesh.userData = Object.assign({ part: o.part || 'part' }, o);
  mesh.castShadow = true;
  mesh.receiveShadow = o.receive !== false;
  return mesh;
}

/* scatter small inclusions (nuts, chips, seeds) over a scoop surface */
export function scatterOn(scoopMesh, count, geo, mat, radius, seed) {
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.castShadow = true;
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const u = Math.random() * Math.PI * 2;
    const w = Math.acos(2 * Math.random() - 1);
    const n = new THREE.Vector3(Math.sin(w) * Math.cos(u), Math.cos(w), Math.sin(w) * Math.sin(u));
    const lobes = fbm(n.x * 2 + seed, n.y * 2 + seed * 1.7, n.z * 2 - seed);
    const r = radius * (1 + lobes * 0.11) + 0.006;
    d.position.copy(n).multiplyScalar(r);
    if (d.position.y < -radius * 0.35) d.position.y = -radius * 0.35;
    d.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    d.scale.setScalar(0.7 + Math.random() * 0.8);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (scoopMesh) { inst.position.copy(scoopMesh.position); }
  return inst;
}
