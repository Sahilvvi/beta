/**
 * Procedural 3D living room — the scene behind the homepage portal (the
 * Travvir-style tiny planet that unfolds into a 360° view). It's an
 * illustrative room built in code, captured once into a cube map.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const PAL = { wall: '#cfc7bb', floor: '#9b7757', sofa: '#6e7884', armchair: '#b98b63', rug: '#cbc2b4', accent: '#c4683d', wood: '#4b3a2e', plant: '#557a4c' };

const W = 8, D = 7, H = 3.2, T = 0.16;

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat: [number, number] | null, aniso: number) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function woodTexture(r: () => number) {
  const [c, g] = makeCanvas(1024, 1024);
  const rows = 12, rh = 1024 / rows;
  for (let i = 0; i < rows; i++) {
    let x = -r() * 400;
    while (x < 1024) {
      const len = 300 + r() * 450;
      const L = 208 + r() * 44;
      g.fillStyle = `rgb(${L | 0},${(L * 0.97) | 0},${(L * 0.93) | 0})`;
      g.fillRect(x, i * rh, len, rh);
      for (let k = 0; k < 16; k++) {
        g.strokeStyle = `rgba(90,60,40,${0.035 + r() * 0.07})`;
        g.lineWidth = 0.6 + r() * 1.4;
        g.beginPath();
        const yy = i * rh + r() * rh;
        g.moveTo(x, yy);
        for (let s = 0; s <= len; s += 40) g.lineTo(x + s, yy + Math.sin(s * 0.012 + k) * 2.2 * r());
        g.stroke();
      }
      g.fillStyle = 'rgba(40,25,15,.35)';
      g.fillRect(x + len - 1.5, i * rh, 1.5, rh);
      x += len;
    }
    g.fillStyle = 'rgba(40,25,15,.4)';
    g.fillRect(0, i * rh, 1024, 1.5);
  }
  return c;
}

function plasterTexture(r: () => number) {
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = '#f7f7f7';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(0,0,0,${0.015 + r() * 0.035})` : `rgba(255,255,255,${0.2 + r() * 0.3})`;
    const s = 1 + r() * 3;
    g.fillRect(r() * 512, r() * 512, s, s);
  }
  return c;
}

function rugTexture(r: () => number) {
  const [c, g] = makeCanvas(1024, 720);
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 1024, 720);
  g.fillStyle = '#a9a9a9'; g.fillRect(28, 28, 968, 664);
  g.fillStyle = '#f4f4f4'; g.fillRect(52, 52, 920, 616);
  g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 3;
  g.strokeRect(78, 78, 868, 564);
  g.save();
  g.beginPath(); g.rect(96, 96, 832, 528); g.clip();
  g.strokeStyle = 'rgba(0,0,0,.13)'; g.lineWidth = 2;
  for (let i = -720; i < 1024 + 720; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 720, 720); g.stroke();
    g.beginPath(); g.moveTo(i, 720); g.lineTo(i + 720, 0); g.stroke();
  }
  g.restore();
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
    g.fillRect(r() * 1024, r() * 720, 1.5, 1.5);
  }
  return c;
}

function skyTexture() {
  const [c, g] = makeCanvas(256, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#7fa9dc');
  grad.addColorStop(0.55, '#cfe1f0');
  grad.addColorStop(0.8, '#ffe4c4');
  grad.addColorStop(1, '#ffd6ad');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 512);
  const r = rng(7);
  g.fillStyle = 'rgba(70,96,70,.55)';
  for (let x = -20; x < 276; x += 14) {
    const h = 30 + r() * 60;
    g.beginPath(); g.ellipse(x, 470, 18, h, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillRect(0, 470, 256, 42);
  return c;
}

function drawArt(ctx: CanvasRenderingContext2D, w: number, h: number, colors: [string, string], variant: 0 | 1) {
  ctx.fillStyle = '#efe7da'; ctx.fillRect(0, 0, w, h);
  if (variant === 0) {
    ctx.fillStyle = colors[0];
    ctx.beginPath(); ctx.moveTo(w * 0.18, h * 0.88); ctx.lineTo(w * 0.18, h * 0.45);
    ctx.arc(w * 0.5, h * 0.45, w * 0.32, Math.PI, 0); ctx.lineTo(w * 0.82, h * 0.88); ctx.fill();
    ctx.fillStyle = colors[1];
    ctx.beginPath(); ctx.arc(w * 0.66, h * 0.3, w * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2b2420'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.7); ctx.bezierCurveTo(w * 0.4, h * 0.55, w * 0.6, h * 0.85, w * 0.92, h * 0.62); ctx.stroke();
  } else {
    ctx.fillStyle = colors[1];
    ctx.fillRect(w * 0.14, h * 0.12, w * 0.5, h * 0.5);
    ctx.fillStyle = colors[0];
    ctx.beginPath(); ctx.arc(w * 0.6, h * 0.62, w * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2420';
    ctx.fillRect(w * 0.18, h * 0.8, w * 0.64, 6);
  }
}

export interface Room {
  scene: THREE.Scene;
  /** Where the 360° capture is taken from. */
  center: THREE.Vector3;
  dispose(): void;
}

export function createRoom(renderer: THREE.WebGLRenderer): Room {
  const r = rng(42);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const ENV = 0.38; // three r160 has no scene.environmentIntensity — set per material instead

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(renderer), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  const tex = {
    wood: toTexture(woodTexture(r), [2.2, 2], aniso),
    plaster: toTexture(plasterTexture(r), [4, 2], aniso),
    rug: toTexture(rugTexture(r), null, aniso),
    sky: toTexture(skyTexture(), null, aniso),
  };
  const [artCanvasA, artCtxA] = makeCanvas(512, 640);
  const [artCanvasB, artCtxB] = makeCanvas(512, 640);
  drawArt(artCtxA, 512, 640, [PAL.accent, PAL.sofa], 0);
  drawArt(artCtxB, 512, 640, [PAL.sofa, PAL.accent], 1);
  const artTexA = toTexture(artCanvasA, null, aniso);
  const artTexB = toTexture(artCanvasB, null, aniso);

  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ envMapIntensity: ENV, ...p });
  const fabric = (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.88, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.5, 0.5, 0.5), envMapIntensity: ENV });
  const M = {
    wall: std({ map: tex.plaster, roughness: 0.92, color: PAL.wall }),
    floor: std({ map: tex.wood, roughness: 0.5, color: PAL.floor }),
    sofa: fabric(PAL.sofa),
    armchair: fabric(PAL.armchair),
    rug: std({ map: tex.rug, roughness: 1, color: PAL.rug }),
    accent: std({ roughness: 0.6, color: PAL.accent }),
    wood: std({ roughness: 0.42, color: PAL.wood }),
    plant: std({ roughness: 0.65, side: THREE.DoubleSide, color: PAL.plant }),
    ceiling: std({ color: '#f3efe9', roughness: 1 }),
    trim: std({ color: '#f4f1ec', roughness: 0.6 }),
    metal: std({ color: '#1c1b1a', roughness: 0.35, metalness: 0.8 }),
    brass: std({ color: '#c39a5e', roughness: 0.28, metalness: 1 }),
    shade: std({ color: '#f1e7d6', emissive: '#ffcf9a', emissiveIntensity: 0.6, roughness: 0.9, side: THREE.DoubleSide }),
    ceramic: std({ color: '#ece6dc', roughness: 0.35 }),
    mirror: std({ color: '#ffffff', roughness: 0.04, metalness: 1 }),
    linen: std({ color: '#f5efe4', roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.94 }),
    cream: std({ color: '#efe7da', roughness: 0.8 }),
    artA: std({ map: artTexA, roughness: 0.9 }),
    artB: std({ map: artTexB, roughness: 0.9 }),
    ground: std({ color: '#9aa57e', roughness: 1 }),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.5) }),
    sky: new THREE.MeshBasicMaterial({ map: tex.sky, color: new THREE.Color(1.7, 1.7, 1.7) }),
  };

  const root = new THREE.Group();
  scene.add(root);

  function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = root) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const rbox = (w: number, h: number, d: number, rad = 0.04, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, rad);
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt: number, rb: number, h: number, s = 32, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);

  // shell
  mesh(box(W + 2 * T, 0.2, D + 2 * T), M.floor).position.y = -0.1;
  const ceiling = mesh(box(W + 2 * T, 0.16, D + 2 * T), M.ceiling);
  ceiling.position.y = H + 0.08; ceiling.castShadow = false;
  mesh(box(W, H, T), M.wall).position.set(0, H / 2, -D / 2 - T / 2);
  mesh(box(W, H, T), M.wall).position.set(0, H / 2, D / 2 + T / 2);
  mesh(box(T, H, D), M.wall).position.set(W / 2 + T / 2, H / 2, 0);

  // left wall with a window opening
  const wz0 = -0.4, wz1 = 1.8, wy0 = 0.85, wy1 = 2.65, lx = -W / 2 - T / 2;
  mesh(box(T, wy0, D), M.wall).position.set(lx, wy0 / 2, 0);
  mesh(box(T, H - wy1, D), M.wall).position.set(lx, (wy1 + H) / 2, 0);
  mesh(box(T, wy1 - wy0, wz0 + D / 2), M.wall).position.set(lx, (wy0 + wy1) / 2, (wz0 - D / 2) / 2);
  mesh(box(T, wy1 - wy0, D / 2 - wz1), M.wall).position.set(lx, (wy0 + wy1) / 2, (wz1 + D / 2) / 2);
  const fx = -W / 2 + 0.01;
  const frame = (w: number, h: number, d: number, x: number, y: number, z: number) => mesh(box(w, h, d), M.trim).position.set(x, y, z);
  frame(0.2, 0.06, wz1 - wz0 + 0.12, fx - 0.02, wy0 - 0.03, (wz0 + wz1) / 2);
  frame(0.08, 0.06, wz1 - wz0, lx, wy1, (wz0 + wz1) / 2);
  frame(0.08, wy1 - wy0, 0.06, lx, (wy0 + wy1) / 2, wz0);
  frame(0.08, wy1 - wy0, 0.06, lx, (wy0 + wy1) / 2, wz1);
  frame(0.05, wy1 - wy0, 0.04, lx, (wy0 + wy1) / 2, (wz0 + wz1) / 2);
  frame(0.05, 0.04, wz1 - wz0, lx, wy0 + (wy1 - wy0) * 0.62, (wz0 + wz1) / 2);
  for (const z of [wz0 - 0.32, wz1 + 0.32]) {
    const g = new THREE.PlaneGeometry(0.62, 2.95, 28, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22) * 0.035);
    g.computeVertexNormals();
    const m = mesh(g, M.linen);
    m.rotation.y = Math.PI / 2; m.position.set(-W / 2 + 0.14, 1.55, z); m.castShadow = false;
  }
  const rod = mesh(cyl(0.015, 0.015, wz1 - wz0 + 1.6, 12), M.brass);
  rod.rotation.x = Math.PI / 2; rod.position.set(-W / 2 + 0.14, 3.02, (wz0 + wz1) / 2);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), M.sky);
  sky.rotation.y = Math.PI / 2; sky.position.set(-14, 6, 0.7); root.add(sky);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), M.ground);
  ground.rotation.x = -Math.PI / 2; ground.position.set(-19.5, -0.3, 0); ground.receiveShadow = true; root.add(ground);
  const skirt = (w: number, d: number, x: number, z: number) => mesh(box(w, 0.09, d), M.trim).position.set(x, 0.045, z);
  skirt(W, 0.03, 0, -D / 2 + 0.015); skirt(W, 0.03, 0, D / 2 - 0.015); skirt(0.03, D, W / 2 - 0.015, 0); skirt(0.03, D, -W / 2 + 0.015, 0);

  // rug, sofa, table
  mesh(box(3.5, 0.016, 2.45), M.rug).position.set(0, 0.008, -1.55);
  const sofa = new THREE.Group(); root.add(sofa); sofa.position.set(0, 0, -D / 2 + 0.52);
  const sp = (geo: THREE.BufferGeometry, x: number, y: number, z: number, mat: THREE.Material = M.sofa) => { const m = mesh(geo, mat, sofa); m.position.set(x, y, z); return m; };
  sp(rbox(2.6, 0.22, 0.95, 0.05), 0, 0.2, 0);
  for (const x of [-1.2, 1.2]) for (const z of [-0.38, 0.38]) sp(cyl(0.025, 0.02, 0.1, 12), x, 0.05, z, M.wood);
  for (const x of [-0.8, 0, 0.8]) sp(rbox(0.78, 0.18, 0.8, 0.075, 4), x, 0.4, 0.06);
  sp(rbox(2.6, 0.52, 0.22, 0.08), 0, 0.56, -0.37);
  for (const x of [-0.8, 0, 0.8]) sp(rbox(0.78, 0.44, 0.2, 0.09, 4), x, 0.74, -0.2).rotation.x = -0.14;
  for (const x of [-1.21, 1.21]) sp(rbox(0.2, 0.44, 0.95, 0.08), x, 0.5, 0);
  for (const [x, rz] of [[-0.82, 0.16], [0.86, -0.12]]) sp(rbox(0.4, 0.38, 0.13, 0.06, 4), x, 0.72, -0.05, M.accent).rotation.set(-0.2, 0, rz);
  const tableG = new THREE.Group(); root.add(tableG); tableG.position.set(0, 0, -1.4);
  mesh(cyl(0.58, 0.58, 0.05, 48), M.wood, tableG).position.y = 0.42;
  mesh(cyl(0.16, 0.22, 0.38, 32), M.wood, tableG).position.y = 0.2;
  const book1 = mesh(rbox(0.32, 0.05, 0.24, 0.01), M.accent, tableG); book1.position.set(-0.18, 0.47, 0.05); book1.rotation.y = 0.3;
  const book2 = mesh(rbox(0.28, 0.04, 0.2, 0.01), M.cream, tableG); book2.position.set(-0.17, 0.515, 0.04); book2.rotation.y = 0.1;
  const bowl = mesh(new THREE.SphereGeometry(0.12, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.ceramic, tableG);
  bowl.position.set(0.22, 0.56, -0.08); bowl.scale.y = 0.6;

  // armchair + side table
  const chair = new THREE.Group(); root.add(chair); chair.position.set(2.35, 0, -0.95); chair.rotation.y = -1.05;
  const cp = (geo: THREE.BufferGeometry, x: number, y: number, z: number, mat: THREE.Material = M.armchair) => { const m = mesh(geo, mat, chair); m.position.set(x, y, z); return m; };
  cp(rbox(0.82, 0.17, 0.78, 0.07, 4), 0, 0.38, 0.02);
  cp(rbox(0.82, 0.6, 0.17, 0.08, 4), 0, 0.66, -0.34).rotation.x = -0.14;
  for (const x of [-0.44, 0.44]) cp(rbox(0.12, 0.28, 0.72, 0.05), x, 0.5, 0);
  for (const x of [-0.34, 0.34]) for (const z of [-0.3, 0.3]) cp(cyl(0.022, 0.014, 0.32, 10), x, 0.15, z, M.wood).rotation.set(z * 0.35, 0, -x * 0.35);
  const side = new THREE.Group(); root.add(side); side.position.set(3.15, 0, -1.95);
  mesh(cyl(0.24, 0.24, 0.035, 40), M.wood, side).position.y = 0.55;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    mesh(cyl(0.012, 0.012, 0.55, 8), M.metal, side).position.set(Math.cos(a) * 0.15, 0.27, Math.sin(a) * 0.15);
  }
  const vasePts = [0.0, 0.07, 0.1, 0.09, 0.05, 0.045, 0.06].map((x, i) => new THREE.Vector2(Math.max(x, 0.001), i * 0.045));
  mesh(new THREE.LatheGeometry(vasePts, 32), M.accent, side).position.y = 0.57;

  // floor lamp
  const lamp = new THREE.Group(); root.add(lamp); lamp.position.set(-1.78, 0, -3.05);
  mesh(cyl(0.16, 0.17, 0.03, 32), M.metal, lamp).position.y = 0.015;
  mesh(cyl(0.013, 0.013, 1.5, 12), M.brass, lamp).position.y = 0.77;
  const shade = mesh(cyl(0.16, 0.23, 0.3, 40, true), M.shade, lamp); shade.position.y = 1.58; shade.castShadow = false;
  const lampLight = new THREE.PointLight('#ffb36b', 7, 7, 2); lampLight.position.set(0, 1.5, 0); lamp.add(lampLight);

  // plants
  function plant(x: number, z: number, scale: number, parent: THREE.Object3D = root) {
    const g = new THREE.Group(); parent.add(g); g.position.set(x, 0, z); g.scale.setScalar(scale);
    mesh(cyl(0.22, 0.17, 0.42, 32), M.ceramic, g).position.y = 0.21;
    mesh(cyl(0.2, 0.2, 0.02, 24), M.wood, g).position.y = 0.41;
    const leaf = new THREE.SphereGeometry(0.5, 14, 8);
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, tilt = 0.25 + r() * 0.75, len = 0.5 + r() * 0.45;
      const pivot = new THREE.Group(); g.add(pivot);
      pivot.position.y = 0.42; pivot.rotation.set(0, a, tilt);
      const l = mesh(leaf, M.plant, pivot);
      l.scale.set(0.13, len, 0.025); l.position.y = len * 0.5;
    }
    return g;
  }
  plant(3.25, -2.95, 1.25);

  // wall art
  for (const [x, mat] of [[-0.52, M.artA], [0.52, M.artB]] as const) {
    mesh(box(0.78, 0.98, 0.04), M.wood).position.set(x, 1.82, -D / 2 + 0.02);
    const a = mesh(new THREE.PlaneGeometry(0.68, 0.88), mat); a.position.set(x, 1.82, -D / 2 + 0.042); a.castShadow = false;
  }

  // pendant
  const pend = new THREE.Group(); root.add(pend); pend.position.set(0, 0, -1.4);
  const cord = mesh(cyl(0.006, 0.006, 0.9, 6), M.metal, pend); cord.position.y = H - 0.45; cord.castShadow = false;
  const dome = mesh(new THREE.SphereGeometry(0.26, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.brass, pend); dome.position.y = H - 0.9; dome.castShadow = false;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), M.bulb); bulb.position.y = H - 0.93; pend.add(bulb);
  const pendLight = new THREE.PointLight('#ffc58a', 6, 6, 2); pendLight.position.y = H - 1.0; pend.add(pendLight);

  // shelves (right wall)
  for (const y of [1.25, 1.75]) {
    mesh(box(0.28, 0.04, 1.7), M.wood).position.set(W / 2 - 0.14, y, 0.6);
    let z = -0.2;
    while (z < 1.35) {
      const h = 0.2 + r() * 0.12, w = 0.03 + r() * 0.04;
      mesh(box(0.2, h, w), r() > 0.6 ? M.accent : M.cream).position.set(W / 2 - 0.15, y + 0.02 + h / 2, z);
      z += w + 0.005;
      if (r() > 0.85) z += 0.25;
    }
  }

  // sideboard + mirror (front wall)
  const sideboard = new THREE.Group(); root.add(sideboard); sideboard.position.set(0.6, 0, D / 2 - 0.26);
  mesh(rbox(2.2, 0.62, 0.46, 0.02), M.wood, sideboard).position.y = 0.45;
  for (const x of [-1.0, 1.0]) mesh(cyl(0.02, 0.02, 0.14, 8), M.metal, sideboard).position.set(x, 0.07, 0);
  mesh(new THREE.TorusGeometry(0.46, 0.025, 12, 64), M.brass, sideboard).position.set(0, 1.62, 0.2);
  const glass = mesh(new THREE.CircleGeometry(0.45, 64), M.mirror, sideboard); glass.position.set(0, 1.62, 0.21); glass.rotation.y = Math.PI;
  plant(-0.75, 0, 0.55, sideboard).position.y = 0.76;

  // lights
  scene.add(new THREE.HemisphereLight('#fff4e6', '#3a3028', 0.55));
  const sun = new THREE.DirectionalLight('#ffe0b0', 3.4);
  sun.position.set(-9, 6.5, 2.2);
  sun.target.position.set(0, 0, 0.4);
  scene.add(sun, sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 4;

  return {
    scene,
    center: new THREE.Vector3(0, 1.45, -0.6),
    dispose() {
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
      Object.values(M).forEach((m) => m.dispose());
      Object.values(tex).forEach((t) => t.dispose());
      artTexA.dispose(); artTexB.dispose();
      envRT.dispose();
    },
  };
}
