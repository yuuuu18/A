// ================================================================
//  校园数字孪生系统  v3.0
//  高级功能：昼夜循环 / 自动漫游 / 建筑生长 / 喷泉粒子 /
//  车辆动画 / 树木摇曳 / 浮动标签 / 脉冲高亮
// ================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ================================================================
//  一、场景 / 相机 / 渲染器
// ================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6ab0e0);
scene.fog = new THREE.Fog(0x6ab0e0, 70, 120);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.prepend(renderer.domElement);

// ================================================================
//  二、灯光
// ================================================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3a7d44, 0.5);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xffeedd, 1.5);
sun.position.set(30, 45, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 100;
const sc = sun.shadow.camera;
sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x8899ff, 0.35);
fill.position.set(-25, 15, -20);
scene.add(fill);

// ================================================================
//  三、轨道控制器
// ================================================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 90;
controls.maxPolarAngle = Math.PI / 2.15;
controls.target.set(0, 1, 0);
controls.autoRotate = false;
controls.autoRotateSpeed = 0.6;
controls.update();

// ================================================================
//  四、视角管理（透视 / 鸟瞰 / 正面 / 俯视）
// ================================================================
const VIEWS = {
  perspective: { pos: [22, 14, 22], target: [0, 1, 0], label: '透视视角' },
  bird:        { pos: [0, 50, 0.1],  target: [0, 0, 0], label: '鸟瞰视角' },
  front:       { pos: [0, 5, 32],    target: [0, 2, 0], label: '正面视角' },
  top:         { pos: [0, 42, 26],   target: [0, 1, 0], label: '俯视视角' },
};
let currentView = 'perspective';
let isViewAnimating = false;

function switchView(name) {
  const v = VIEWS[name];
  if (!v || isViewAnimating) return;
  currentView = name;
  document.getElementById('view-label').textContent = v.label;
  if (controls.autoRotate) {
    controls.autoRotate = false;
    tourMode = false;
    document.getElementById('tour-btn')?.classList.remove('active');
  }
  animateCam(new THREE.Vector3(...v.pos), new THREE.Vector3(...v.target));
}

function animateCam(targetPos, targetLookAt, dur = 800) {
  isViewAnimating = true;
  const sP = camera.position.clone(), sT = controls.target.clone();
  const t0 = performance.now();
  function step() {
    const t = Math.min((performance.now() - t0) / dur, 1);
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    camera.position.lerpVectors(sP, targetPos, e);
    controls.target.lerpVectors(sT, targetLookAt, e);
    controls.update();
    if (t < 1) requestAnimationFrame(step); else isViewAnimating = false;
  }
  step();
}

// ================================================================
//  五、高级功能全局变量
// ================================================================
const clock = new THREE.Clock();
let timeOfDay = 0.5;
let tourMode = false;
const buildings = [];
const treeGroups = [];
const cars = [];
let fountainData = null;
let lampMat = null;
let userControllingTime = false;

// ================================================================
//  六、图层系统（四类独立切换）
// ================================================================
const LAYER_NAMES = ['buildings', 'roads', 'trees', 'details'];
const layers = {};
for (const name of LAYER_NAMES) {
  const g = new THREE.Group();
  g.name = name;
  scene.add(g);
  layers[name] = g;
}

function toggleLayer(name, visible) {
  const g = layers[name];
  if (!g) return;
  g.visible = visible;
  document.querySelectorAll(`.layer-item[data-layer="${name}"]`).forEach(el => {
    el.classList.toggle('active', visible);
  });
}

// ================================================================
//  七、精化校园模型构建
// ================================================================
const buildingDataSet = [];

/* ---------- 7-1 地面 ---------- */
function buildGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshStandardMaterial({ color: 0x5a8f4c, roughness: 0.9, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  layers.details.add(ground);

  const grid = new THREE.GridHelper(70, 24, 0x6a9f5c, 0x4a7f3c);
  grid.position.y = 0.01;
  layers.details.add(grid);
}

/* ---------- 7-2 精化建筑 ---------- */
const SHARED = {
  glass: new THREE.MeshStandardMaterial({
    color: 0x88ccff, emissive: 0x336699, emissiveIntensity: 0.12,
    roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.85,
  }),
  frame: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 }),
  base:  new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 }),
  roof:  new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 }),
  door:  new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 }),
  canopy: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 }),
};

/* ---------- 浮动标签系统 ---------- */
const labelTextureCache = new Map();

function createBuildingLabel(name) {
  if (labelTextureCache.has(name)) {
    return new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTextureCache.get(name),
      transparent: true, depthTest: false, depthWrite: false,
    }));
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 20;
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGrad.addColorStop(0, 'rgba(10,10,40,0.75)');
  bgGrad.addColorStop(1, 'rgba(10,10,40,0.60)');
  ctx.fillStyle = bgGrad;
  const rx = 60, ry = 20, rw = canvas.width - 120, rh = canvas.height - 40;
  ctx.beginPath();
  ctx.moveTo(rx + 30, ry);
  ctx.lineTo(rx + rw - 30, ry);
  ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + 30);
  ctx.lineTo(rx + rw, ry + rh - 30);
  ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - 30, ry + rh);
  ctx.lineTo(rx + 30, ry + rh);
  ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - 30);
  ctx.lineTo(rx, ry + 30);
  ctx.quadraticCurveTo(rx, ry, rx + 30, ry);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(100,255,218,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = 'Bold 38px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(100,255,218,0.95)';
  ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 2);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 3;
  ctx.strokeText(name, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  labelTextureCache.set(name, texture);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false,
  }));
  sprite.scale.set(2.6, 0.65, 1);
  return sprite;
}

function buildBuilding(x, z, w, h, d, color, data, options = {}) {
  const grp = new THREE.Group();
  const { roofStyle = 'flat', windowColor } = options;
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08 });
  const winCol = windowColor || 0x88ccff;

  // --- 主体 ---
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.isBuilding = true;
  body.userData.buildingInfo = data;
  grp.add(body);

  // --- 楼层分隔线 ---
  const floorDivMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
  const floorCount = Math.max(1, Math.floor(h / 3));
  for (let f = 1; f < floorCount; f++) {
    const y = f * (h / floorCount);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.06, d * 1.02), floorDivMat);
    strip.position.y = y;
    strip.receiveShadow = true;
    grp.add(strip);
  }

  // --- 窗户系统 ---
  const winW = 0.55, winH = 0.75;
  const cols = Math.max(1, Math.floor((w - 1.2) / 1.6));
  const rows = Math.max(1, floorCount);
  const spacingX = w / (cols + 1);
  const spacingY = h / (rows + 1);

  for (const sign of [1, -1]) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = (c - (cols - 1) / 2) * spacingX;
        const wy = (r + 1) * spacingY;
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(winW + 0.12, winH + 0.12, 0.06),
          SHARED.frame
        );
        frame.position.set(wx, wy, sign * (d / 2 + 0.03));
        grp.add(frame);
        const glassMat = winCol === 0x88ccff ? SHARED.glass : SHARED.glass.clone();
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
        glass.position.set(wx, wy, sign * (d / 2 + 0.05));
        if (sign < 0) glass.rotation.y = Math.PI;
        grp.add(glass);
      }
    }
  }

  for (const sign of [1, -1]) {
    const sideCols = Math.max(1, Math.floor((d - 0.8) / 1.8));
    const sideSpacing = d / (sideCols + 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < sideCols; c++) {
        const sz = (c - (sideCols - 1) / 2) * sideSpacing;
        const sy = (r + 1) * spacingY;
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, winH + 0.12, winW + 0.12),
          SHARED.frame
        );
        frame.position.set(sign * (w / 2 + 0.03), sy, sz);
        grp.add(frame);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(winH * 0.7, winW), SHARED.glass);
        glass.position.set(sign * (w / 2 + 0.05), sy, sz);
        glass.rotation.y = Math.PI / 2;
        grp.add(glass);
      }
    }
  }

  // --- 屋顶 ---
  const rw = w * 1.06, rd = d * 1.06;
  if (roofStyle === 'gable') {
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
    const shape = new THREE.Shape();
    const hw = w / 2 * 1.1;
    shape.moveTo(-hw, 0);
    shape.lineTo(0, 1.8);
    shape.lineTo(hw, 0);
    shape.lineTo(-hw, 0);
    const extrudeSettings = { depth: d * 1.1, bevelEnabled: false };
    const roofMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, extrudeSettings), roofMat);
    roofMesh.position.set(0, h, -d / 2 * 1.1);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    grp.add(roofMesh);
  } else {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.25, rd), SHARED.roof);
    slab.position.y = h + 0.125;
    slab.castShadow = true;
    slab.receiveShadow = true;
    grp.add(slab);
    const paraMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const ph = 0.45;
    for (const [px, pz, pw, pd_] of [[0, d / 2 * 1.03, rw, 0.12],
                                       [0, -d / 2 * 1.03, rw, 0.12],
                                       [w / 2 * 1.03, 0, 0.12, rd],
                                       [-w / 2 * 1.03, 0, 0.12, rd]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd_), paraMat);
      p.position.set(px, h + 0.35, pz);
      grp.add(p);
    }
  }

  // --- 地基 ---
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.1, 0.4, d * 1.1),
    SHARED.base
  );
  base.position.y = 0.2;
  base.receiveShadow = true;
  grp.add(base);

  // --- 入口雨棚 ---
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.08, 0.8),
    SHARED.canopy
  );
  canopy.position.set(0, 0.35, d / 2 + 0.25);
  grp.add(canopy);

  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
  for (const px of [-0.6, 0.6]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35), pillarMat);
    pillar.position.set(px, 0.175, d / 2 + 0.25);
    grp.add(pillar);
  }

  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), SHARED.door);
  door.position.set(0, 0.75, d / 2 + 0.01);
  grp.add(door);

  grp.position.set(x, 0, z);
  layers.buildings.add(grp);
  buildings.push(grp);

  // --- 浮动标签 ---
  const labelY = h + (roofStyle === 'gable' ? 2.8 : 1.5);
  const label = createBuildingLabel(data.name);
  label.position.set(x, labelY, z);
  layers.buildings.add(label);

  data.position = { x, z };
  data.size = { w, h, d };
  buildingDataSet.push(data);
  return grp;
}

/* ---------- 7-3 精化道路 ---------- */
function buildRoad(x, z, w, l, options = {}) {
  const { hasSidewalk = true, hasCenterLine = true } = options;

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.95, metalness: 0 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(w, l), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(x, 0.015, z);
  road.receiveShadow = true;
  road.userData.isRoad = true;
  layers.roads.add(road);

  const curbMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.9 });
  for (const sign of [-1, 1]) {
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.08, l),
      curbMat
    );
    curb.position.set(x + sign * (w / 2 + 0.06), 0.04, z);
    layers.roads.add(curb);
  }

  if (hasCenterLine && w > 2.5) {
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.7 });
    const dashLen = 0.8, gapLen = 0.6, totalLen = dashLen + gapLen;
    const count = Math.floor(l / totalLen);
    for (let i = 0; i < count; i++) {
      const dz = (i - (count - 1) / 2) * totalLen;
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.15, dashLen), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.03, z + dz);
      layers.roads.add(dash);
    }
  }

  if (w > 4) {
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    for (const sign of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.1, l * 0.9), edgeMat);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(x + sign * (w / 2 - 0.3), 0.03, z);
      layers.roads.add(edge);
    }
  }

  if (hasSidewalk) {
    const swMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.9 });
    for (const sign of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.8, l), swMat);
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(x + sign * (w / 2 + 0.5), 0.018, z);
      sw.receiveShadow = true;
      layers.roads.add(sw);
    }
  }
}

/* ---------- 7-4 斑马线 ---------- */
function buildCrosswalk(x, z, roadW) {
  const crossMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const stripeW = 0.3, stripeGap = 0.2, stripeLen = roadW * 0.85;
  const count = 5;
  for (let i = 0; i < count; i++) {
    const sz = (i - (count - 1) / 2) * (stripeW + stripeGap);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(stripeLen, stripeW), crossMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(x, 0.025, z + sz);
    layers.roads.add(stripe);
  }
}

/* ---------- 7-5 多种树木 ---------- */
function buildDeciduousTree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.25 * scale, 1.2 * scale), trunkMat);
  trunk.position.y = 0.6 * scale;
  trunk.castShadow = true;
  g.add(trunk);

  const hue = 0.25 + Math.random() * 0.12;
  const canopyMat = () => new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(hue, 0.6, 0.28 + Math.random() * 0.12),
    roughness: 0.85,
  });
  const mainCrown = new THREE.Mesh(
    new THREE.SphereGeometry(0.8 * scale, 7, 7),
    canopyMat()
  );
  mainCrown.position.set(
    (Math.random() - 0.5) * 0.3 * scale,
    (1.6 + Math.random() * 0.2) * scale,
    (Math.random() - 0.5) * 0.3 * scale
  );
  mainCrown.castShadow = true;
  g.add(mainCrown);

  for (let i = 0; i < 2; i++) {
    const sub = new THREE.Mesh(
      new THREE.SphereGeometry((0.4 + Math.random() * 0.2) * scale, 6, 6),
      canopyMat()
    );
    sub.position.set(
      (Math.random() - 0.5) * 0.7 * scale,
      (1.3 + i * 0.5 + Math.random() * 0.2) * scale,
      (Math.random() - 0.5) * 0.7 * scale
    );
    sub.castShadow = true;
    g.add(sub);
  }

  g.position.set(x, 0, z);
  treeGroups.push(g);
  layers.trees.add(g);
}

function buildPineTree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5C3A1E, roughness: 0.9 });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08 * scale, 0.18 * scale, 1.5 * scale),
    trunkMat
  );
  trunk.position.y = 0.75 * scale;
  trunk.castShadow = true;
  g.add(trunk);

  const needleMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.22, 0.55, 0.22),
    roughness: 0.9,
  });
  const layers_ = [
    { y: 1.3 * scale, r: 0.6 * scale, h: 0.6 * scale },
    { y: 1.8 * scale, r: 0.5 * scale, h: 0.5 * scale },
    { y: 2.3 * scale, r: 0.35 * scale, h: 0.4 * scale },
    { y: 2.7 * scale, r: 0.2 * scale, h: 0.3 * scale },
  ];
  for (const ly of layers_) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(ly.r, ly.h, 7), needleMat);
    cone.position.y = ly.y;
    cone.castShadow = true;
    g.add(cone);
  }

  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  treeGroups.push(g);
  layers.trees.add(g);
}

function buildBush(x, z, scale = 1) {
  const g = new THREE.Group();
  const hue = 0.28 + Math.random() * 0.15;
  const bushMat = () => new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(hue, 0.55, 0.3 + Math.random() * 0.1),
    roughness: 0.9,
  });
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const r = (0.25 + Math.random() * 0.2) * scale;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), bushMat());
    ball.position.set(
      (Math.random() - 0.5) * 0.5 * scale,
      r * 0.8,
      (Math.random() - 0.5) * 0.5 * scale
    );
    ball.castShadow = true;
    g.add(ball);
  }
  g.position.set(x, 0, z);
  layers.trees.add(g);
}

/* ---------- 7-6 中心广场 ---------- */
function buildPlaza() {
  const plazaMat = new THREE.MeshStandardMaterial({ color: 0xccbbaa, roughness: 0.9 });
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(5, 28), plazaMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.018, -1);
  plaza.receiveShadow = true;
  layers.details.add(plaza);

  const ringMat = new THREE.MeshStandardMaterial({ color: 0xbbaa99, roughness: 0.9 });
  for (let r = 1; r <= 4; r++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.0 - 0.04, r * 1.0 + 0.04, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.02, -1);
    layers.details.add(ring);
  }

  // — 现代雕塑 —
  const scMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.85, roughness: 0.15 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.25), scMat);
  base.position.set(0, 0.125, -1);
  layers.details.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.8), scMat);
  pole.position.set(0, 1.65, -1);
  layers.details.add(pole);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), scMat);
  ball.position.set(0, 3.3, -1);
  layers.details.add(ball);
  const ringDeco = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 8, 16), scMat);
  ringDeco.position.set(0, 2.8, -1);
  ringDeco.rotation.x = Math.PI / 3;
  layers.details.add(ringDeco);

  // — 长椅 —
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.9 });
  const benchMeta = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7 });
  for (const [bx, bz] of [[-3, 1.5], [3, 1.5], [-3, -3.5], [3, -3.5]]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.4), benchMat);
    seat.position.set(bx, 0.2, bz);
    seat.castShadow = true;
    layers.details.add(seat);
    for (const lx of [-0.45, 0.45]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15), benchMeta);
      leg.position.set(bx + lx, 0.075, bz);
      layers.details.add(leg);
    }
  }

  // — 路灯 —
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 });
  lampMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffdd88, emissiveIntensity: 0.3 });
  for (const [lx, lz] of [[-4.5, -0.5], [4.5, -0.5], [-4.5, -1.5], [4.5, -1.5]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.8), lightMat);
    post.position.set(lx, 0.9, lz);
    post.castShadow = true;
    layers.details.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.03), lightMat);
    arm.position.set(lx + 0.15, 1.8, lz);
    layers.details.add(arm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), lampMat);
    lamp.position.set(lx + 0.3, 1.78, lz);
    layers.details.add(lamp);
  }
}

/* ---------- 7-7 喷泉粒子系统 ---------- */
function createFountain() {
  const particleCount = 300;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];

  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.6 + Math.random() * 0.9;
    positions[i * 3] = (Math.random() - 0.5) * 0.1;
    positions[i * 3 + 1] = 0.15 + Math.random() * 0.2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
    velocities.push({
      x: Math.cos(angle) * speed * 0.35,
      y: speed * 1.8 + Math.random() * 0.5,
      z: Math.sin(angle) * speed * 0.35,
      phase: Math.random() * Math.PI * 2,
    });
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const cctx = canvas.getContext('2d');
  const gradient = cctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(180,230,255,1)');
  gradient.addColorStop(0.4, 'rgba(120,210,255,0.7)');
  gradient.addColorStop(1, 'rgba(80,180,255,0)');
  cctx.fillStyle = gradient;
  cctx.fillRect(0, 0, 32, 32);
  const particleTexture = new THREE.CanvasTexture(canvas);

  const material = new THREE.PointsMaterial({
    color: 0x88ddff,
    size: 0.12,
    map: particleTexture,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const particles = new THREE.Points(geometry, material);
  particles.position.set(0, 0.3, -1);
  layers.details.add(particles);

  fountainData = { particles, velocities, geometry };
}

function updateFountain(delta) {
  if (!fountainData) return;
  const { particles, velocities, geometry } = fountainData;
  const pos = geometry.attributes.position.array;

  for (let i = 0; i < velocities.length; i++) {
    const v = velocities[i];
    v.y -= 3.5 * delta;
    pos[i * 3] += v.x * delta + Math.sin(clock.getElapsedTime() * 2 + v.phase) * 0.002;
    pos[i * 3 + 1] += v.y * delta;
    pos[i * 3 + 2] += v.z * delta + Math.cos(clock.getElapsedTime() * 2 + v.phase) * 0.002;

    if (pos[i * 3 + 1] < 0) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 0.9;
      pos[i * 3] = (Math.random() - 0.5) * 0.1;
      pos[i * 3 + 1] = 0.15 + Math.random() * 0.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
      v.x = Math.cos(angle) * speed * 0.35;
      v.y = speed * 1.8 + Math.random() * 0.5;
      v.z = Math.sin(angle) * speed * 0.35;
    }
  }
  geometry.attributes.position.needsUpdate = true;
}

/* ---------- 7-8 车辆动画 ---------- */
function createCar(color, path, offset = 0) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.35), bodyMat);
  body.position.y = 0.1;
  body.castShadow = true;
  g.add(body);

  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.6 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.32), cabinMat);
  cabin.position.set(0.05, 0.22, 0);
  g.add(cabin);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  for (const wx of [-0.22, 0.22]) {
    for (const wz of [-0.18, 0.18]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 6), wheelMat);
      wheel.position.set(wx, 0.03, wz);
      wheel.rotation.x = Math.PI / 2;
      g.add(wheel);
    }
  }

  // Headlights
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffdd, emissive: 0xffffaa, emissiveIntensity: 0.3 });
  const hl1 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), hlMat);
  hl1.position.set(0.35, 0.08, -0.1);
  g.add(hl1);
  const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), hlMat);
  hl2.position.set(0.35, 0.08, 0.1);
  g.add(hl2);

  // Taillights
  const tlMat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff0000, emissiveIntensity: 0.2 });
  const tl1 = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), tlMat);
  tl1.position.set(-0.35, 0.08, -0.1);
  g.add(tl1);
  const tl2 = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), tlMat);
  tl2.position.set(-0.35, 0.08, 0.1);
  g.add(tl2);

  g.userData.path = path;
  g.userData.progress = offset;
  g.userData.speed = 0.4 + Math.random() * 0.2;

  const start = path[0];
  g.position.set(start[0], 0.05, start[1]);
  g.castShadow = true;

  layers.roads.add(g);
  cars.push(g);
  return g;
}

function updateCars(delta) {
  if (layers.roads && !layers.roads.visible) return;
  const time = clock.getElapsedTime();
  cars.forEach(car => {
    const path = car.userData.path;
    const speed = car.userData.speed;
    let progress = car.userData.progress + delta * speed;

    if (progress >= path.length - 1) progress -= (path.length - 1);
    if (progress < 0) progress += (path.length - 1);

    const i = Math.max(0, Math.min(Math.floor(progress), path.length - 2));
    const t = progress - i;
    const p0 = path[i];
    const p1 = path[i + 1];

    const x = p0[0] + (p1[0] - p0[0]) * t;
    const z = p0[1] + (p1[1] - p0[1]) * t;
    car.position.set(x, 0.05, z);

    const dx = p1[0] - p0[0];
    const dz = p1[1] - p0[1];
    if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
      car.rotation.y = Math.atan2(dx, dz);
    }

    // Subtle bounce
    car.position.y = 0.05 + Math.sin(time * 5 + i) * 0.008;

    car.userData.progress = progress;
  });
}

/* ---------- 7-9 建筑生长动画 ---------- */
const entranceStartTime = { value: 0 };

function animateBuildingsIn() {
  entranceStartTime.value = performance.now();
  buildings.forEach((b, i) => {
    b.scale.set(0.3, 0.3, 0.3);
    b.userData.animatingIn = true;
    b.userData.animDelay = i * 40;
  });
}

/* ---------- 7-10 主构建函数 ---------- */
function buildCampus() {
  buildGround();
  buildPlaza();

  buildBuilding(0, -7, 16, 9, 11, 0x4a90d9, {
    name: '主教学楼', type: '教学楼', floors: 9,
    用途: '教学办公', capacity: '约3000人', area: '6300m²',
    description: '校园核心建筑，共9层。设有普通教室、多媒体教室、计算机房及教师办公区。',
  }, { roofStyle: 'gable' });

  buildBuilding(-12, -7, 10, 5, 11, 0x7b68ee, {
    name: '图书馆', type: '文化设施', floors: 5,
    用途: '阅览藏书', capacity: '约1500人', area: '3600m²',
    description: '现代化图书馆，藏书50万册，设有自习区、电子阅览室和学术报告厅。',
  }, { roofStyle: 'flat' });

  buildBuilding(12, -7, 11, 6, 11, 0x2ecc71, {
    name: '实验楼', type: '实验设施', floors: 6,
    用途: '实验教学', capacity: '约1200人', area: '4000m²',
    description: '配备物理、化学、生物等各类实验室及科研工作室。',
  }, { roofStyle: 'flat' });

  buildBuilding(-3, 10, 11, 4.5, 9, 0xe74c3c, {
    name: '行政楼', type: '办公楼', floors: 4,
    用途: '行政办公', capacity: '约200人', area: '2600m²',
    description: '学校行政办公核心区域，包括校长办公室、教务处、学生处等行政部门。',
  }, { roofStyle: 'flat' });

  buildBuilding(-14, 10, 9, 3.5, 10, 0xe67e22, {
    name: '学生食堂', type: '生活服务', floors: 3,
    用途: '餐饮服务', capacity: '约2000人', area: '3000m²',
    description: '三层大型食堂，提供多样化餐饮选择，满足全校师生用餐需求。',
  }, { roofStyle: 'flat' });

  for (const [i, dx] of [[0, -9], [1, 0], [2, 9]]) {
    buildBuilding(dx, -19, 8, 6, 9, 0xf39c12, {
      name: `学生宿舍${['A栋','B栋','C栋'][i]}`,
      type: '宿舍', floors: 6, 用途: '学生住宿', capacity: '约800人', area: '2200m²',
      description: '标准六层学生宿舍，配备空调、热水及公共洗衣房。',
    }, { roofStyle: 'flat' });
  }

  buildBuilding(14, 12, 16, 3, 11, 0x3498db, {
    name: '体育馆', type: '体育设施', floors: 2,
    用途: '体育健身', capacity: '约3000人', area: '4800m²',
    description: '综合性体育馆，设有篮球场、羽毛球场、乒乓球室及健身中心。',
  }, { roofStyle: 'gable' });

  // ======== 道路 ========
  buildRoad(0, 0, 3.5, 40, { hasSidewalk: true, hasCenterLine: true });
  buildRoad(-12, -4, 3, 28, { hasSidewalk: true, hasCenterLine: true });
  buildRoad(12, -4, 3, 28, { hasSidewalk: true, hasCenterLine: true });
  buildRoad(0, 6, 34, 3.5, { hasSidewalk: true, hasCenterLine: false });
  buildRoad(0, -12, 34, 3.5, { hasSidewalk: true, hasCenterLine: false });
  buildRoad(0, -19, 30, 2.5, { hasSidewalk: false, hasCenterLine: false });

  buildCrosswalk(0, -2.5, 3);
  buildCrosswalk(0, 0.5, 3);

  // ======== 树木 ========
  const treeSpots = [
    { pos: [-5, -5],  type: 'deciduous' }, { pos: [5, -5],  type: 'deciduous' },
    { pos: [-5, 5],   type: 'deciduous' }, { pos: [5, 5],   type: 'deciduous' },
    { pos: [-6, -11], type: 'deciduous' }, { pos: [6, -11], type: 'deciduous' },
    { pos: [-6, 11],  type: 'deciduous' }, { pos: [6, 11],  type: 'deciduous' },
    { pos: [-17, -4], type: 'deciduous' }, { pos: [-17, 0], type: 'deciduous' },
    { pos: [-17, 6],  type: 'deciduous' }, { pos: [17, -4], type: 'deciduous' },
    { pos: [17, 0],   type: 'deciduous' }, { pos: [17, 6],  type: 'deciduous' },
    { pos: [-5, -17], type: 'pine' }, { pos: [5, -17],  type: 'pine' },
    { pos: [-5, -23], type: 'pine' }, { pos: [5, -23],  type: 'pine' },
    { pos: [-13, -17], type: 'pine' }, { pos: [13, -17], type: 'pine' },
    { pos: [-13, -23], type: 'pine' }, { pos: [13, -23], type: 'pine' },
    { pos: [-4, 2],   type: 'deciduous' }, { pos: [4, 2],    type: 'deciduous' },
    { pos: [-4, -4],  type: 'pine' },      { pos: [4, -4],   type: 'pine' },
    { pos: [-22, -22], type: 'pine' }, { pos: [22, -22], type: 'pine' },
    { pos: [-22, 22],  type: 'pine' }, { pos: [22, 22],  type: 'pine' },
    { pos: [-22, 0],   type: 'pine' }, { pos: [22, 0],   type: 'pine' },
    { pos: [0, -26],   type: 'pine' }, { pos: [0, 26],   type: 'pine' },
    { pos: [-6, 0],   type: 'deciduous' }, { pos: [6, 0],   type: 'deciduous' },
    { pos: [-18, -12], type: 'pine' },     { pos: [18, -12], type: 'pine' },
    { pos: [-8, 14],  type: 'deciduous' }, { pos: [8, 14],  type: 'deciduous' },
    { pos: [-8, -14], type: 'deciduous' }, { pos: [8, -14], type: 'deciduous' },
    { pos: [-21, -8], type: 'pine' },      { pos: [21, -8], type: 'pine' },
    { pos: [-16, 16], type: 'deciduous' }, { pos: [16, 16], type: 'deciduous' },
    { pos: [-16, -16], type: 'pine' },    { pos: [16, -16], type: 'pine' },
    { pos: [-10, -9], type: 'pine' },     { pos: [10, -9],  type: 'pine' },
  ];

  for (const t of treeSpots) {
    const [x, z] = t.pos;
    const scale = 0.7 + Math.random() * 0.6;
    if (t.type === 'deciduous') buildDeciduousTree(x, z, scale);
    else buildPineTree(x, z, scale);
  }

  for (const [x, z] of [
    [-2, 5.5], [2, 5.5], [-2, 7.5], [2, 7.5],
    [-10, -3], [10, -3], [-10, -5.5], [10, -5.5],
    [-4, 13], [4, 13],
  ]) {
    buildBush(x, z, 0.6 + Math.random() * 0.4);
  }

  // ======== 喷泉 ========
  createFountain();

  // ======== 车辆 ========
  const mainRoadPath = [[-1.5, -20], [-1.5, -15], [-1.5, -10], [-1.5, -5], [-1.5, 0], [-1.5, 5], [-1.5, 10], [-1.5, 15], [-1.5, 20]];
  const mainRoadPathBack = [[1.5, 20], [1.5, 15], [1.5, 10], [1.5, 5], [1.5, 0], [1.5, -5], [1.5, -10], [1.5, -15], [1.5, -20]];
  createCar(0xe74c3c, mainRoadPath, 0);
  createCar(0x3498db, mainRoadPathBack, 3);
  createCar(0xf1c40f, mainRoadPath, 5);
  createCar(0x2ecc71, mainRoadPathBack, 7);

  // ======== 建筑生长动画 ========
  animateBuildingsIn();

  // 更新统计
  let bCount = 0, tCount = 0;
  layers.buildings.traverse(c => { if (c.type === 'Group') bCount++; });
  layers.trees.traverse(c => { if (c.type === 'Group') tCount++; });
  let rCount = 0;
  layers.roads.traverse(c => { if (c.isMesh && c.userData.isRoad) rCount++; });
  document.getElementById('buildings-count').textContent = `建筑: ${bCount}`;
  document.getElementById('trees-count').textContent = `树木: ${tCount}`;
  document.getElementById('roads-count').textContent = `道路: ${rCount}`;
}

// ================================================================
//  八、昼夜循环系统
// ================================================================
function updateDayNight(time) {
  const angle = (time - 0.25) * Math.PI * 2;
  const dayFactor = Math.max(0, (Math.sin(angle) + 1) / 2);

  // Sun orbits
  const sunX = Math.cos(angle) * 40;
  const sunY = Math.max(-3, Math.sin(angle) * 40 + 5);
  sun.position.set(sunX, sunY, 20 * Math.sin(angle * 0.5));
  sun.intensity = 0.15 + dayFactor * 1.35;

  // Sky color
  const nightColor = new THREE.Color(0x0a0a2e);
  const dayColor = new THREE.Color(0x6ab0e0);
  const skyColor = nightColor.clone().lerp(dayColor, Math.pow(dayFactor, 0.6));
  scene.background = skyColor;

  // Fog
  if (dayFactor > 0.2) {
    const fogColor = new THREE.Color(0x6ab0e0).lerp(new THREE.Color(0x1a1a3e), 1 - dayFactor);
    scene.fog = new THREE.Fog(fogColor.getHex(), 50 + dayFactor * 20, 80 + dayFactor * 40);
  } else {
    scene.fog = new THREE.Fog(skyColor.getHex(), 15, 35);
  }

  // Ambient light
  ambientLight.intensity = 0.03 + dayFactor * 0.42;

  // Hemisphere light
  hemiLight.intensity = 0.05 + dayFactor * 0.45;

  // Fill light
  fill.intensity = dayFactor * 0.35;

  // Lamp brightness
  if (lampMat) {
    lampMat.emissiveIntensity = 0.1 + (1 - dayFactor) * 0.7;
  }

  // Update rendering exposure for night
  renderer.toneMappingExposure = 0.6 + dayFactor * 0.4;
}

// ================================================================
//  九、树木摇曳
// ================================================================
function updateTrees(time) {
  treeGroups.forEach((tree, i) => {
    const swayX = Math.sin(time * 0.8 + i * 0.7) * 0.012;
    const swayZ = Math.cos(time * 0.6 + i * 0.5) * 0.008;
    tree.rotation.x = swayX;
    tree.rotation.z = swayZ;
  });
}

// ================================================================
//  十、GLB 模型加载（备用）
// ================================================================
async function tryLoadGLB() {
  const loader = new GLTFLoader();
  const loadingEl = document.getElementById('loading');
  const paths = ['/models/campus.glb', './models/campus.glb', 'models/campus.glb'];

  for (const p of paths) {
    try {
      const gltf = await new Promise((resolve, reject) => {
        loader.load(p, resolve, undefined, reject);
      });
      loadingEl.classList.remove('show');

      const model = gltf.scene;
      model.traverse(c => { if (c.isMesh) { c.castShadow = c.receiveShadow = true; } });
      scene.add(model);

      let b = 0, t = 0, r = 0;
      model.traverse(c => {
        if (c.isMesh) {
          const n = c.name.toLowerCase();
          if (/建筑|build/.test(n)) b++;
          else if (/树|tree/.test(n)) t++;
          else if (/路|road/.test(n)) r++;
        }
      });
      document.getElementById('buildings-count').textContent = `建筑: ${b}`;
      document.getElementById('trees-count').textContent = `树木: ${t}`;
      document.getElementById('roads-count').textContent = `道路: ${r}`;
      console.log(`GLB 模型加载成功: ${p}`);
      return;
    } catch (_) { /* continue */ }
  }

  loadingEl.classList.remove('show');
  buildCampus();
}

// ================================================================
//  十一、交互控制（点击拾取 + 悬停高亮 + 信息面板）
// ================================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selectedMesh = null;
let hoveredMesh = null;
const origEmissive = new Map();

function getBuildingMeshes() {
  const meshes = [];
  scene.traverse(c => { if (c.isMesh && c.userData.isBuilding) meshes.push(c); });
  return meshes;
}

function highlight(mesh) {
  if (mesh === hoveredMesh) return;
  if (hoveredMesh?.material) {
    const c = origEmissive.get(hoveredMesh);
    if (c !== undefined) hoveredMesh.material.emissive.setHex(c);
  }
  if (mesh?.material?.emissive !== undefined) {
    if (!origEmissive.has(mesh)) origEmissive.set(mesh, mesh.material.emissive.getHex());
    mesh.material.emissive.setHex(0x444444);
    hoveredMesh = mesh;
  }
}

function clearHighlight() {
  if (hoveredMesh?.material) {
    const c = origEmissive.get(hoveredMesh);
    if (c !== undefined) hoveredMesh.material.emissive.setHex(c);
    hoveredMesh = null;
  }
}

/* 点击拾取 */
renderer.domElement.addEventListener('click', e => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(getBuildingMeshes());
  if (hits.length > 0) {
    const obj = hits[0].object;
    const info = obj.userData.buildingInfo;
    if (info) {
      showInfoPanel(info);
      // Restore previous selection
      if (selectedMesh && selectedMesh !== obj) {
        const c = origEmissive.get(selectedMesh);
        if (c !== undefined) selectedMesh.material.emissive.setHex(c);
      }
      selectedMesh = obj;
      highlight(obj);
    }
  } else {
    // Deselect
    if (selectedMesh) {
      const c = origEmissive.get(selectedMesh);
      if (c !== undefined) selectedMesh.material.emissive.setHex(c);
      selectedMesh = null;
      document.getElementById('panel-title').textContent = '🏫 校园数字孪生系统';
      document.getElementById('panel-content').innerHTML = '点击建筑查看详细信息';
    }
  }
});

/* 悬停高亮 */
renderer.domElement.addEventListener('pointermove', e => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(getBuildingMeshes());
  if (hits.length > 0 && hits[0].object !== selectedMesh) {
    renderer.domElement.style.cursor = 'pointer';
    highlight(hits[0].object);
  } else {
    renderer.domElement.style.cursor = 'default';
    if (!selectedMesh) clearHighlight();
  }
});

/* 用户交互时退出漫游 */
renderer.domElement.addEventListener('pointerdown', () => {
  if (controls.autoRotate) {
    controls.autoRotate = false;
    tourMode = false;
    document.getElementById('tour-btn')?.classList.remove('active');
  }
});

/** 信息面板 */
function showInfoPanel(info) {
  const title = document.getElementById('panel-title');
  const content = document.getElementById('panel-content');
  title.textContent = `🏫 ${info.name}`;
  content.innerHTML = `
    <div style="border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px;margin-bottom:8px;">
      <span style="color:#64ffda;">类型：</span>${info.type}
      <span style="color:#64ffda;margin-left:14px;">楼层：</span>${info.floors}层
    </div>
    <div><span style="color:#64ffda;">用途：</span>${info.用途}</div>
    <div><span style="color:#64ffda;">容纳：</span>${info.capacity}</div>
    <div><span style="color:#64ffda;">面积：</span>${info.area}</div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);font-size:13px;color:#999;">
      ${info.description}
    </div>
  `;
  content.style.opacity = '0';
  content.style.transform = 'translateY(8px)';
  requestAnimationFrame(() => {
    content.style.transition = 'all 0.35s ease';
    content.style.opacity = '1';
    content.style.transform = 'translateY(0)';
  });
}

// ================================================================
//  十二、UI 控制事件
// ================================================================

/* 视角切换按钮 */
document.querySelectorAll('.btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    switchView(btn.dataset.view);
  });
});

/* 图层切换 */
document.querySelectorAll('.layer-item').forEach(el => {
  el.addEventListener('click', () => {
    const name = el.dataset.layer;
    if (!name) return;
    const visible = !el.classList.contains('active');
    toggleLayer(name, visible);
  });
});

/* 自动漫游切换 */
document.getElementById('tour-btn')?.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  tourMode = controls.autoRotate;
  document.getElementById('tour-btn')?.classList.toggle('active', tourMode);
  if (tourMode) switchView('bird');
});

/* 时间滑块 */
const timeSlider = document.getElementById('time-slider');
const timeLabel = document.getElementById('time-label');
if (timeSlider && timeLabel) {
  timeSlider.addEventListener('pointerdown', () => { userControllingTime = true; });
  timeSlider.addEventListener('input', () => {
    timeOfDay = parseFloat(timeSlider.value);
    const hour = Math.floor(timeOfDay * 24);
    const min = Math.floor((timeOfDay * 24 - hour) * 60);
    timeLabel.textContent = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    updateDayNight(timeOfDay);
  });
  timeSlider.addEventListener('change', () => { userControllingTime = false; });
  timeSlider.addEventListener('pointerup', () => { userControllingTime = false; });
}

// ================================================================
//  十三、键盘快捷键
// ================================================================
window.addEventListener('keydown', e => {
  const map = { '1': 'perspective', '2': 'bird', '3': 'front', '4': 'top' };
  const view = map[e.key];
  if (view) {
    switchView(view);
    document.querySelectorAll('.btn').forEach(b =>
      b.classList.toggle('active', b.dataset.view === view)
    );
  }
  const layerMap = { 'q': 'buildings', 'w': 'roads', 'e': 'trees', 'r': 'details' };
  const lname = layerMap[e.key.toLowerCase()];
  if (lname) {
    const el = document.querySelector(`.layer-item[data-layer="${lname}"]`);
    if (el) {
      const visible = !el.classList.contains('active');
      toggleLayer(lname, visible);
    }
  }
  // T: 自动漫游
  if (e.key.toLowerCase() === 't') {
    controls.autoRotate = !controls.autoRotate;
    tourMode = controls.autoRotate;
    document.getElementById('tour-btn')?.classList.toggle('active', tourMode);
    if (tourMode) switchView('bird');
  }
});

// ================================================================
//  十四、窗口自适应
// ================================================================
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ================================================================
//  十五、启动
// ================================================================
camera.position.set(...VIEWS.perspective.pos);
controls.target.set(...VIEWS.perspective.target);
document.querySelector('[data-view="perspective"]')?.classList.add('active');

tryLoadGLB();

// ================================================================
//  十六、动画循环
// ================================================================
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // --- 昼夜循环（默认缓慢变化） ---
  if (!userControllingTime) {
    timeOfDay += delta * 0.015;
    if (timeOfDay > 1) timeOfDay -= 1;
    updateDayNight(timeOfDay);
    if (timeSlider) {
      timeSlider.value = timeOfDay;
      if (timeLabel) {
        const hour = Math.floor(timeOfDay * 24);
        const min = Math.floor((timeOfDay * 24 - hour) * 60);
        timeLabel.textContent = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      }
    }
  }

  // --- 建筑生长动画 ---
  const nowPerf = performance.now();
  buildings.forEach(b => {
    if (!b.userData.animatingIn) return;
    const tNorm = (nowPerf - entranceStartTime.value - b.userData.animDelay) / 350;
    if (tNorm <= 0) return;
    const t = Math.min(tNorm, 1);
    const s = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const base = 0.3;
    b.scale.set(base + (1 - base) * s, base + (1 - base) * s, base + (1 - base) * s);
    if (t >= 1) {
      b.scale.set(1, 1, 1);
      b.userData.animatingIn = false;
    }
  });

  // --- 脉冲高亮 ---
  if (selectedMesh && selectedMesh.material) {
    const pulse = 0.2 + Math.sin(elapsed * 2.5) * 0.15;
    selectedMesh.material.emissive.setHex(0x64ffda);
    selectedMesh.material.emissiveIntensity = pulse;
  }

  // --- 树木摇曳 ---
  if (layers.trees.visible) updateTrees(elapsed);

  // --- 喷泉更新 ---
  if (layers.details.visible) updateFountain(delta);

  // --- 车辆更新 ---
  updateCars(delta);

  controls.update();
  renderer.render(scene, camera);
}
animate();

console.log('🏫 校园数字孪生系统 v3.0 已启动');
console.log('⌨ 视角: 1-透视  2-鸟瞰  3-正面  4-俯视');
console.log('⌨ 图层: Q-建筑  W-道路  E-植被  R-装饰');
console.log('⌨ 漫游: T');
