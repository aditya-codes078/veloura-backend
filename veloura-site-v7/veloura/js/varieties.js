/* Veloura — 12 procedural 3D ice cream varieties.
   Every builder returns { group, hotspots } with the piece standing on y = 0
   (the shadow plane). main.js auto-frames and grounds whatever comes back. */
import * as THREE from 'three';
import {
  MAT, tag, scoopGeometry, quenelleGeometry, drizzleGeometry, swirlGeometry,
  sweepGeometry, roundedBoxGeometry, popsicleGeometry, lathe, scatterOn,
  makeTubLabel, fbm,
} from './model.js';

/* ---------- small shared parts ---------- */

function waffleCone(renderer, h, topR, opts = {}) {
  const g = new THREE.Group();
  const mat = MAT.waffle(renderer);
  const geo = new THREE.ConeGeometry(topR, h, 80, 20, true);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + h / 2) / h;
    const s = 1 + Math.pow(t, 2.2) * 0.05;
    v.x *= s; v.z *= s;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const cone = new THREE.Mesh(geo, mat);
  cone.rotation.x = Math.PI;
  cone.position.y = h / 2;
  tag(cone, {
    part: 'cone', label: 'Waffle Cone', kicker: 'Component',
    title: 'Cast-iron waffle cone',
    body: 'Butter, cane sugar, egg white and flaked sea salt, pressed at 190°C on cast-iron plates and rolled by hand while still pliable.',
    list: ['Pressed to order', 'Rolled rim for the last bite', '12 g · 58 kcal'],
  });
  g.add(cone);
  const rimMat = mat.clone(); rimMat.bumpScale = 0.02;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(topR * 1.03, topR * 0.085, 16, 90), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h - topR * 0.04;
  tag(rim, { ...cone.userData, label: 'Rolled Cone Rim' });
  g.add(rim);
  if (opts.tip) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(topR * 0.09, 16, 12), MAT.sauce(0x3A2117));
    tip.position.y = topR * 0.05;
    tag(tip, { part: 'tip', label: 'Chocolate-sealed tip', title: 'Sealed cone tip', body: 'A plug of tempered dark chocolate in the point of every cone, so nothing leaks on the last three bites.', list: ['58% Idukki dark', 'Set at 31°C'] });
    g.add(tip);
  }
  return { group: g, topY: h, topR };
}

function stackScoops(count, startY, r0, f, opts = {}) {
  const g = new THREE.Group();
  const meshes = [];
  let y = startY, r = r0, prevR = r0;
  const scoopMeshes = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(scoopGeometry(r, 1.3 + i * 3.4), MAT.cream(f.base, f.sheen));
    y = i === 0 ? startY + r * 0.52 : y + (prevR + r) * 0.63;
    prevR = r;
    m.position.set(0, y, 0);
    m.rotation.y = i * 1.1;
    tag(m, {
      part: 'scoop', tint: 'base', index: i, r,
      label: `${f.name} Scoop`, kicker: `Scoop 0${i + 1}`,
      title: i === 0 ? 'The base scoop' : i === 1 ? 'The second scoop' : 'The crown scoop',
      body: f.note,
      list: [`${f.tag}`, '17% butterfat · 24% overrun', 'Hand-quenelled to order'],
    });
    g.add(m);
    meshes.push(m);
    scoopMeshes.push(m);
    // inclusions
    if (f.inclusion !== false) {
      const inc = scatterOn(m, 60, new THREE.BoxGeometry(0.03, 0.014, 0.014), MAT.matte(f.swirl), r, 1.3 + i * 3.4);
      inc.position.copy(m.position);
      inc.userData = { part: 'inclusion', tint: 'swirl', label: `${f.inclusionName || 'Inclusions'}`, title: f.inclusionName || 'Inclusions', body: 'Folded through by hand at the end of the churn, so you get them in ribbons rather than evenly.', list: ['Folded, not blended'] };
      g.add(inc);
      meshes.push(inc);
    }
    r *= opts.shrink ?? 0.86;
  }
  const topY = scoopMeshes.length ? y + prevR * 0.75 : startY;
  return { group: g, meshes, scoopMeshes, topY };
}

function cherry(y, x = 0) {
  const g = new THREE.Group();
  const berry = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), MAT.sauce(0x9E1B2F));
  berry.scale.set(1, 0.92, 1);
  const stem = new THREE.Mesh(
    sweepGeometry((t) => new THREE.Vector3(t * 0.28, 0.16 + t * 0.42 - t * t * 0.06, -t * 0.05), () => 0.018, 20, 8),
    MAT.matte(0x4C6B33)
  );
  g.add(berry, stem);
  g.position.set(x, y, 0);
  const ud = {
    part: 'cherry', label: 'Amarena Cherry', kicker: 'Garnish',
    title: 'One amarena cherry',
    body: 'Sour Italian amarena steeped a year in its own syrup. Sharp enough to reset your palate so the second bite tastes like the first.',
    list: ['Modena amarena', '12-month steep', 'Stem on, always'],
  };
  tag(berry, ud); tag(stem, ud);
  g.userData = ud;
  return g;
}

function waferStick(x, y, z, rot) {
  const m = new THREE.Mesh(roundedBoxGeometry(0.13, 1.5, 0.13, 0.03, 0.02), MAT.cookie());
  m.position.set(x, y, z);
  m.rotation.z = rot;
  tag(m, { part: 'wafer', label: 'Wafer Stick', title: 'Rolled wafer stick', body: 'A crisp rolled wafer filled with hazelnut cream — the spoon you eat afterwards.', list: ['Hazelnut filled', 'Rolled at 210°C'] });
  return m;
}

function whippedSwirl(y, r, h, f) {
  const m = new THREE.Mesh(swirlGeometry(h, r, 2.6, r * 0.55), MAT.cream(0xFFFBF2, 0xFFF0D8));
  m.position.y = y;
  tag(m, { part: 'whip', label: 'Whipped Cream Swirl', title: 'Hand-piped whipped cream', body: 'Cold cream whipped to soft peaks with a spoon of vanilla sugar and piped in one continuous turn.', list: ['Soft peaks only', 'Piped to order'] });
  return m;
}

function kataifi(y, r, count = 10) {
  const g = new THREE.Group();
  const mat = MAT.matte(0xD9A055);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const geo = new THREE.TorusKnotGeometry(0.13 + Math.random() * 0.05, 0.016, 48, 6, 2, 3);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(a) * r * (0.7 + Math.random() * 0.4), y + Math.random() * 0.14, Math.sin(a) * r * (0.7 + Math.random() * 0.4));
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    tag(m, { part: 'kataifi', label: 'Kataifi Crunch', title: 'Toasted kataifi', body: 'Shredded filo toasted in ghee until it snaps, then folded through pistachio cream — the crunch that made Dubai chocolate famous.', list: ['Toasted in ghee', 'Folded, never sprinkled'] });
    g.add(m);
  }
  return g;
}

function sprinkles(y, r, count = 60) {
  const geo = new THREE.CapsuleGeometry(0.022, 0.075, 3, 6);
  const cols = [0xE94F64, 0xF2C14E, 0x5BAE8A, 0x7C6BD1, 0xFFFFFF];
  const g = new THREE.Group();
  cols.forEach((c) => {
    const inst = new THREE.InstancedMesh(geo, MAT.matte(c), Math.ceil(count / cols.length));
    const d = new THREE.Object3D();
    for (let i = 0; i < inst.count; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * r;
      d.position.set(Math.cos(a) * rr, y + Math.random() * 0.5, Math.sin(a) * rr);
      d.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.userData = { part: 'sprinkles', label: 'Sprinkles', title: 'Hundreds and thousands', body: 'Because a freakshake without sprinkles is just a milkshake having a bad day.', list: ['Five colours', 'Added last'] };
    g.add(inst);
  });
  return g;
}

/* ================= 1. Classic Waffle Cone ================= */
function buildCone(ctx) {
  const { renderer, f, scoops } = ctx;
  const g = new THREE.Group();
  const c = waffleCone(renderer, 2.6, 1.0, { tip: true });
  g.add(c.group);
  const s = stackScoops(Math.max(1, Math.min(4, scoops)), c.topY - 0.18, 0.95, f);
  g.add(s.group);
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(0.95, 2.5, 0.4), n: '01', label: 'Hand-rolled rim' },
      { pos: new THREE.Vector3(-0.5, c.topY + 0.6, 0.75), n: '02', label: 'Visible inclusions' },
      { pos: new THREE.Vector3(0.35, 1.0, 0.8), n: '03', label: 'Cast-iron waffle press' },
    ],
  };
}

/* ================= 2. Triple Stack Signature ================= */
function buildTriple(ctx) {
  const { renderer, f, scoops } = ctx;
  const g = new THREE.Group();
  const c = waffleCone(renderer, 3.1, 0.94, { tip: true });
  g.add(c.group);
  const n = Math.max(2, Math.min(5, scoops + 1));
  const s = stackScoops(n, c.topY - 0.16, 0.9, f);
  g.add(s.group);
  const top = s.meshes.filter((m) => m.userData.part === 'scoop').pop();
  const dz = new THREE.Mesh(drizzleGeometry(top.userData.r * 1.03), MAT.sauce(f.swirl));
  dz.position.y = top.position.y + 0.03;
  tag(dz, { part: 'drizzle', tint: 'swirl', label: `${f.swirlName || 'Sauce'} Drizzle`, title: 'The slow drizzle', body: 'Ladled at exactly 34°C so it hangs in ribbons instead of setting into a shell.', list: ['Ladled at 34°C', 'Reduced 40 minutes'] });
  g.add(dz);
  g.add(waferStick(0.62, top.position.y + 0.55, -0.15, -0.28));
  g.add(cherry(top.position.y + top.userData.r * 0.85, 0.02));
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(0.9, 3.0, 0.4), n: '01', label: 'Rolled rim' },
      { pos: new THREE.Vector3(-0.55, top.position.y - 0.5, 0.7), n: '02', label: 'Three-scoop stack' },
      { pos: new THREE.Vector3(0.4, top.position.y + 0.35, 0.4), n: '03', label: 'Slow drizzle + cherry' },
    ],
  };
}

/* ================= 3. Dubai Chocolate Sundae (footed glass) ================= */
function buildSundae(ctx) {
  const { f, scoops } = ctx;
  const g = new THREE.Group();
  const prof = [
    [0.0, 0.0], [0.86, 0.0], [0.88, 0.06], [0.5, 0.12], [0.18, 0.22],
    [0.15, 0.62], [0.2, 0.78], [0.55, 1.05], [0.86, 1.5], [1.0, 2.0], [1.06, 2.62], [1.08, 2.78],
  ];
  const glass = new THREE.Mesh(lathe(prof, 72), MAT.glass());
  glass.castShadow = true; glass.receiveShadow = true;
  tag(glass, { part: 'glass', label: 'Footed Sundae Glass', title: 'The footed glass', body: 'Thick-walled tulip glass, chilled to −4°C before it is built so the layers hold their edges to the last spoon.', list: ['Chilled to −4°C', 'Holds 320 ml'] });
  g.add(glass);

  const fudge = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.55, 0.42, 48), MAT.sauce(0x4A2A16));
  fudge.position.y = 1.12;
  tag(fudge, { part: 'fudge', label: 'Milk Chocolate Fudge', title: 'Milk chocolate fudge floor', body: 'A warm ganache of 41% milk chocolate poured in first so it sets against the cold glass.', list: ['41% milk chocolate', 'Poured warm'] });
  g.add(fudge);

  const layers = Math.max(1, Math.min(3, scoops - 1));
  for (let i = 0; i < layers; i++) {
    const r = 0.62 - i * 0.03;
    const m = new THREE.Mesh(scoopGeometry(r, 2.2 + i * 2.7), MAT.cream(i % 2 ? f.swirl : f.base, f.sheen));
    m.position.y = 1.55 + i * 0.62;
    tag(m, { part: 'scoop', tint: i % 2 ? 'swirl' : 'base', index: i, r, label: `${f.name} Layer`, title: 'Layered inside the glass', body: f.note, list: [f.tag, 'Layered, not stacked'] });
    g.add(m);
  }
  const topY = 1.55 + (layers - 1) * 0.62 + 0.5;
  g.add(kataifi(topY + 0.05, 0.8, 12));
  g.add(whippedSwirl(topY + 0.1, 0.62, 1.05, f));
  const nib = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), MAT.sauce(0x3A2117));
  nib.position.set(0.05, topY + 1.2, 0);
  tag(nib, { part: 'nib', label: 'Chocolate Pearl', title: 'Dark chocolate pearl', body: 'One crisp chocolate pearl on the peak, so the first spoon has something to break.', list: ['Crisp shell', 'Feuilletine centre'] });
  g.add(nib);
  const sauce = new THREE.Mesh(drizzleGeometry(1.06, 1.15), MAT.sauce(0x5A3A1E));
  sauce.scale.set(1, 0.24, 1);   // flat glaze hugging the rim, not a dome over the crown
  sauce.position.y = 2.70;
  tag(sauce, { part: 'drip', label: 'Rim Drip', title: 'Chocolate rim drip', body: 'The glass is painted inside with chocolate before building — it drips down the rim as it warms.', list: ['Painted, then chilled'] });
  g.add(sauce);
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(0.9, 0.9, 0.4), n: '01', label: 'Footed tulip glass' },
      { pos: new THREE.Vector3(-0.7, 1.2, 0.6), n: '02', label: 'Chocolate fudge floor' },
      { pos: new THREE.Vector3(0.55, topY + 0.6, 0.4), n: '03', label: 'Kataifi + whipped crown' },
    ],
  };
}

/* ================= 4. Kulfi on a Stick ================= */
function buildKulfi(ctx) {
  const { f, scoops } = ctx;
  const g = new THREE.Group();
  const stick = new THREE.Mesh(roundedBoxGeometry(0.17, 1.5, 0.09, 0.04, 0.02), MAT.wood());
  stick.position.y = 0.75;
  tag(stick, { part: 'stick', label: 'Birch Stick', title: 'Flat birch stick', body: 'Food-grade birch, the same stick the kulfiwala has used for eighty summers.', list: ['Untreated birch', 'Reusable? No. Compostable? Yes.'] });
  g.add(stick);

  const h = 1.85 + (scoops - 2) * 0.16;
  const geo = roundedBoxGeometry(1.15, h, 0.78, 0.16, 0.07);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + h / 2) / h;                       // 0 bottom → 1 top
    const s = 0.7 + t * 0.36;                          // taper: narrow bottom, wide top (matka shape)
    v.x *= s; v.z *= s;
    v.x *= 1 + fbm(v.x * 3, v.y * 3, v.z * 3) * 0.012;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = MAT.matte(f.base);
  mat.roughness = 0.95; mat.sheen = 0.5;
  const block = new THREE.Mesh(geo, mat);
  block.position.y = 1.05 + h / 2;
  tag(block, {
    part: 'kulfi', tint: 'base', label: `${f.name} Kulfi`, kicker: 'Kulfi',
    title: 'Unwhipped, dense, frozen slow',
    body: 'Milk reduced for four hours until it turns the colour of ivory, then frozen in a matka mould with no churning at all. Zero overrun — it is twice as dense as scooped ice cream.',
    list: ['0% overrun', '4-hour milk reduction', 'Set in a matka mould'],
  });
  g.add(block);

  const flecks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.02, 0.03), MAT.matte(f.swirl), 90);
  const d = new THREE.Object3D();
  for (let i = 0; i < 90; i++) {
    const side = Math.floor(Math.random() * 4);
    const t = Math.random();
    const s = 0.7 + t * 0.36;
    const y = 1.05 + t * h;
    const jx = (Math.random() - 0.5) * 1.15 * s, jz = (Math.random() - 0.5) * 0.78 * s;
    if (side === 0) d.position.set(jx, y, 0.4 * s);
    else if (side === 1) d.position.set(jx, y, -0.4 * s);
    else if (side === 2) d.position.set(0.59 * s, y, jz);
    else d.position.set(-0.59 * s, y, jz);
    d.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    d.scale.setScalar(0.7 + Math.random() * 0.7);
    d.updateMatrix();
    flecks.setMatrixAt(i, d.matrix);
  }
  flecks.instanceMatrix.needsUpdate = true;
  flecks.castShadow = true;
  flecks.userData = { part: 'flecks', tint: 'swirl', label: 'Pistachio Flecks', title: 'Chopped Iranian pistachio', body: 'Chopped coarse, never ground — you should hit them.', list: ['Coarse chopped', 'Folded before freezing'] };
  g.add(flecks);

  const frost = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), MAT.matte(0xFFFFFF));
  frost.position.set(0.45, 1.05 + h + 0.02, 0.2);
  frost.scale.set(1.4, 0.35, 1.2);
  tag(frost, { part: 'frost', label: 'Frost Bloom', title: 'Frost on the mould', body: 'Straight out of −22°C brine, which is why the surface is matte rather than glossy.', list: ['−22°C brine set'] });
  g.add(frost);
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(0.2, 0.6, 0.2), n: '01', label: 'Birch stick' },
      { pos: new THREE.Vector3(-0.6, 1.9, 0.45), n: '02', label: 'Dense, unwhipped set' },
      { pos: new THREE.Vector3(0.55, 2.5, 0.4), n: '03', label: 'Pistachio flecks' },
    ],
  };
}

/* ================= 5. Popsicle Bar ================= */
function buildPopsicle(ctx) {
  const { f, scoops } = ctx;
  const g = new THREE.Group();
  const stick = new THREE.Mesh(roundedBoxGeometry(0.19, 1.4, 0.08, 0.05, 0.02), MAT.wood());
  stick.position.y = 0.7;
  tag(stick, { part: 'stick', label: 'Birch Stick', title: 'Flat birch stick', body: 'Rounded ends, no splinters, printed with a bad joke on the underside.', list: ['Food-grade birch'] });
  g.add(stick);

  const w = 1.45 + (scoops - 2) * 0.1, h = 2.2 + (scoops - 2) * 0.18;
  const mat = MAT.sauce(f.base);
  mat.transmission = 0.28; mat.thickness = 0.5; mat.transparent = true; mat.roughness = 0.08;
  const bar = new THREE.Mesh(popsicleGeometry(w, h, 0.52, true), mat);
  bar.position.y = 1.05 + h / 2 - 0.28;
  tag(bar, {
    part: 'bar', tint: 'base', label: `${f.name} Bar`, kicker: 'Popsicle',
    title: 'Fruit-ice bar, one bite short',
    body: 'Pressed fruit and cane sugar frozen hard in a flat mould, dipped for two seconds so the outside is glassy and the inside still shatters.',
    list: ['62% fruit', 'No stabilisers', 'Bite included, free of charge'],
  });
  g.add(bar);

  const inner = new THREE.Mesh(popsicleGeometry(w * 0.62, h * 0.7, 0.3, false), MAT.cream(f.swirl, f.sheen));
  inner.position.set(0, bar.position.y - 0.1, 0);
  tag(inner, { part: 'core', tint: 'swirl', label: 'Frozen Cream Core', title: 'The cream core', body: 'A column of sweet cream frozen inside the fruit ice, so the middle of the bar is the best part.', list: ['Cream centre', 'Two textures per bite'] });
  g.add(inner);
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(0.15, 0.55, 0.15), n: '01', label: 'Birch stick' },
      { pos: new THREE.Vector3(-0.75, 1.7, 0.35), n: '02', label: 'Glassy fruit-ice shell' },
      { pos: new THREE.Vector3(0.5, 2.9, 0.3), n: '03', label: 'One bite, already gone' },
    ],
  };
}

/* ================= 6. Waffle Bowl Sundae ================= */
function buildWaffleBowl(ctx) {
  const { renderer, f, scoops } = ctx;
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(
    lathe([[0, 0], [0.45, 0.02], [0.75, 0.12], [1.15, 0.42], [1.42, 0.82], [1.55, 1.08], [1.62, 1.16], [1.52, 1.12], [1.34, 0.8], [1.06, 0.4], [0.68, 0.1], [0, 0.06]], 72),
    MAT.waffle(renderer)
  );
  bowl.castShadow = bowl.receiveShadow = true;
  tag(bowl, { part: 'bowl', label: 'Waffle Bowl', title: 'Pressed waffle bowl', body: 'The same batter as the cones, pressed over a steel dome while hot so it sets into a bowl you eat at the end.', list: ['Pressed over a dome', 'Holds two scoops + sauce'] });
  g.add(bowl);

  const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 0.9, 0.14, 48), MAT.sauce(f.swirl));
  pool.position.y = 0.5;
  tag(pool, { part: 'pool', tint: 'swirl', label: 'Sauce Pool', title: 'The sauce pool', body: 'Poured into the bowl before the scoops so it collects at the bottom for the last three spoons.', list: ['Poured first', 'Warm, never hot'] });
  g.add(pool);

  const n = Math.max(1, Math.min(4, scoops));
  const spots = [[-0.52, 0], [0.52, 0.05], [0, -0.5], [0, 0.55]];
  for (let i = 0; i < n; i++) {
    const r = 0.62;
    const m = new THREE.Mesh(scoopGeometry(r, 3.1 + i * 2.2), MAT.cream(f.base, f.sheen));
    m.position.set(spots[i % 4][0], 1.0 + (i > 1 ? 0.5 : 0), spots[i % 4][1]);
    tag(m, { part: 'scoop', tint: 'base', index: i, r, label: `${f.name} Scoop`, title: 'Scoop in the bowl', body: f.note, list: [f.tag, 'Two scoops as standard'] });
    g.add(m);
  }
  const brownieMat = MAT.matte(0x3E2415);
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(roundedBoxGeometry(0.3, 0.28, 0.3, 0.05, 0.02), brownieMat);
    const a = (i / 6) * Math.PI * 2;
    c.position.set(Math.cos(a) * 1.0, 0.72 + Math.random() * 0.5, Math.sin(a) * 1.0);
    c.rotation.set(Math.random(), Math.random(), Math.random());
    tag(c, { part: 'brownie', label: 'Brownie Cube', title: 'Warm brownie cubes', body: 'Baked in the morning, cut into cubes and dropped in warm so the edges of the scoop start to melt.', list: ['Baked daily', 'Dropped in warm'] });
    g.add(c);
  }
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(1.5, 0.7, 0.3), n: '01', label: 'Pressed waffle bowl' },
      { pos: new THREE.Vector3(-0.9, 1.35, 0.5), n: '02', label: 'Two scoops' },
      { pos: new THREE.Vector3(0.9, 0.95, 0.7), n: '03', label: 'Brownie cubes' },
    ],
  };
}

/* ================= 7. Mochi Bites ================= */
function buildMochi(ctx) {
  const { f, scoops } = ctx;
  const g = new THREE.Group();
  const plate = new THREE.Mesh(lathe([[0, 0], [1.85, 0], [1.9, 0.05], [1.86, 0.16], [1.7, 0.19], [0, 0.19]], 72), MAT.slate());
  plate.receiveShadow = true; plate.castShadow = true;
  tag(plate, { part: 'plate', label: 'Slate Plate', title: 'Cold slate plate', body: 'Kept in the freezer with the mochi so the dusting stays dry while you decide which one to eat first.', list: ['Frozen slate', 'Six-bite plate'] });
  g.add(plate);

  const n = Math.max(2, Math.min(6, scoops + 2));
  const R = n <= 3 ? 0.62 : 0.86;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const geo = new THREE.SphereGeometry(0.5, 40, 28);
    const p = geo.attributes.position, v = new THREE.Vector3();
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      const nn = v.clone().normalize();
      v.multiplyScalar(1 + fbm(nn.x * 2.4 + i, nn.y * 2.4, nn.z * 2.4) * 0.05);
      v.y *= 0.74;
      if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.4;
      p.setXYZ(k, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const mat = MAT.matte(i % 2 ? f.swirl : f.base);
    mat.roughness = 0.98; mat.sheen = 0.85; mat.sheenColor = new THREE.Color(0xffffff);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(a) * R, 0.19 + 0.34, Math.sin(a) * R);
    tag(m, {
      part: 'mochi', tint: i % 2 ? 'swirl' : 'base', index: i,
      label: `${f.name} Mochi`, kicker: 'Mochi',
      title: 'Pounded rice, frozen centre',
      body: 'Glutinous rice pounded into a soft skin, wrapped around a frozen ball of ice cream and dusted in cornflour. Eat in two bites; three is showing off.',
      list: ['Hand-wrapped daily', '38 g each', 'Soft even at −18°C'],
    });
    g.add(m);
  }
  const dust = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 5), MAT.matte(0xFFFFFF), 220);
  const d = new THREE.Object3D();
  for (let i = 0; i < 220; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.random() * 1.7;
    d.position.set(Math.cos(a) * rr, 0.2 + Math.random() * 0.02, Math.sin(a) * rr);
    d.updateMatrix(); dust.setMatrixAt(i, d.matrix);
  }
  dust.instanceMatrix.needsUpdate = true;
  dust.userData = { part: 'dust', label: 'Cornflour Dusting', title: 'The dusting', body: 'Toasted cornflour so the skins do not stick to each other, or to you.', list: ['Toasted cornflour'] };
  g.add(dust);
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(1.5, 0.2, 0.5), n: '01', label: 'Frozen slate plate' },
      { pos: new THREE.Vector3(0.4, 0.95, 0.8), n: '02', label: 'Pounded rice skin' },
      { pos: new THREE.Vector3(-0.95, 0.6, 0.5), n: '03', label: 'Cornflour dusting' },
    ],
  };
}

/* ================= 8. Ice Cream Sandwich ================= */
function buildSandwich(ctx) {
  const { f, scoops } = ctx;
  const g = new THREE.Group();
  const cw = 2.3, cd = 1.6, ch = 0.34;
  const creamH = 0.55 + (scoops - 2) * 0.16;
  const bottom = new THREE.Mesh(roundedBoxGeometry(cw, ch, cd, 0.1, 0.05), MAT.cookie());
  bottom.position.y = ch / 2;
  tag(bottom, { part: 'cookie', label: 'Bottom Cookie Slab', title: 'Cocoa cookie slab', body: 'A dark cocoa shortbread baked soft on purpose so it bends instead of shattering when the cream is cold.', list: ['Baked soft', 'Dutch cocoa', '9 mm thick'] });
  g.add(bottom);

  const cream = new THREE.Mesh(roundedBoxGeometry(cw * 0.94, creamH, cd * 0.94, 0.07, 0.03), MAT.cream(f.base, f.sheen));
  cream.position.y = ch + creamH / 2;
  tag(cream, {
    part: 'slab', tint: 'base', label: `${f.name} Cream Slab`, kicker: 'The middle',
    title: 'A slab, not a scoop',
    body: 'Frozen flat in a tray and cut to the exact size of the cookie, so every bite has the same ratio. This is the whole point of a sandwich.',
    list: [f.tag, 'Cut, not scooped', '14 mm of cream'],
  });
  g.add(cream);

  const chipMat = MAT.matte(f.swirl);
  for (let i = 0; i < 22; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 9), chipMat);
    const side = Math.random() > 0.5 ? 1 : -1;
    c.position.set((Math.random() - 0.5) * cw * 0.88, ch + Math.random() * creamH, side * cd * 0.47);
    c.scale.set(1, 0.8, 0.6);
    tag(c, { part: 'chip', tint: 'swirl', label: 'Pressed Edge Chips', title: 'Rolled edges', body: 'The exposed cream is rolled through chopped inclusions the moment it is cut.', list: ['Rolled by hand'] });
    g.add(c);
  }

  const top = new THREE.Mesh(roundedBoxGeometry(cw, ch, cd, 0.1, 0.05), MAT.cookie());
  top.position.y = ch * 1.5 + creamH;
  top.rotation.y = 0.06;
  tag(top, { ...bottom.userData, label: 'Top Cookie Slab' });
  g.add(top);
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(1.1, ch * 1.5 + creamH, 0.6), n: '01', label: 'Soft cocoa cookie' },
      { pos: new THREE.Vector3(-1.05, ch + creamH * 0.5, 0.7), n: '02', label: 'Cut cream slab' },
      { pos: new THREE.Vector3(0.2, ch * 0.5, 0.85), n: '03', label: 'Rolled edges' },
    ],
  };
}

/* ================= 9. Gelato Cup ================= */
function buildGelatoCup(ctx) {
  const { f, scoops } = ctx;
  const g = new THREE.Group();
  const cup = new THREE.Mesh(
    lathe([[0, 0], [0.62, 0], [0.64, 0.04], [0.78, 0.7], [0.92, 1.32], [0.96, 1.4], [0.9, 1.42], [0.88, 1.34], [0.74, 0.68], [0.6, 0.06], [0, 0.05]], 64),
    MAT.paper(0xFDF8F0)
  );
  cup.castShadow = cup.receiveShadow = true;
  tag(cup, { part: 'cup', label: 'Paper Gelato Cup', title: 'Kraft paper cup', body: 'Unbleached, uncoated, home-compostable. 120 ml — a gelato cup, not an American tub.', list: ['Home compostable', '120 ml'] });
  g.add(cup);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.855, 0.8, 0.26, 64, 1, true), MAT.paper(f.accent || 0xE0A83C));
  band.position.y = 1.02;
  tag(band, { part: 'band', tint: 'accent', label: 'Veloura Band', title: 'The printed band', body: 'Soy-ink band in the flavour’s own colour, so the counter knows what you ordered from across the parlour.', list: ['Soy ink', 'One colour per flavour'] });
  g.add(band);

  const n = Math.max(1, Math.min(4, scoops));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(quenelleGeometry(0.6, 5.2 + i * 2.9), MAT.cream(i % 2 ? f.swirl : f.base, f.sheen));
    m.position.set((i % 2 ? 0.2 : -0.2) * (i ? 1 : 0), 1.5 + i * 0.36, (i === 2 ? 0.18 : 0));
    m.rotation.y = i * 0.9;
    tag(m, { part: 'spade', tint: i % 2 ? 'swirl' : 'base', index: i, r: 0.6, label: `${f.name} Gelato`, title: 'Spade-scooped, not balled', body: 'Gelato is served at −11°C with a flat spatula, folded over itself so it stays soft and dense. ' + f.note, list: [f.tag, 'Served at −11°C', '6% overrun'] });
    g.add(m);
  }
  const spat = new THREE.Mesh(roundedBoxGeometry(0.26, 1.5, 0.05, 0.1, 0.02), MAT.wood());
  spat.position.set(0.5, 2.1 + (n - 1) * 0.2, -0.2);
  spat.rotation.set(0.14, 0.3, -0.34);
  tag(spat, { part: 'spatula', label: 'Wooden Spatula', title: 'Flat wooden spatula', body: 'A birch paddle, not a spoon. Gelato is meant to be smeared across the tongue, not dropped on it.', list: ['Birch paddle', 'No plastic on the counter'] });
  g.add(spat);
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(0.85, 0.7, 0.35), n: '01', label: 'Compostable cup' },
      { pos: new THREE.Vector3(-0.6, 1.7, 0.5), n: '02', label: 'Spade-scooped gelato' },
      { pos: new THREE.Vector3(0.6, 2.5, 0.1), n: '03', label: 'Birch spatula' },
    ],
  };
}

/* ================= 10. Family Tub (1 L) ================= */
function buildTub(ctx) {
  const { f, scoops } = ctx;
  const g = new THREE.Group();
  const R = 1.12 + (scoops - 2) * 0.05, H = 1.85 + (scoops - 2) * 0.1;
  const label = makeTubLabel(f.name, f.accentHex);
  const side = MAT.paper(0xffffff); side.map = label; side.roughness = 0.6;
  const plain = MAT.paper(0xF3E7D5);
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.94, H, 64, 1, false), [side, plain, plain]);
  tub.position.y = H / 2;
  tub.castShadow = tub.receiveShadow = true;
  tag(tub, {
    part: 'tub', label: 'Veloura 1 L Tub', kicker: 'Take home',
    title: 'The printed litre tub',
    body: 'Double-walled board with a soy-ink wrap, packed at −24°C and sleeved in an insulated bag so it survives a Kanpur afternoon.',
    list: ['1 L · net 540 g', 'Double-walled board', 'Travels 90 minutes'],
  });
  g.add(tub);

  const lipRing = new THREE.Mesh(new THREE.TorusGeometry(R * 1.01, 0.045, 12, 64), plain);
  lipRing.rotation.x = Math.PI / 2; lipRing.position.y = H;
  lipRing.castShadow = true;
  lipRing.userData = tub.userData;
  g.add(lipRing);

  const surf = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.97, R * 0.97, 0.1, 48), MAT.cream(f.base, f.sheen));
  surf.position.y = H - 0.04;
  tag(surf, { part: 'surface', tint: 'base', label: `${f.name} Surface`, title: 'Scooped straight from the tub', body: f.note, list: [f.tag, 'Best in the first week'] });
  g.add(surf);

  const scoop = new THREE.Mesh(scoopGeometry(0.6, 7.4), MAT.cream(f.base, f.sheen));
  scoop.position.set(0.12, H + 0.42, 0.05);
  tag(scoop, { part: 'scoop', tint: 'base', r: 0.6, label: `${f.name} Scoop`, title: 'One scoop, resting', body: f.note, list: [f.tag, 'Roughly 12 scoops per tub'] });
  g.add(scoop);

  const lid = new THREE.Mesh(lathe([[0, 0], [R * 1.06, 0], [R * 1.08, 0.06], [R * 1.06, 0.22], [R * 0.99, 0.24], [0, 0.2]], 56), plain);
  lid.position.set(R * 1.95, R * 0.6, -0.25);
  lid.rotation.z = -1.16;
  lid.castShadow = true;
  tag(lid, { part: 'lid', label: 'Tub Lid', title: 'The lid, already off', body: 'Tamper-ring lid with the churn date stamped inside. Nobody has ever put it back on straight.', list: ['Churn date stamped'] });
  g.add(lid);
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(0, 1.0, R + 0.05), n: '01', label: 'Printed litre tub' },
      { pos: new THREE.Vector3(0.3, H + 0.7, 0.4), n: '02', label: 'One scoop, resting' },
      { pos: new THREE.Vector3(R * 1.9, R * 0.8, 0.2), n: '03', label: 'Lid, already off' },
    ],
  };
}

/* ================= 11. Falooda Glass ================= */
function buildFalooda(ctx) {
  const { f, scoops } = ctx;
  const g = new THREE.Group();
  const H = 3.3;
  const glass = new THREE.Mesh(
    lathe([[0, 0], [0.78, 0], [0.8, 0.08], [0.7, 0.16], [0.72, 0.5], [0.78, 1.6], [0.86, 2.6], [0.92, H], [0.94, H + 0.06]], 64),
    MAT.glass()
  );
  glass.castShadow = glass.receiveShadow = true;
  tag(glass, { part: 'glass', label: 'Falooda Glass', title: 'The tall glass', body: 'A 400 ml tumbler, built in layers so you can see the whole order before you wreck it with the spoon.', list: ['400 ml', 'Built in five layers'] });
  g.add(glass);

  const layerR = (y) => 0.7 + (y / H) * 0.2;
  const mk = (y0, y1, color, o, name, title, body, list) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(layerR(y1), layerR(y0), y1 - y0, 48), MAT.fluid(color, o));
    m.position.y = (y0 + y1) / 2;
    tag(m, { part: 'layer', label: name, title, body, list, receive: false });
    return m;
  };
  g.add(mk(0.08, 0.75, 0xB3123C, 0.95, 'Rose Syrup', 'Rooh Afza floor', 'Rose syrup goes in first and stays there, which is why the last mouthful is the sweetest one.', ['Rose + kewra', 'Poured first']));
  g.add(mk(0.75, 1.15, 0x2E2A28, 0.8, 'Basil Seeds', 'Sabja seeds', 'Basil seeds soaked twenty minutes until each one wears a clear jelly coat. Cooling, in the Ayurvedic sense and the literal one.', ['Soaked 20 min', 'Cooling by nature']));
  const verm = new THREE.Mesh(new THREE.CylinderGeometry(layerR(2.0), layerR(1.15), 0.85, 48), MAT.fluid(0xF6EDE0, 0.88));
  verm.position.y = 1.58;
  tag(verm, { part: 'vermicelli', label: 'Falooda Sev', title: 'Cornflour vermicelli', body: 'Falooda sev pressed fresh through a brass sancha into ice water, so it stays springy instead of turning to paste.', list: ['Pressed fresh daily', 'Brass sancha'], receive: false });
  g.add(verm);
  const strands = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.022, 0.3, 3, 6), MAT.matte(0xFFFDF7), 60);
  const d = new THREE.Object3D();
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.62;
    d.position.set(Math.cos(a) * rr, 1.2 + Math.random() * 0.75, Math.sin(a) * rr);
    d.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    d.updateMatrix(); strands.setMatrixAt(i, d.matrix);
  }
  strands.instanceMatrix.needsUpdate = true;
  strands.userData = verm.userData;
  g.add(strands);
  g.add(mk(2.0, 2.95, 0xF7DCE2, 0.9, 'Rose Milk', 'Chilled rose milk', 'Full-cream milk, chilled and lightly sweetened, poured down the back of a spoon so it does not disturb the layers.', ['Poured on a spoon', 'Full-cream only']));

  const n = Math.max(1, Math.min(3, scoops - 1));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(scoopGeometry(0.56, 9.1 + i * 2.4), MAT.cream(f.base, f.sheen));
    m.position.set(i === 0 ? 0 : (i === 1 ? 0.34 : -0.32), H + 0.06 + i * 0.42, i === 2 ? 0.2 : 0);
    tag(m, { part: 'scoop', tint: 'base', index: i, r: 0.56, label: `${f.name} Scoop`, title: 'The scoop on top', body: f.note, list: [f.tag, 'Sits on the rim'] });
    g.add(m);
  }
  const nuts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.024, 0.04), MAT.matte(f.swirl), 40);
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.7;
    d.position.set(Math.cos(a) * rr, H + 0.5 + Math.random() * 0.25, Math.sin(a) * rr);
    d.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    d.updateMatrix(); nuts.setMatrixAt(i, d.matrix);
  }
  nuts.instanceMatrix.needsUpdate = true;
  nuts.castShadow = true;
  nuts.userData = { part: 'nuts', tint: 'swirl', label: 'Chopped Pistachio', title: 'Chopped pistachio', body: 'Slivered over the top with a pinch of dried rose petal.', list: ['Slivered, not powdered'] };
  g.add(nuts);

  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 4.4, 20, 1, true), MAT.paper(0xE04E63));
  straw.position.set(-0.42, 2.1, 0.28);
  straw.rotation.z = 0.2; straw.rotation.x = -0.1;
  straw.castShadow = true;
  tag(straw, { part: 'straw', label: 'Paper Straw', title: 'Wide paper straw', body: 'Extra wide, because falooda sev has to fit up it. Paper — it holds for exactly one falooda, which is all we ask.', list: ['12 mm bore', 'Paper, not plastic'] });
  g.add(straw);

  const spoonStem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.0, 14), MAT.metal());
  const bowlS = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), MAT.metal());
  bowlS.scale.set(1, 0.35, 0.7); bowlS.position.y = -2.0;
  const spoon = new THREE.Group(); spoon.add(spoonStem, bowlS);
  spoon.position.set(0.5, 2.2, -0.2);
  spoon.rotation.z = -0.22;
  spoonStem.castShadow = bowlS.castShadow = true;
  const sud = { part: 'spoon', label: 'Long Falooda Spoon', title: 'The long spoon', body: 'Forty centimetres of steel so you can reach the rose syrup at the bottom without lifting the glass.', list: ['400 mm', 'Steel, reused'] };
  tag(spoonStem, sud); tag(bowlS, sud);
  g.add(spoon);
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(0.75, 0.5, 0.4), n: '01', label: 'Rose syrup floor' },
      { pos: new THREE.Vector3(-0.8, 1.6, 0.4), n: '02', label: 'Falooda sev + sabja' },
      { pos: new THREE.Vector3(0.5, H + 0.5, 0.4), n: '03', label: 'Scoop on the rim' },
    ],
  };
}

/* ================= 12. Freakshake ================= */
function buildFreakshake(ctx) {
  const { renderer, f, scoops } = ctx;
  const g = new THREE.Group();
  const H = 2.85;
  const glass = new THREE.Mesh(
    lathe([[0, 0], [0.92, 0], [0.94, 0.1], [0.84, 0.2], [0.88, 0.9], [1.0, 1.9], [1.08, H], [1.11, H + 0.07]], 64),
    MAT.glass()
  );
  glass.castShadow = glass.receiveShadow = true;
  tag(glass, { part: 'glass', label: 'Shake Glass', title: 'The 500 ml shake glass', body: 'A heavy soda-fountain glass, frozen overnight. It needs the weight — there is a whole cone balanced on it.', list: ['500 ml', 'Frozen overnight'] });
  g.add(glass);

  const shake = new THREE.Mesh(new THREE.CylinderGeometry(1.04, 0.84, 2.6, 48), MAT.fluid(f.base, 0.97));
  shake.position.y = 1.42;
  tag(shake, { part: 'shake', tint: 'base', label: `${f.name} Shake`, title: 'Four scoops, blended', body: 'Four scoops and 60 ml of cold milk, blended for eleven seconds only. ' + f.note, list: [f.tag, '11-second blend', 'Thick enough to hold a cone'] });
  g.add(shake);

  const drip = new THREE.Mesh(drizzleGeometry(1.12, 0.85), MAT.sauce(f.swirl));
  drip.position.y = H - 0.02;
  tag(drip, { part: 'drip', tint: 'swirl', label: 'Dripping Sauce', title: 'The drip', body: 'The glass is painted with sauce and left to run down the outside before the shake goes in. Yes, it gets on your hands.', list: ['Painted, then poured'] });
  g.add(drip);

  const dome = new THREE.Mesh(whippedDome(1.0), MAT.cream(0xFFFBF2, 0xFFF0D8));
  dome.position.y = H;
  tag(dome, { part: 'whip', label: 'Whipped Cream Dome', title: 'The cream dome', body: 'Piped in a spiral so the cone has something to stand in.', list: ['Soft peaks', 'Piped in a spiral'] });
  g.add(dome);

  const cone = waffleCone(renderer, 1.9, 0.62);
  cone.group.rotation.z = Math.PI - 0.34;
  cone.group.position.set(-0.28, H + 2.1, 0.1);
  g.add(cone.group);

  const extra = Math.max(0, Math.min(3, scoops - 1));
  for (let i = 0; i < extra; i++) {
    const m = new THREE.Mesh(scoopGeometry(0.42, 11.2 + i * 2.1), MAT.cream(f.base, f.sheen));
    const a = i * 2.2;
    m.position.set(Math.cos(a) * 0.5, H + 0.62 + i * 0.1, Math.sin(a) * 0.5);
    tag(m, { part: 'scoop', tint: 'base', index: i, r: 0.42, label: `${f.name} Scoop`, title: 'Scoops on the rim', body: f.note, list: [f.tag] });
    g.add(m);
  }

  const cookie = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.13, 32), MAT.cookie());
  cookie.position.set(0.85, H + 0.72, 0.28);
  cookie.rotation.set(0.2, 0, 1.25);
  tag(cookie, { part: 'cookie', label: 'Choc-Chip Cookie', title: 'A whole cookie, wedged in', body: 'Baked in the morning and pushed into the cream at an angle, because subtlety is not what you came for.', list: ['Baked daily', 'Wedged, not balanced'] });
  g.add(cookie);

  g.add(waferStick(-0.95, H + 0.85, -0.2, 0.36));
  g.add(sprinkles(H + 0.42, 1.0, 70));
  g.add(cherry(H + 1.05, 0.42));

  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 3.6, 18, 1, true), MAT.paper(0xE0A83C));
  straw.position.set(0.62, H + 0.6, -0.42);
  straw.rotation.z = -0.28;
  straw.castShadow = true;
  tag(straw, { part: 'straw', label: 'Paper Straw', title: 'Striped paper straw', body: 'Optional. Most people give up and use the spoon.', list: ['Paper, not plastic'] });
  g.add(straw);
  return {
    group: g,
    hotspots: [
      { pos: new THREE.Vector3(1.0, 1.2, 0.5), n: '01', label: 'Sauce-painted glass' },
      { pos: new THREE.Vector3(-0.9, H + 0.5, 0.5), n: '02', label: 'Cream dome' },
      { pos: new THREE.Vector3(0.3, H + 2.4, 0.4), n: '03', label: 'Cone, upside down' },
    ],
  };
}
function whippedDome(r) {
  const geo = new THREE.SphereGeometry(r, 56, 36, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const rr = Math.hypot(v.x, v.z) / r;
    const ridge = Math.sin(a * 7 + rr * 6) * 0.05 * (1 - rr * 0.4);
    v.multiplyScalar(1 + ridge);
    v.y *= 0.85;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/* ================= registry ================= */
export const VARIETIES = [
  { id: 'cone', name: 'Classic Waffle Cone', short: 'Cone', price: 169, note: 'Two scoops in a cast-iron waffle cone with a chocolate-sealed tip.', build: buildCone, scoopBased: true, icon: 'cone' },
  { id: 'triple', name: 'Triple Stack Signature', short: 'Triple Stack', price: 299, note: 'Three scoops, slow drizzle, wafer stick and an amarena cherry.', build: buildTriple, scoopBased: true, icon: 'triple' },
  { id: 'sundae', name: 'Dubai Chocolate Sundae', short: 'Sundae Glass', price: 349, note: 'Footed glass, fudge floor, kataifi crunch and a whipped crown.', build: buildSundae, scoopBased: true, icon: 'glass' },
  { id: 'kulfi', name: 'Kulfi on a Stick', short: 'Kulfi', price: 99, note: 'Matka-set, unwhipped, dense — the way the kulfiwala freezes it.', build: buildKulfi, scoopBased: false, icon: 'kulfi' },
  { id: 'popsicle', name: 'Popsicle Bar', short: 'Popsicle', price: 89, note: 'Glassy fruit ice with a frozen cream core. One bite already gone.', build: buildPopsicle, scoopBased: false, icon: 'popsicle' },
  { id: 'bowl', name: 'Waffle Bowl Sundae', short: 'Waffle Bowl', price: 279, note: 'Pressed waffle bowl, two scoops, warm brownie cubes, sauce pool.', build: buildWaffleBowl, scoopBased: true, icon: 'bowl' },
  { id: 'mochi', name: 'Mochi Bites', short: 'Mochi', price: 199, note: 'Four hand-wrapped mochi, dusted, on a frozen slate plate.', build: buildMochi, scoopBased: true, icon: 'mochi' },
  { id: 'sandwich', name: 'Ice Cream Sandwich', short: 'Sandwich', price: 149, note: 'Soft cocoa cookies with a cut cream slab and rolled edges.', build: buildSandwich, scoopBased: true, icon: 'sandwich' },
  { id: 'gelato', name: 'Gelato Cup', short: 'Gelato Cup', price: 159, note: 'Spade-scooped gelato at −11°C in a compostable cup, birch paddle.', build: buildGelatoCup, scoopBased: true, icon: 'cup' },
  { id: 'tub', name: 'Family Tub (1 L)', short: 'Family Tub', price: 899, note: 'A printed litre for the house, lid already off, one scoop resting.', build: buildTub, scoopBased: true, icon: 'tub' },
  { id: 'falooda', name: 'Falooda Glass', short: 'Falooda', price: 219, note: 'Rose syrup, sabja, falooda sev, chilled rose milk and a scoop.', build: buildFalooda, scoopBased: true, icon: 'falooda' },
  { id: 'freakshake', name: 'Cone Sundae Freakshake', short: 'Freakshake', price: 399, note: 'A whole cone upside down in a shake, cookie, wafer, sprinkles, drip.', build: buildFreakshake, scoopBased: true, icon: 'shake' },
];

export const SIZES = [
  { id: 'mini', label: 'Mini', scoops: 1, scale: 0.82, ml: '90 ml', mult: 0.7 },
  { id: 'regular', label: 'Regular', scoops: 2, scale: 1.0, ml: '150 ml', mult: 1 },
  { id: 'large', label: 'Large', scoops: 3, scale: 1.14, ml: '230 ml', mult: 1.3 },
  { id: 'party', label: 'Party', scoops: 4, scale: 1.3, ml: '380 ml', mult: 1.75 },
];
