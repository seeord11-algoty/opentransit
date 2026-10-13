import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// ================= utilidades =================
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t = clamp(t), t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const seg = (t, a, b) => ease((t - a) / (b - a));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const money = (n) => "$" + Math.round(n).toLocaleString("es-CO");
const km1 = (n) => n.toFixed(1).replace(".", ",");
const C = { navy: 0x14213d, teal: 0x2a9d8f, orange: 0xe9893a, glass: 0x9fd3e6, concrete: 0xc9ced3 };
const STOP_DWELL = 3.6; // segundos que el tren espera parado en una estación intermedia

// ================= modelo de tarifa (ilustrativo) =================
const STATIONS = [
  { name: "Portal Sur", km: 0 },
  { name: "Kennedy", km: 3.4 },
  { name: "Av. 68", km: 7.1 },
  { name: "Centro", km: 11.2 },
  { name: "Calle 72", km: 15.0 },
];
const UNIT = 16;                         // unidades 3D por km
const BASE = 2000, PER_KM = 260, CAP = 5500;
const sx = (i) => STATIONS[i].km * UNIT;
function fareFor(km) {
  const raw = BASE + PER_KM * km;
  const r = Math.round(raw / 50) * 50;
  return { raw, rounded: Math.min(CAP, r), capped: r > CAP };
}

// ================= escena =================
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const DAY = new THREE.Color(0xbfdcec), DUSK = new THREE.Color(0xe8946a), NIGHT = new THREE.Color(0x0a1224);
const DAY_HI = new THREE.Color(0x6ba8da), DUSK_HI = new THREE.Color(0x9a5f8c), NIGHT_HI = new THREE.Color(0x050a16);
const SUN_DAY = new THREE.Color(0xfff6e8), SUN_DUSK = new THREE.Color(0xff9a52), SUN_NIGHT = new THREE.Color(0x92a3d8);
function stage2(a, b, c, n) { return n < 0.5 ? a.clone().lerp(b, n / 0.5) : b.clone().lerp(c, (n - 0.5) / 0.5); }
scene.fog = new THREE.Fog(DAY.clone(), 110, 380);

// cielo con gradiente vertical (sigue a la cámara para que nunca se vea el borde de la cúpula)
const skyU = { horizon: { value: DAY.clone() }, zenith: { value: DAY_HI.clone() } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: "uniform vec3 horizon; uniform vec3 zenith; varying vec3 vP;" +
    "void main(){ float h = pow(max(normalize(vP).y, 0.0), 0.55); gl_FragColor = vec4(mix(horizon, zenith, h), 1.0); }",
}));
sky.renderOrder = -1; scene.add(sky);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 900);
camera.position.set(120, 80, -170);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 5; controls.maxDistance = 260;
let userMoved = false;
controls.addEventListener("start", () => { userMoved = true; });

const hemi = new THREE.HemisphereLight(0xffffff, 0x6b7a8a, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
scene.add(sun, sun.target);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.18; // sutil: solo para dar reflejos/brillo, sin sobreexponer

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ssao = new SSAOPass(scene, camera, innerWidth, innerHeight);
ssao.kernelRadius = 18; ssao.minDistance = 0.0007; ssao.maxDistance = 0.25; ssao.output = SSAOPass.OUTPUT.Default;
composer.addPass(ssao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.3, 0.92);
composer.addPass(bloom);
const smaa = new SMAAPass(innerWidth, innerHeight);
composer.addPass(smaa);
composer.addPass(new OutputPass());

// ================= calidad =================
// Alta: todo. Media: sin oclusión ambiental y sombras 1024. Baja: sin post-proceso ni sombras, pixelRatio 1.
let quality = "media";
function applyQuality(q) {
  quality = q;
  const dpr = window.devicePixelRatio || 1;
  ssao.enabled = q === "alta";
  bloom.enabled = q !== "baja";
  smaa.enabled = q !== "baja";
  renderer.setPixelRatio(q === "baja" ? 1 : Math.min(dpr, q === "alta" ? 2 : 1.5));
  const shadows = q !== "baja";
  if (renderer.shadowMap.enabled !== shadows) {
    renderer.shadowMap.enabled = shadows;
    scene.traverse((o) => { if (o.isMesh && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
  }
  const size = q === "alta" ? 2048 : 1024;
  if (shadows && sun.shadow.mapSize.x !== size) {
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.shadow.mapSize.set(size, size);
  }
  sun.castShadow = shadows;
  if (typeof resize === "function") resize();
}
function autoQuality() {
  const weak = innerWidth < 1100 || (navigator.hardwareConcurrency || 8) <= 4;
  return weak ? "baja" : "media";
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });
function box(w, h, d, m, x = 0, y = 0, z = 0, parent = scene) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b;
}
function rbox(w, h, d, r, seg, m, x = 0, y = 0, z = 0, parent = scene) {
  const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, r), m);
  b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b;
}
function textCanvas(lines, { w = 640, h = 160, bg = "#14213D", fg = "#F5F6F2", size = 52, radius = 28, sub = null } = {}) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, radius); g.fill();
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `700 ${size}px "Segoe UI", Arial, sans-serif`;
  g.fillText(lines, w / 2, h / 2 - (sub ? size * 0.35 : 0));
  if (sub) { g.font = `500 ${size * 0.6}px "Segoe UI", Arial, sans-serif`; g.globalAlpha = 0.85; g.fillText(sub, w / 2, h / 2 + size * 0.62); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function label(text, sub, pos, scale = 4, bg) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textCanvas(text, { sub, bg }), depthTest: false, transparent: true }));
  s.scale.set(scale, scale / 4, 1); s.position.copy(pos); s.renderOrder = 10; scene.add(s); return s;
}
// letrero de estación con una tercera línea opcional que se redibuja en vivo: la tarifa si el pasajero se bajara ahí
function stationLabel(name, kmTxt) {
  const W = 640, H = 210;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  let last;
  s.draw = (fareTxt) => {
    const key = fareTxt || ""; if (key === last) return; last = key;
    const g = cv.getContext("2d");
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#14213D"; g.beginPath(); g.roundRect(0, 0, W, H, 28); g.fill();
    g.fillStyle = "#F5F6F2"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = '700 50px "Segoe UI", Arial, sans-serif';
    g.fillText(name, W / 2, fareTxt ? 60 : H / 2 - 14);
    g.font = '500 30px "Segoe UI", Arial, sans-serif'; g.globalAlpha = 0.8;
    g.fillText(kmTxt, W / 2, fareTxt ? 101 : H / 2 + 28); g.globalAlpha = 1;
    if (fareTxt) {
      g.fillStyle = "rgba(245,246,242,.25)"; g.fillRect(W / 2 - 160, 123, 320, 2);
      g.fillStyle = "#F5F6F2"; g.globalAlpha = 0.7; g.font = '500 26px "Segoe UI", Arial, sans-serif';
      g.fillText("Si bajas aquí", W / 2, 150); g.globalAlpha = 1;
      g.fillStyle = "#F5F6F2"; g.font = '700 38px "Segoe UI", Arial, sans-serif';
      g.fillText(fareTxt, W / 2, 188);
    }
    tex.needsUpdate = true;
  };
  s.draw(null);
  scene.add(s);
  return s;
}

// ================= texturas procedurales (sin assets externos) =================
function noiseTex(w, h, draw) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function speckle(g, w, h, base, specks) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (const [color, alpha, count, rMin, rMax] of specks) {
    g.globalAlpha = alpha; g.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = rMin + Math.random() * (rMax - rMin);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;
}
const grassTex = noiseTex(256, 256, (g, w, h) => speckle(g, w, h, "#92ab79", [
  ["#7f9868", 0.5, 500, 1, 3], ["#a6bd8d", 0.45, 450, 1, 2.5], ["#6c8458", 0.3, 300, 1.5, 4],
]));
grassTex.repeat.set(60, 34);
const asphaltTex = noiseTex(256, 256, (g, w, h) => speckle(g, w, h, "#3a3f47", [
  ["#50565f", 0.4, 700, 0.5, 1.6], ["#262a30", 0.4, 700, 0.5, 1.6],
]));
asphaltTex.repeat.set(56, 1.3);
const concreteTex = noiseTex(256, 256, (g, w, h) => speckle(g, w, h, "#c9ced3", [
  ["#b3b9c0", 0.4, 500, 0.5, 2], ["#dde1e5", 0.4, 500, 0.5, 2], ["#9aa0a8", 0.2, 150, 1, 3],
]));
concreteTex.repeat.set(4, 2);
const platformMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.95 });
const tactGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.035, 8);
const tactMat = mat(0xd9a92a, { roughness: 0.7 });
const benchSeatGeo = new THREE.BoxGeometry(2.1, 0.1, 0.5);
const benchLegGeo = new THREE.BoxGeometry(0.08, 0.42, 0.42);
const benchMat = mat(0x9a7d54, { roughness: 0.8 });
const binGeo = new THREE.CylinderGeometry(0.22, 0.18, 0.6, 12);
const binMat = mat(0x3f4650, { metalness: 0.5, roughness: 0.5 });

// ================= terreno y vía =================
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.x = 120; ground.receiveShadow = true; scene.add(ground);
box(340, 0.3, 4.2, mat(0x8d8478), 120, 0.15, 0);                       // balasto
const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.18, 3.4), mat(0x5b4a3b), 560);
for (let i = 0; i < 560; i++) { const m = new THREE.Matrix4().makeTranslation(-50 + i * 0.6, 0.36, 0); sleepers.setMatrixAt(i, m); }
sleepers.receiveShadow = true; scene.add(sleepers);
for (const z of [-0.75, 0.75]) box(340, 0.14, 0.12, mat(0xb8bec6, { metalness: 0.8, roughness: 0.3 }), 120, 0.52, z);
for (let x = -50; x <= 290; x += 12) box(0.2, 5.6, 0.2, mat(0x7c8691, { metalness: 0.5 }), x, 2.8, 2.6); // postes catenaria
box(340, 0.06, 0.06, mat(0x333333), 120, 5.4, 0);
// calle paralela
box(340, 0.05, 8, new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0.05 }), 120, 0.03, -24);
for (let x = -50; x < 290; x += 7) box(3, 0.06, 0.18, mat(0xf2f2f2), x, 0.06, -24);
// edificios de fondo (alejados de la vía; solo del lado norte para no tapar la toma nocturna del banco/nube)
const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
function windowGridTexture() {
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 256;
  const g = cv.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, 128, 256);
  g.fillStyle = "#fff";
  const cols = 4, rows = 11, mw = 18, mh = 13, gx = (128 - cols * mw) / (cols + 1), gy = (256 - rows * mh) / (rows + 1);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (Math.random() < 0.42) continue;
    g.fillRect(gx + c * (mw + gx), gy + r * (mh + gy), mw, mh);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const winTex = windowGridTexture();
const bldgMats = [0xd9d4c7, 0xc4ccd4, 0xe6dccb, 0xb9c3cc].map((c) => mat(c, { emissive: 0xffd28a, emissiveMap: winTex, emissiveIntensity: 0 }));
for (let i = 0; i < 46; i++) {
  const x = -40 + i * 7.5 + rnd() * 3, h = 7 + rnd() * 26, w = 5 + rnd() * 3.4;
  box(w, h, 6, bldgMats[i % 4], x, h / 2, 34 + rnd() * 16);
}

// ================= estaciones =================
const poles = [];           // por estación: { in, out } validadores
const gateBanks = [];       // por estación: setter de apertura del torniquete de entrada
const lamps = [];
function makePole(x, z, face, gated) {
  const g = new THREE.Group(); g.position.set(x, 1.0, z); g.rotation.y = face; scene.add(g);
  box(0.26, 1.3, 0.26, mat(0xaeb6bd, { metalness: 0.85, roughness: 0.28 }), 0, 0.65, 0, g); // acero cepillado
  const head = box(0.46, 0.5, 0.32, mat(0x1d2b4a), 0, 1.5, 0, g); head.rotation.x = 0.3;
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 200;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.28), new THREE.MeshBasicMaterial({ map: tex }));
  scr.position.set(0, 1.56, -0.19); scr.rotation.set(0.3, Math.PI, 0); g.add(scr);
  const ledM = new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 1.4 });
  const led = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.022, 10, 36), ledM); led.position.set(0, 1.34, -0.21); led.rotation.x = 0.3; g.add(led);
  const p = { g, cv, tex, ledM, state: "" };
  p.draw = (state, line2) => {
    const key = state + (line2 || ""); if (key === p.state) return; p.state = key;
    const gg = cv.getContext("2d");
    const m = { idle: ["#14213D", "#F5F6F2", face === 0 ? "Check-in" : "Check-out", "Acerque su tarjeta"], read: ["#14213D", "#7FD1C6", "Leyendo…", "EMV"],
      in: ["#1D6F66", "#fff", "✓ Entrada", line2 || ""], out: ["#1D6F66", "#fff", "✓ Salida", line2 || ""] }[state];
    gg.fillStyle = m[0]; gg.fillRect(0, 0, 256, 200); gg.fillStyle = m[1]; gg.textAlign = "center";
    gg.font = "700 40px Segoe UI, Arial"; gg.fillText(m[2], 128, 86); gg.font = "500 28px Segoe UI, Arial"; gg.fillText(m[3], 128, 138);
    tex.needsUpdate = true;
  };
  p.led = (hex) => { ledM.color.setHex(hex); ledM.emissive.setHex(hex); };
  p.draw("idle");
  return p;
}

// ================= banco de torniquetes + reja =================
// El andén queda cerrado por una reja en z = GATE_Z; solo se puede cruzar por los carriles
// de los torniquetes: el de entrada (con compuertas que abren al aprobar el check-in) y el de salida.
const GATE_Z = -10, CAB_W = 0.62;
const CAB_X = [5.34, 3.47, 1.6, -0.27, -1.73, -3.6, -5.47];   // 1.6 = validador de entrada, -3.6 = de salida
const LANES = [                                               // carriles entre gabinetes contiguos
  { x: 4.405, half: 0.625, kind: "closed", ind: 5.34 },
  { x: 2.535, half: 0.625, kind: "closed", ind: 3.47 },
  { x: 0.665, half: 0.625, kind: "entry", ind: 1.6 },
  { x: -1.0, half: 0.42, kind: "blocked", ind: -0.27 },
  { x: -2.665, half: 0.625, kind: "open", ind: -1.73 },
  { x: -4.535, half: 0.625, kind: "closed", ind: -5.47 },
];
const cabMat = mat(0xc2c7cc, { metalness: 0.75, roughness: 0.3 });
const railMat = mat(0xb9c0c7, { metalness: 0.85, roughness: 0.22 });
const padMat = mat(0xe9a23a, { roughness: 0.5 });
const wingMat = new THREE.MeshPhysicalMaterial({ color: C.glass, transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0.05, transmission: 0.25, side: THREE.DoubleSide });
const fenceMat = new THREE.MeshPhysicalMaterial({ color: C.glass, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.05, side: THREE.DoubleSide });
const cabGeo = new THREE.BoxGeometry(CAB_W, 0.95, 1.5);
const padGeo = new THREE.BoxGeometry(0.5, 0.05, 0.42);
const railVGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.95, 8);
const railHGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.1, 8);
const wingGeo = new THREE.BoxGeometry(0.03, 0.85, 0.6);
const wingFrameGeo = new THREE.BoxGeometry(0.05, 0.06, 0.62);
const wingEdgeGeo = new THREE.BoxGeometry(0.05, 0.87, 0.05);
const postGeo = new THREE.BoxGeometry(0.09, 1.08, 0.12);
const indGeo = new THREE.PlaneGeometry(0.2, 0.2);
function indicatorTex(open) {
  const cv = document.createElement("canvas"); cv.width = 96; cv.height = 96;
  const g = cv.getContext("2d");
  g.fillStyle = "#11161f"; g.fillRect(0, 0, 96, 96);
  g.strokeStyle = open ? "#22c55e" : "#c62f3a"; g.lineWidth = 13; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath();
  if (open) { g.moveTo(48, 78); g.lineTo(48, 24); g.moveTo(25, 47); g.lineTo(48, 24); g.lineTo(71, 47); }
  else { g.moveTo(26, 26); g.lineTo(70, 70); g.moveTo(70, 26); g.lineTo(26, 70); }
  g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const IND_X = indicatorTex(false), IND_OK = indicatorTex(true);
function fenceRun(xFrom, xTo) {
  const len = xTo - xFrom, cx = (xFrom + xTo) / 2;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(len, 0.95, 0.05), fenceMat);
  panel.position.set(cx, 1.52, GATE_Z); scene.add(panel);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.1), railMat);
  rail.position.set(cx, 2.04, GATE_Z); rail.castShadow = true; scene.add(rail);
  for (let px = xFrom; px < xTo + 0.01; px += 2) {
    const p = new THREE.Mesh(postGeo, railMat);
    p.position.set(Math.min(px, xTo), 1.54, GATE_Z); p.castShadow = true; scene.add(p);
  }
}
function makeGateBank(x) {
  for (const cx of CAB_X) {                                    // gabinetes metálicos + pasamanos
    const body = new THREE.Mesh(cabGeo, cabMat);
    body.position.set(x + cx, 1.475, GATE_Z); body.castShadow = true; body.receiveShadow = true; scene.add(body);
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(x + cx, 1.95, GATE_Z - 0.42); pad.rotation.x = -0.3; scene.add(pad);
    const rv = new THREE.Mesh(railVGeo, railMat);
    rv.position.set(x + cx, 2.42, GATE_Z + 0.6); rv.castShadow = true; scene.add(rv);
    const rh = new THREE.Mesh(railHGeo, railMat);
    rh.rotation.x = Math.PI / 2; rh.position.set(x + cx, 2.88, GATE_Z + 0.07); rh.castShadow = true; scene.add(rh);
  }
  const setters = { entry: () => {}, exit: () => {} };
  for (const L of LANES) {
    const ind = new THREE.Mesh(indGeo, new THREE.MeshBasicMaterial({ map: IND_X }));
    ind.position.set(x + L.ind, 1.6, GATE_Z - 0.76); ind.rotation.y = Math.PI; scene.add(ind);
    if (L.kind === "blocked") {                                // carril fuera de servicio: panel ciego
      const panel = new THREE.Mesh(new THREE.BoxGeometry(L.half * 2, 0.95, 0.12), cabMat);
      panel.position.set(x + L.x, 1.475, GATE_Z); panel.castShadow = true; scene.add(panel);
      continue;
    }
    const hinges = [-1, 1].map((s) => {                        // compuertas de vidrio con marco metálico
      const h = new THREE.Group(); h.position.set(x + L.x + s * L.half, 1.0, GATE_Z); scene.add(h);
      const w = new THREE.Mesh(wingGeo, wingMat); w.position.set(0, 0.47, 0.3); h.add(w);
      const frame = new THREE.Mesh(wingFrameGeo, railMat); frame.position.set(0, 0.9, 0.3); h.add(frame);
      const edge = new THREE.Mesh(wingEdgeGeo, railMat); edge.position.set(0, 0.47, 0.6); h.add(edge);
      return h;
    });
    // openT 0 = cerrado, 1 = abierto; "denied" hace parpadear la X roja
    const set = (openT, state, time) => {
      const a = lerp(1.45, 0, openT);
      hinges[0].rotation.y = a; hinges[1].rotation.y = -a;
      ind.material.map = openT > 0.4 ? IND_OK : IND_X;
      ind.visible = state === "denied" ? Math.sin(time * 11) > -0.25 : true;
    };
    set(0, "closed", 0);
    if (L.kind === "entry") setters.entry = set;
    if (L.kind === "open") setters.exit = set;
  }
  fenceRun(x - 16, x + CAB_X[CAB_X.length - 1] - CAB_W / 2);   // reja: cierra el resto del andén
  fenceRun(x + CAB_X[0] + CAB_W / 2, x + 16);
  return setters;
}
const stationLabels = [], labelOp = STATIONS.map(() => 0);
STATIONS.forEach((st, i) => {
  const x = sx(i);
  box(32, 1.0, 14, platformMat, x, 0.5, -9);                        // plataforma + vestíbulo (z -2..-16)
  box(32, 0.08, 0.3, mat(0xf2c230), x, 1.02, -2.2);                // borde amarillo
  const tact = new THREE.InstancedMesh(tactGeo, tactMat, 62);      // baldosa táctil (botones) sobre el borde
  for (let k = 0; k < 62; k++) tact.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x - 15.3 + k * 0.5, 1.07, -2.75));
  tact.receiveShadow = true; scene.add(tact);
  for (let k = 0; k < 4; k++) box(32, 0.25, 0.8, mat(0xb7bdc3), x, 0.125 + k * 0.25, -16.4 - k * 0.0);
  for (const cx of [-12, -4, 4, 12]) box(0.3, 4.2, 0.3, mat(0x7c8691, { metalness: 0.5 }), x + cx, 3.1, -3.2);
  box(30, 0.3, 6.4, mat(0xe9edf1), x, 5.25, -4.6);
  box(30, 0.6, 0.3, mat(C.navy), x, 5.1, -7.85);
  const sg = stationLabel(st.name, `km ${km1(st.km)}`);
  sg.position.set(x, 6.9, -6); sg.scale.set(7, 7 * 210 / 640, 1);
  sg.userData.station = i;
  sg.material.opacity = 0; sg.visible = false;
  stationLabels.push(sg);
  // solo Portal Sur (índice 0) tiene torniquetes con puertas; el resto, validadores abiertos
  const bank = i === 0 ? makeGateBank(x) : null;
  gateBanks.push(bank);
  const pr = { in: makePole(x + 1.6, GATE_Z, 0), out: makePole(x - 3.6, GATE_Z, Math.PI) };
  if (bank) { pr.in.open = bank.entry; pr.out.open = bank.exit; }
  poles.push(pr);
  const l = new THREE.PointLight(0xffd59a, 0, 26); l.position.set(x, 4.6, -6); scene.add(l); lamps.push(l);
  for (const bx of [-10, 9]) {                                     // bancas y canecas del andén
    const b = new THREE.Mesh(benchSeatGeo, benchMat); b.position.set(x + bx, 1.42, -6.2); b.castShadow = true; scene.add(b);
    for (const lx of [-0.75, 0.75]) {
      const lg = new THREE.Mesh(benchLegGeo, railMat); lg.position.set(x + bx + lx, 1.21, -6.2); scene.add(lg);
    }
    const can = new THREE.Mesh(binGeo, binMat); can.position.set(x + bx + 1.9, 1.3, -6.2); can.castShadow = true; scene.add(can);
  }
});
// letreros de estación: visibles solo cuando son relevantes (no durante el tramo de viaje lejos de la estación)
function stationLabelTarget(i, step, S) {
  if (step === 0) return 1;                                    // vista aérea inicial: útil como mapa
  if (step === 1 || step === 2) return i === O ? 1 : 0;         // llegada / check-in: solo el origen
  if (step === 3) {                                             // viaje: aparece al acercarse, se esconde en plena marcha
    const d = Math.abs(S.trainX / UNIT - STATIONS[i].km);
    return clamp(1 - d / 2.6);
  }
  if (step === 4) return i === D ? 1 : 0;                       // check-out: solo el destino
  return 0;                                                     // pasos 5-6: la escena está lejos de la vía
}
function updateStationLabels(S, step, dt) {
  const k = 1 - Math.pow(0.001, dt);
  const lo = Math.min(O, D), hi = Math.max(O, D);
  stationLabels.forEach((sp, i) => {
    labelOp[i] += (stationLabelTarget(i, step, S) - labelOp[i]) * k;
    sp.material.opacity = labelOp[i]; sp.visible = labelOp[i] > 0.015;
    if (step === 3 && i >= lo && i <= hi && labelOp[i] > 0.5) {
      sp.draw(money(fareFor(Math.abs(STATIONS[i].km - STATIONS[O].km)).rounded));
    } else {
      sp.draw(null);
    }
  });
}

// ================= tren =================
const train = new THREE.Group(); scene.add(train);
const doorsMeshes = [];
// carrocería pintada con barniz (clearcoat) y ventanas de vidrio oscuro reflectivo
const trainWinMat = new THREE.MeshPhysicalMaterial({ color: 0x3a4a59, roughness: 0.06, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 3.4, emissive: 0xffd9a0, emissiveIntensity: 0 });
const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xf3f5f7, metalness: 0.6, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1.4 });
const CAR = 13, GAP = 0.7;
for (let c = -1; c <= 1; c++) {
  const car = new THREE.Group(); car.position.x = c * (CAR + GAP); train.add(car);
  rbox(CAR, 3.0, 3.0, 0.42, 4, bodyMat, 0, 2.6, 0, car);
  box(CAR + 0.02, 0.9, 3.04, mat(0x1b2230, { roughness: 0.15, metalness: 0.5 }), 0, 3.2, 0, car);
  box(CAR + 0.02, 0.32, 3.04, mat(C.teal), 0, 2.15, 0, car);
  box(CAR + 0.02, 0.12, 3.04, mat(C.orange), 0, 1.9, 0, car);
  for (const dx of [-3.6, 3.6]) {
    const d = box(1.5, 2.3, 0.06, mat(0xdfe5ea, { metalness: 0.3 }), dx, 2.35, -1.53, car);
    doorsMeshes.push(d);
  }
  for (const wx of [-5.7, -1.6, 1.6, 5.7]) for (const wz of [-1.52, 1.52]) {
    const w = box(1.45, 1.05, 0.04, trainWinMat, wx, 2.68, wz, car); w.castShadow = false;
  }
  for (const dx of [-4.4, 4.4]) box(2.6, 0.5, 2.4, mat(0x2b2f36), dx, 0.85, 0, car);
  if (c !== 0) {
    const nose = rbox(1.6, 2.6, 2.9, 0.34, 4, bodyMat, c * (CAR / 2 + 0.6), 2.4, 0, car);
    nose.scale.y = 0.95;
    box(0.4, 1.0, 2.6, mat(0x1b2230, { roughness: 0.15, metalness: 0.5 }), c * (CAR / 2 + 1.25), 3.0, 0, car);
    for (const z of [-0.9, 0.9]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff6d5, emissive: 0xfff6d5, emissiveIntensity: 2 }));
      hl.position.set(c * (CAR / 2 + 1.42), 1.9, z); car.add(hl);
    }
  }
}
const trainSign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), new THREE.MeshBasicMaterial({ map: textCanvas("Pago abierto · OpenTransit", { w: 768, h: 128, size: 50 }) }));
trainSign.position.set(0, 3.85, -1.53); trainSign.rotation.y = Math.PI; train.add(trainSign);
const DOOR_DX = 3.6;            // puerta central del vagón del medio

// ================= pasajero =================
function makePerson() {
  const p = new THREE.Group();
  const skin = mat(0xc68b5f), jacket = mat(C.teal), pants = mat(0x2b3546), shoe = mat(0x1a1a1a);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 6, 14), jacket); torso.position.y = 1.2; torso.castShadow = true; p.add(torso);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin); hd.position.y = 1.78; hd.castShadow = true; p.add(hd);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x2a1b12)); hair.position.y = 1.8; p.add(hair);
  box(0.38, 0.45, 0.18, mat(C.orange), 0, 1.25, -0.27, p);
  const limb = (len, r, m) => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m); c.position.y = -len / 2 - r; c.castShadow = true; g.add(c); return g; };
  const legL = limb(0.62, 0.1, pants), legR = limb(0.62, 0.1, pants);
  legL.position.set(-0.12, 0.88, 0); legR.position.set(0.12, 0.88, 0); p.add(legL, legR);
  [legL, legR].forEach((l) => box(0.18, 0.1, 0.3, shoe, 0, -0.86, 0.05, l));
  const armL = limb(0.42, 0.08, jacket), armR = limb(0.42, 0.08, jacket);
  armL.position.set(-0.36, 1.48, 0); armR.position.set(0.36, 1.48, 0); p.add(armL, armR);
  box(0.09, 0.17, 0.02, mat(0x111111, { emissive: 0x2a9d8f, emissiveIntensity: 0.4 }), 0, -0.68, 0.06, armR);
  p.userData = { legL, legR, armL, armR };
  return p;
}
const person = makePerson(); scene.add(person);
const dog = makeDog();                                    // solo uno, en el vestíbulo de Portal Sur
dog.position.set(sx(0) - 6, 1.0, -13); dog.rotation.y = -2.2; scene.add(dog);

// arbustos al lado de la vía (instanciados: una sola llamada de dibujo)
const bushGeo = new THREE.IcosahedronGeometry(0.34, 1);
const bushMat = mat(0x5f7a4a, { roughness: 1 });
const bushes = new THREE.InstancedMesh(bushGeo, bushMat, 190);
{
  const rb = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(91);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  for (let i = 0; i < 190; i++) {
    // solo al norte de la vía (entre la catenaria y los edificios), para no invadir la calle ni los andenes
    pos.set(-45 + rb() * 340, 0.22, 7.5 + rb() * 22);
    sc.set(0.7 + rb() * 0.8, 0.5 + rb() * 0.5, 0.7 + rb() * 0.8);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rb() * 3.14);
    bushes.setMatrixAt(i, m.compose(pos, q, sc));
  }
}
bushes.castShadow = true; bushes.receiveShadow = true; scene.add(bushes);

// pasajeros secundarios esperando en los andenes
const extras = [];
function makeExtra(coat, pants) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.46, 5, 10), mat(coat)); t.position.y = 1.18; t.castShadow = true; g.add(t);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), mat(0xc68b5f)); h.position.y = 1.72; h.castShadow = true; g.add(h);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x2a1b12)); hair.position.y = 1.74; g.add(hair);
  for (const s of [-0.11, 0.11]) {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.56, 4, 8), mat(pants)); l.position.set(s, 0.44, 0); l.castShadow = true; g.add(l);
  }
  return g;
}
[[0, -7.5, -5.4, 0.3], [0, 6.2, -5.0, -0.5], [1, -8.5, -5.2, 0.9], [1, 7.4, -4.8, -1.1],
 [2, -6.8, -5.5, 0.2], [3, 8.1, -5.1, -0.8], [3, -9.2, -4.9, 1.2], [4, 6.6, -5.3, -0.4]]
  .forEach(([st, dx, dz, rot], i) => {
    const e = makeExtra([0x3f6f8f, 0x8f4f5f, 0x4f7f5f, 0x6f5f8f][i % 4], [0x2b3546, 0x343b46][i % 2]);
    e.position.set(sx(st) + dx, 1.0, dz); e.rotation.y = rot; scene.add(e);
    extras.push({ g: e, ph: i * 1.7 });
  });
function pose(walk, arm, t) {
  const { legL, legR, armL, armR } = person.userData;
  const s = Math.sin(t * 9) * 0.55 * walk;
  legL.rotation.x = s; legR.rotation.x = -s; armL.rotation.x = -s * 0.8;
  armR.rotation.x = lerp(s * 0.8, -1.35, arm); armR.rotation.z = lerp(0, 0.25, arm);
}
// perrito sentado (shiba) en el vestíbulo de Portal Sur: detalle decorativo, estilo bajo-poli a juego con el pasajero
function makeDog() {
  const g = new THREE.Group();
  const fur = mat(0xd98a46, { roughness: 0.92, metalness: 0 });
  const furD = mat(0xb06a2e, { roughness: 0.92, metalness: 0 });
  const cream = mat(0xf5ead8, { roughness: 0.9, metalness: 0 });
  const black = mat(0x15110e, { roughness: 0.55, metalness: 0 });

  const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), fur);     // ancas (postura sentada)
  haunch.scale.set(1, 0.92, 1.15); haunch.position.set(0, 0.17, -0.08); haunch.castShadow = true; g.add(haunch);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.2, 8, 16), fur); // tronco inclinado
  body.rotation.x = 0.45; body.position.set(0, 0.3, 0.02); body.castShadow = true; g.add(body);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.12, 8, 14), cream);
  chest.rotation.x = 0.3; chest.position.set(0, 0.24, 0.12); g.add(chest);

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.07, 6, 12), fur);
  neck.rotation.x = 0.25; neck.position.set(0, 0.42, 0.07); g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16), fur);
  head.scale.set(1, 0.95, 1.05); head.position.set(0, 0.53, 0.09); head.castShadow = true; g.add(head);
  const cheeks = new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 12), cream);  // máscara clara del shiba
  cheeks.scale.set(1.05, 0.72, 0.9); cheeks.position.set(0, 0.5, 0.14); g.add(cheeks);
  const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.05, 6, 10), cream);
  snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.5, 0.2); g.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), black);
  nose.position.set(0, 0.508, 0.245); g.add(nose);
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), black);
    eye.position.set(s * 0.045, 0.552, 0.172); g.add(eye);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.085, 4), furD);
    ear.position.set(s * 0.063, 0.625, 0.07); ear.rotation.set(-0.12, Math.PI / 4, s * 0.26);
    ear.castShadow = true; g.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.05, 4), cream);
    inner.position.set(s * 0.063, 0.618, 0.09); inner.rotation.copy(ear.rotation); g.add(inner);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.16, 6, 10), cream);
    leg.rotation.x = Math.PI * 0.47; leg.position.set(s * 0.062, 0.085, 0.14); leg.castShadow = true; g.add(leg);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), cream);
    paw.scale.set(1, 0.7, 1.2); paw.position.set(s * 0.062, 0.032, 0.225); g.add(paw);
    const hind = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), fur);
    hind.scale.set(0.8, 0.75, 1.25); hind.position.set(s * 0.13, 0.065, 0.02); g.add(hind);
  });
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.028, 10, 20, Math.PI * 1.5), fur);
  tail.position.set(0.02, 0.33, -0.2); tail.rotation.set(Math.PI / 2, 0.2, 0.5); tail.castShadow = true; g.add(tail);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), cream);
  tip.position.set(0.05, 0.4, -0.22); g.add(tip);
  return g;
}

// ================= nube, banco y paquetes =================
const cloud = new THREE.Group(); scene.add(cloud);
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xf3f5f8, roughness: 0.85, emissive: 0x232d47, emissiveIntensity: 0.55, transparent: false, opacity: 1 });
[[0, 0, 0, 4], [3.8, -0.5, 0.6, 3.1], [-3.8, -0.6, 0.3, 3], [1.5, 1.4, -0.9, 2.8], [-1.6, 1.1, 1.2, 2.5]].forEach(([x, y, z, r]) => {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), cloudMat); s.position.set(x, y, z); cloud.add(s);
});
const servers = [];
for (let i = -1; i <= 1; i++) {
  const sv = box(1.4, 2.8, 1.4, mat(0x1f2a44, { metalness: 0.4 }), i * 1.9, -4.6, 0, cloud);
  for (const y of [0.6, 0, -0.6]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0x7fd1c6, emissive: 0x2a9d8f, emissiveIntensity: 0.4 }));
    s.position.set(0, y, -0.71); sv.add(s); servers.push(s);
  }
}
const cloudLabel = label("Plataforma ABT", "motor de reglas · tarifa por distancia", V(0, 0, 0), 14);

const bank = new THREE.Group(); scene.add(bank);
box(13, 0.8, 9, mat(0xd8d2c4), 0, 0.4, 0, bank);
box(11.5, 8, 7.5, mat(0xe9e4d8), 0, 4.8, 0, bank);
for (let i = -4.5; i <= 4.5; i += 1.8) box(0.6, 7, 0.6, mat(0xf7f3ea), i, 4.3, -4.1, bank);
const ped = new THREE.Mesh(new THREE.ConeGeometry(8, 2.2, 4, 1), mat(0xd8d2c4)); ped.rotation.y = Math.PI / 4; ped.scale.set(1, 1, 0.68); ped.position.y = 9.9; bank.add(ped);
const bankWin = [];
for (let i = -4.5; i <= 3; i += 1.8) for (const y of [3, 6]) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.5), new THREE.MeshStandardMaterial({ color: 0x324055, emissive: 0xffc875, emissiveIntensity: 0 }));
  w.position.set(i + 0.9, y, -3.77); w.rotation.y = Math.PI; bank.add(w); bankWin.push(w);
}
const bankLabel = label("Red financiera", "adquirente · franquicia · banco", V(0, 0, 0), 13);

function glow(color, r) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3 })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.7, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.11 })));
  g.visible = false; scene.add(g); return g;
}
const pkt = glow(0x7fd1c6, 0.38);
const trail = [...Array(8)].map((_, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.3 - i * 0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7fd1c6, transparent: true, opacity: 0.5 - i * 0.05 })); m.visible = false; scene.add(m); return m; });
const big = glow(0xe9893a, 1.2);

// recibo flotante
const RCV_SCALE = 2; // supersampleo para texto nítido de cerca
const receiptCv = document.createElement("canvas"); receiptCv.width = 900 * RCV_SCALE; receiptCv.height = 620 * RCV_SCALE;
const receiptTex = new THREE.CanvasTexture(receiptCv); receiptTex.colorSpace = THREE.SRGBColorSpace; receiptTex.anisotropy = 4;
const receipt = new THREE.Sprite(new THREE.SpriteMaterial({ map: receiptTex, depthTest: false, transparent: true }));
receipt.scale.set(16, 16 * 620 / 900, 1); receipt.renderOrder = 11; scene.add(receipt);

// estrellas
const sp = new Float32Array(1200);
for (let i = 0; i < 400; i++) { const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.45 * Math.PI; sp.set([120 + Math.cos(th) * Math.cos(ph) * 400, Math.sin(ph) * 400 + 20, Math.sin(th) * Math.cos(ph) * 400], i * 3); }
const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: 0, fog: false }));
scene.add(stars);

// ================= ruta y horario =================
let O = 0, D = 4, forgot = false, noCheck = false;
let R = {};
function buildRoute() {
  const dir = D > O ? 1 : -1;
  const ox = sx(O), dx = sx(D);
  const legs = []; let t = 1.4; // cierre de puertas
  for (let i = O; i !== D; i += dir) {
    const a = sx(i), b = sx(i + dir), dist = Math.abs(STATIONS[i + dir].km - STATIONS[i].km);
    const dur = Math.max(2.2, dist * 0.75);
    legs.push({ t0: t, t1: t + dur, a, b, to: i + dir });
    t += dur;
    if (i + dir !== D) t += STOP_DWELL; // parada intermedia
  }
  const distKm = Math.abs(STATIONS[D].km - STATIONS[O].km);
  const mid = (ox + dx) / 2;
  R = { dir, ox, dx, legs, travel: t + 0.8, distKm, fare: fareFor(distKm), mid,
        cloud: V(mid, 24, -46), bank: V(mid + 34 * (dir > 0 ? 1 : -1), 0, -58) };
  cloud.position.copy(R.cloud);
  bank.position.copy(R.bank); bankLabel.position.copy(R.bank).add(V(0, 14.8, 0));
  receipt.position.copy(R.cloud).add(V(R.dir > 0 ? -15 : 15, -2, -2));
  steps[3].dur = R.travel; drawReceipt();
}
function trainX(t) { // posición del tren en el paso 3
  if (t < R.legs[0].t0) return R.ox;
  for (let k = 0; k < R.legs.length; k++) {
    const L = R.legs[k];
    if (t < L.t0) return R.legs[k - 1].b;
    if (t <= L.t1) return lerp(L.a, L.b, ease((t - L.t0) / (L.t1 - L.t0)));
  }
  return R.dx;
}
function drawReceipt() {
  const g = receiptCv.getContext("2d"); const W = 900, H = 620;
  g.setTransform(RCV_SCALE, 0, 0, RCV_SCALE, 0, 0);
  g.clearRect(0, 0, W, H);
  g.fillStyle = "#F5F6F2"; g.beginPath(); g.roundRect(0, 0, W, H, 36); g.fill();
  g.fillStyle = forgot ? "#9B1C24" : "#1D6F66"; g.beginPath(); g.roundRect(0, 0, W, 110, [36, 36, 0, 0]); g.fill();
  g.fillStyle = "#fff"; g.font = "700 50px Segoe UI, Arial"; g.textAlign = "left";
  g.fillText(forgot ? "Viaje sin check-out" : "Tarifa por distancia", 44, 74);
  g.fillStyle = "#14213D"; g.font = "500 38px Segoe UI, Arial";
  const o = STATIONS[O], d = STATIONS[D];
  const rows = forgot
    ? [["Entrada", `${o.name} · km ${km1(o.km)}`], ["Salida", "No registrada"], ["Regla", "Se cobra el tope de la línea"], ["Cobro", money(CAP)]]
    : [["Entrada", `${o.name} · km ${km1(o.km)}`], ["Salida", `${d.name} · km ${km1(d.km)}`], ["Distancia", `${km1(R.distKm)} km`],
       ["Cálculo", `${money(BASE)} + ${km1(R.distKm)} × ${money(PER_KM)}`], ["Cobro", money(R.fare.rounded) + (R.fare.capped ? " (tope)" : "")]];
  rows.forEach(([a, b], i) => {
    const y = 180 + i * 92;
    g.fillStyle = "#5b6678"; g.font = "500 34px Segoe UI, Arial"; g.fillText(a, 44, y);
    g.fillStyle = i === rows.length - 1 ? (forgot ? "#9B1C24" : "#1D6F66") : "#14213D";
    g.font = (i === rows.length - 1 ? "800 46px" : "600 38px") + " Segoe UI, Arial"; g.fillText(b, 280, y);
    if (i < rows.length - 1) { g.fillStyle = "#dce2e6"; g.fillRect(44, y + 32, W - 88, 2); }
  });
  receiptTex.needsUpdate = true;
}

// ================= pasos =================
const steps = [
  { kicker: "Simulación interactiva", title: "Tren con tarifa por distancia", dur: 8,
    text: () => "Elige la estación de origen y de destino. El pasajero hace check-in obligatorio al entrar y check-out al salir; la plataforma calcula el cobro según los kilómetros recorridos, como OVpay en los trenes de Países Bajos.",
    facts: () => [`Tarifa ilustrativa: ${money(BASE)} + ${money(PER_KM)} por km`, `Tope por viaje: ${money(CAP)}`] },
  { kicker: "Paso 1 de 6", title: () => `Llega a ${STATIONS[O].name}`, dur: 5.5,
    text: () => "Andrés llega a la estación con su tarjeta débito y su celular. No compra tiquete ni recarga ninguna tarjeta, pero el check-in es obligatorio: sin él, el sistema no puede calcular su cobro.",
    facts: () => ["Check-in obligatorio al entrar", `Estación ${STATIONS[O].name} · km ${km1(STATIONS[O].km)}`] },
  { kicker: "Paso 2 de 6", title: () => (O === 0 ? "Check-in obligatorio en Portal Sur" : `Check-in en ${STATIONS[O].name}`), dur: 9,
    text: () => (O === 0 && noCheck
      ? "En Portal Sur el acceso es controlado: sin check-in las puertas no se abren. Así todo viaje que empieza en el portal tiene evento de entrada."
      : O === 0
        ? "Acerca el celular al lector del torniquete. Se aprueba en menos de medio segundo, las puertas se abren y sale un evento cifrado a la nube con la estación y la hora."
        : "Acerca el celular al validador de entrada. Se aprueba en menos de medio segundo y sale un evento cifrado a la nube con la estación y la hora. Luego sube al tren."),
    facts: () => (O === 0
      ? ["Torniquete: abre solo con validación aprobada", "Aprobación local < 0,5 s"]
      : ["Aprobación local < 0,5 s", "Evento: entrada + estación + hora"]) },
  { kicker: "Paso 3 de 6", title: () => `Viaja de ${STATIONS[O].name} a ${STATIONS[D].name}`, dur: 12,
    text: () => "El tren recorre la línea estación por estación. El validador no cobra nada todavía: la tarifa depende de dónde se baje.",
    facts: () => [`${Math.abs(D - O)} tramo(s) · ${km1(R.distKm)} km`, "Arrastra para mirar el recorrido"] },
  { kicker: "Paso 4 de 6", title: () => forgot ? `Sale de ${STATIONS[D].name} sin check-out` : `Check-out en ${STATIONS[D].name}`, dur: 9,
    text: () => forgot ? "Andrés olvida acercar su medio de pago al salir. La plataforma no sabe dónde terminó el viaje." : "Al salir acerca el mismo celular al validador de salida. Con la entrada y la salida, la plataforma ya conoce la distancia exacta.",
    facts: () => forgot ? ["Sin evento de salida", "Se aplicará el tope de la línea"] : ["Mismo medio de pago al entrar y salir", "Evento: salida + estación + hora"] },
  { kicker: "Paso 5 de 6", title: "El motor calcula la tarifa", dur: 7,
    text: () => forgot ? `Como no hubo check-out, la regla cobra el tope de la línea (${money(CAP)}). El usuario puede pedir el ajuste desde la app.` : `Distancia entre estaciones × valor por kilómetro, más la tarifa base, redondeado a $50 y con un tope de ${money(CAP)}.`,
    facts: () => forgot ? [`Cobro: ${money(CAP)} (tope)`, "Ajuste solicitable en la app"] : [`${km1(R.distKm)} km recorridos`, `Cobro: ${money(R.fare.rounded)}`] },
  { kicker: "Paso 6 de 6", title: "Cobro único en la noche", dur: 9,
    text: () => "Al cierre del día la plataforma agrupa los viajes de cada tarjeta y envía un solo cobro por la red financiera. Andrés recibe el resumen en la app.",
    facts: () => ["Un solo cobro diario por tarjeta", "El operador paga $347 por validación"] },
];
const val = (v) => (typeof v === "function" ? v() : v);

// estado del mundo = f(paso, t)
const P = {};
function world(step, t) {
  const ox = R.ox, dx = R.dx;
  const ARRIVE = V(ox - 1.6, 1, -12.4); // aparece ya cerca de la estación de origen
  const S = { pos: ARRIVE.clone(), face: 0.6, walk: 0, arm: 0, show: true, trainX: ox, doors: 1,
    pin: ["idle"], pout: ["idle"], ledIn: 0x3b82f6, ledOut: 0x3b82f6, pkt: -1, pktFrom: V(0, 0, 0), servers: 0, night: 0, big: -1, bankGlow: 0,
    receipt: 0, phone: "home", km: 0, gateOpen: 0, gateState: "closed", exitOpen: 0 };
  const IN_AT = V(ox + 0.6, 1, -10.7), PLAT = V(ox + DOOR_DX, 1, -3.0);
  const DOOR_D = V(dx + DOOR_DX, 1, -3.0), OUT_AT = V(dx - 2.6, 1, -9.3), EXIT = V(dx - 4.5, 1, -15.5);
  if (step >= 1) { const k = step === 1 ? seg(t, 0.15, 1.8) : 1; S.pos.lerpVectors(ARRIVE, IN_AT, k); S.walk = step === 1 && k > 0 && k < 1 ? 1 : 0; if (k >= 1) S.face = 0; }
  if (step === 2 && !(O === 0 && noCheck)) {
    S.arm = seg(t, 0.2, 1.0) * (1 - seg(t, 2.4, 3.0));
    S.pin = t < 1.0 ? ["idle"] : t < 1.6 ? ["read"] : ["in", STATIONS[O].name];
    if (t >= 1.6) S.ledIn = 0x22c55e;
    S.gateState = t < 1.0 ? "closed" : t < 1.6 ? "read" : "ok";
    S.gateOpen = t < 1.6 ? 0 : clamp((t - 1.6) / 0.6) - clamp((t - 7.0) / 0.6);
    S.pkt = seg(t, 1.8, 4.6); S.pktFrom = V(ox + 1.6, 2.6, -10); S.servers = t > 4.4 ? 1 : 0;
    S.phone = t < 1.6 ? "pay" : "in";
    const k = seg(t, 3.2, 6.6); S.pos.lerpVectors(IN_AT, PLAT, k); S.walk = k > 0 && k < 1 ? 1 : 0;
    if (k > 0) S.face = Math.atan2(PLAT.x - IN_AT.x, PLAT.z - IN_AT.z);
    S.show = t < 7.4;
  }
  if (step === 2 && O === 0 && noCheck) {
    // intenta pasar sin validar: la puerta no abre, retrocede, valida y recién entonces cruza
    const FWD = IN_AT.clone().add(V(0.3, 0, 0.55));
    S.pos.lerpVectors(IN_AT, FWD, seg(t, 0.2, 1.3) * (1 - seg(t, 2.4, 3.1)));
    S.walk = (t > 0.25 && t < 1.25) || (t > 2.45 && t < 3.05) ? 1 : 0;
    S.face = 0;
    S.pin = t < 4.0 ? ["idle"] : t < 4.6 ? ["read"] : ["in", STATIONS[O].name];
    S.gateState = t < 1.1 ? "closed" : t < 4.0 ? "denied" : t < 4.6 ? "read" : "ok";
    S.gateOpen = t < 4.6 ? 0 : clamp((t - 4.6) / 0.6) - clamp((t - 9.6) / 0.6);
    S.arm = seg(t, 3.3, 4.0) * (1 - seg(t, 5.6, 6.2));
    if (t >= 4.6) S.ledIn = 0x22c55e;
    S.pkt = seg(t, 4.8, 7.4); S.pktFrom = V(ox + 1.6, 2.6, -10); S.servers = t > 7.2 ? 1 : 0;
    S.phone = t < 4.6 ? "pay" : "in";
    if (t > 5.2) {
      const k = seg(t, 5.2, 9.4); S.pos.lerpVectors(IN_AT, PLAT, k); S.walk = k > 0 && k < 1 ? 1 : 0;
      if (k > 0) S.face = Math.atan2(PLAT.x - IN_AT.x, PLAT.z - IN_AT.z);
    }
    S.show = t < 10.2;
  }
  if (step >= 3) { S.show = false; S.phone = "in"; }
  if (step === 3) {
    S.trainX = trainX(t); S.doors = 1 - seg(t, 0, 1.2);
    R.legs.forEach((L) => { if (t > L.t1 && t < L.t1 + STOP_DWELL && L.to !== D) S.doors = Math.sin(clamp((t - L.t1) / STOP_DWELL) * Math.PI); });
    if (t > R.legs[R.legs.length - 1].t1) S.doors = seg(t, R.legs[R.legs.length - 1].t1, R.travel);
    S.km = Math.abs(S.trainX - ox) / UNIT; S.phone = "ride";
  }
  if (step >= 4) { S.trainX = dx; S.km = R.distKm; }
  if (step === 4) {
    S.doors = 1 - seg(t, 7.5, 8.5);
    S.show = true; S.pos.copy(DOOR_D);
    const k1 = seg(t, 0.3, 3.4);
    if (!forgot) {
      S.pos.lerpVectors(DOOR_D, OUT_AT, k1); S.walk = k1 > 0 && k1 < 1 ? 1 : 0;
      S.face = k1 < 1 ? Math.atan2(OUT_AT.x - DOOR_D.x, OUT_AT.z - DOOR_D.z) : Math.PI;
      S.arm = seg(t, 3.5, 4.2) * (1 - seg(t, 5.4, 6));
      S.pout = t < 4.2 ? ["idle"] : t < 4.7 ? ["read"] : ["out", `${km1(R.distKm)} km`];
      if (t >= 4.7) S.ledOut = 0x22c55e;
      S.pkt = seg(t, 4.9, 7.6); S.pktFrom = V(dx - 3.6, 2.6, -10); S.servers = t > 7.4 ? 1 : 0;
      S.phone = t < 4.7 ? "ride" : "out";
      if (t > 6) { const k2 = seg(t, 6, 8.6); S.pos.lerpVectors(OUT_AT, EXIT, k2); S.walk = k2 > 0 && k2 < 1 ? 1 : 0; S.face = Math.atan2(EXIT.x - OUT_AT.x, EXIT.z - OUT_AT.z); }
      S.exitOpen = t < 4.7 ? 0 : clamp((t - 4.7) / 0.6) - clamp((t - 9.2) / 0.6);  // torniquete de salida (si el destino es Portal Sur)
    } else {
      const k = seg(t, 0.3, 6.5); S.pos.lerpVectors(DOOR_D, EXIT, k); S.walk = k > 0 && k < 1 ? 1 : 0;
      S.face = Math.atan2(EXIT.x - DOOR_D.x, EXIT.z - DOOR_D.z); S.phone = t > 6 ? "noout" : "ride";
      S.exitOpen = clamp((t - 2.6) / 0.6) - clamp((t - 7.5) / 0.6);  // sale sin validar: cruza detrás de otro
    }
  }
  if (step >= 5) { S.show = false; S.doors = 0; S.phone = forgot ? "noout" : "out"; }
  if (step === 5) { S.receipt = seg(t, 0.8, 2.0); S.servers = 1; S.phone = t > 2 ? "fare" : S.phone; }
  if (step === 6) {
    S.night = seg(t, 0, 2); S.receipt = 1 - seg(t, 0, 1);
    S.servers = t > 2 && t < 4 ? 1 : 0; S.big = seg(t, 3.2, 6.6); S.bankGlow = t > 6.4 ? 1 : 0;
    S.phone = t > 6.8 ? "charge" : "night";
  }
  return S;
}

function apply(S, time, step, dt) {
  updateStationLabels(S, step, dt);
  person.visible = S.show;
  person.position.set(S.pos.x, S.pos.y + (S.walk ? Math.abs(Math.sin(time * 9)) * 0.04 : 0), S.pos.z);
  person.rotation.y = S.face; pose(S.walk, S.arm, time);
  const vN = step === 3 ? clamp(trainSpeed(stepT) / 13, 0, 1) : 0;   // balanceo del tren en marcha
  train.position.set(S.trainX, Math.sin(time * 7.3) * 0.012 * vN, 0);
  train.rotation.z = Math.sin(time * 2.4) * 0.011 * vN;
  train.rotation.y = Math.sin(time * 1.7) * 0.004 * vN;
  extras.forEach((e, i) => { e.g.position.y = 1.0 + Math.abs(Math.sin(time * 1.1 + e.ph)) * 0.012; e.g.rotation.y += Math.sin(time * 0.5 + i) * 0.0004; });
  doorsMeshes.forEach((d) => (d.scale.x = 1 - S.doors * 0.88));
  poles.forEach((p, i) => {
    const isO = i === O, isD = i === D;
    p.in.draw(...(isO ? S.pin : ["idle"])); p.in.led(isO ? S.ledIn : 0x3b82f6);
    p.out.draw(...(isD ? S.pout : ["idle"])); p.out.led(isD ? S.ledOut : 0x3b82f6);
    const bank = gateBanks[i];
    if (bank) {                                  // solo Portal Sur tiene puertas
      bank.entry(isO ? clamp(S.gateOpen) : 0, isO ? S.gateState : "closed", time);
      bank.exit(isD ? clamp(S.exitOpen) : 0, "closed", time);
    }
  });
  const curve = new THREE.QuadraticBezierCurve3(S.pktFrom, V((S.pktFrom.x + R.cloud.x) / 2, 30, -20), R.cloud.clone().add(V(0, -3, 0)));
  pkt.visible = S.pkt > 0 && S.pkt < 1;
  if (pkt.visible) pkt.position.copy(curve.getPoint(S.pkt));
  trail.forEach((m, i) => { const u = S.pkt - (i + 1) * 0.02; m.visible = pkt.visible && u > 0; if (m.visible) m.position.copy(curve.getPoint(u)); });
  servers.forEach((s, i) => (s.material.emissiveIntensity = S.servers ? 1.5 + Math.sin(time * 14 + i) * 1.2 : 0.4));
  receipt.material.opacity = S.receipt; receipt.visible = S.receipt > 0.01;
  // la etiqueta de la nube se reubica según la cámara de cada paso para no chocar con la franja superior ni con la nube
  const cloudLabelY = step === 5 ? R.cloud.y : step === 6 ? R.cloud.y - 4 : R.cloud.y + 8.6;
  cloudLabel.position.set(R.cloud.x, cloudLabelY, R.cloud.z);
  skyU.horizon.value.copy(stage2(DAY, DUSK, NIGHT, S.night));
  skyU.zenith.value.copy(stage2(DAY_HI, DUSK_HI, NIGHT_HI, S.night));
  scene.fog.color.copy(skyU.horizon.value);
  scene.fog.near = lerp(110, 55, S.night);   // de noche la niebla entra antes y el suelo se funde con el cielo
  scene.fog.far = lerp(380, 240, S.night);
  scene.environmentIntensity = lerp(0.18, 0.03, S.night); // el IBL también baja de noche
  bloom.strength = lerp(0.28, 0.55, S.night);          // de noche las luces de la ciudad lucen más
  sun.color.copy(stage2(SUN_DAY, SUN_DUSK, SUN_NIGHT, S.night));
  hemi.intensity = S.night < 0.5 ? lerp(1.1, 0.75, S.night / 0.5) : lerp(0.75, 0.22, (S.night - 0.5) / 0.5);
  sun.intensity = S.night < 0.5 ? lerp(2.1, 2.5, S.night / 0.5) : lerp(2.5, 0.16, (S.night - 0.5) / 0.5);
  stars.material.opacity = clamp((S.night - 0.4) / 0.6); lamps.forEach((l) => (l.intensity = S.night * 40));
  bankWin.forEach((w) => (w.material.emissiveIntensity = S.night * (0.55 + S.bankGlow * 1.1)));
  bldgMats.forEach((m, i) => (m.emissiveIntensity = S.night * (0.5 + 0.3 * Math.sin(i * 12.9898) ** 2)));
  trainWinMat.emissiveIntensity = S.night * 0.9;
  const bc = new THREE.QuadraticBezierCurve3(R.cloud.clone().add(V(0, -1, 0)), V((R.cloud.x + R.bank.x) / 2, 40, -55), R.bank.clone().add(V(0, 11, 0)));
  big.visible = S.big > 0 && S.big < 1; if (big.visible) big.position.copy(bc.getPoint(S.big));
  // sombra sigue la acción; el sol baja de ángulo hacia el atardecer y se queda bajo de noche (luna)
  const fx = step === 3 ? S.trainX : step >= 4 ? R.dx : R.ox;
  const sunH = lerp(40, 13, clamp(S.night * 1.3));
  sun.position.set(fx - 25, sunH, -30); sun.target.position.set(fx, 0, -6);
  setPhone(S.phone, S.km, S.trainX); updateStrip(S, step);
}

// ================= cámara =================
function trainSpeed(t) { // unidades/seg, por diferencia finita sobre trainX (f pura de t)
  const h = 0.12, t0 = Math.max(0, t - h);
  return Math.abs(trainX(t) - trainX(t0)) / h;
}
function cam(step, t, S) {
  const ox = R.ox, dx = R.dx, dir = R.dir;
  switch (step) {
    case 0: { const a = t * 0.05; return [V(120 + Math.sin(a) * 60, 85, -175 + Math.cos(a) * 10), V(120, 0, -8)]; }
    case 1: return [V(ox - 13, 6.5, -25), V(ox, 1.6, -11)];
    case 2: {
      const near = O === 0
        ? [V(ox - 4.6, 2.9, -16.2), V(ox + 1.5, 1.8, -10.2)]   // 3/4 frontal y bajo: se ven las puertas abriéndose
        : [V(ox - 1.6, 3.6, -14.6), V(ox + 1.3, 2.3, -10)];
      const hold = O === 0 && noCheck ? 5.4 : 3.2;
      return t < hold ? near : [V(ox - 14 * dir, 9, -24), V(ox + 2, 2.5, -6)];
    }
    case 3: {
      // cámara detrás y por encima del tren, casi alineada con la vía (vista "de frente" al recorrido);
      // a más velocidad se aleja y sube un poco, al frenar/parar se acerca de nuevo
      const vNorm = clamp(trainSpeed(t) / 13, 0, 1);
      const dist = lerp(22, 36, vNorm), height = lerp(15, 21, vNorm), lead = lerp(2, 11, vNorm) * dir;
      return [V(S.trainX - dist * dir, height, 4.5 - vNorm * 1.5), V(S.trainX + lead, 1.8, -1.5)];
    }
    case 4: return forgot ? [V(dx + 4, 6, -24), V(dx, 1.8, -9)] : [V(dx + 5.5, 4.2, -17.5), V(dx - 2.5, 2.2, -8)];
    case 5: return [R.cloud.clone().add(V(dir * 5, -12, -56)), R.cloud.clone().add(V(dir > 0 ? -8 : 8, -9, 0))];
    case 6: return [V(R.mid - dir * 5, 28, -140), V(R.mid + dir * 15, 9, -52)];
    default: return [V(R.mid - dir * 10, 40, -150), V(R.mid + dir * 10, 12, -45)];
  }
}

// ================= interfaz =================
const $ = (id) => document.getElementById(id);
function nearestStationName(trainXval) {
  const absKm = trainXval / UNIT;
  let best = STATIONS[0], bd = Infinity;
  for (const s of STATIONS) { const dd = Math.abs(s.km - absKm); if (dd < bd) { bd = dd; best = s; } }
  return best.name;
}
let phoneKey = "";
function setPhone(k, km, trainXval) {
  const o = STATIONS[O], d = STATIONS[D];
  const est = fareFor(km || 0).rounded;
  const M = {
    home: ["Tus viajes", [["Hoy", "Aún no hay viajes"]]],
    pay: ["Pago sin contacto", [["Débito ···· 4821", "Listo para check-in"]]],
    in: ["Viaje en curso", [["Check-in", `${o.name} · 7:02 a. m.`, "ok"]]],
    ride: ["Viaje en curso", [["Check-in", `${o.name} · 7:02 a. m.`, "ok"], ["Vas pasando", nearestStationName(trainXval || 0)], ["Si bajas aquí", `${km1(km || 0)} km · ${money(est)}`]]],
    out: ["Viaje terminado", [["Check-in", `${o.name}`, "ok"], ["Check-out", `${d.name}`, "ok"], ["Distancia", `${km1(R.distKm)} km`]]],
    noout: ["Falta el check-out", [["Check-in", `${o.name}`, "ok"], ["Check-out", "No registrado", "warn"], ["Aviso", "Se cobrará el tope si no se ajusta", "warn"]]],
    fare: ["Tarifa calculada", forgot ? [["Regla", "Sin check-out → tope", "warn"], ["Cobro", money(CAP), "warn"], ["Ajuste", "Solicítalo en la app"]] : [["Distancia", `${km1(R.distKm)} km`], ["Cálculo", `${money(BASE)} + ${km1(R.distKm)} × ${money(PER_KM)}`], ["Cobro", money(R.fare.rounded), "ok"]]],
    night: ["Tus viajes", [["Viaje", `${o.name} → ${forgot ? "¿?" : d.name}`], ["11:59 p. m.", "Procesando cobro del día…"]]],
    charge: ["Resumen del día", [["Cobro único", `${money(forgot ? CAP : R.fare.rounded)} · débito ···· 4821`, forgot ? "warn" : "ok"], ["Viaje", `${o.name} → ${forgot ? "sin check-out" : d.name}`], ["Estado", "Aprobado por el banco", "ok"]]],
  }[k];
  const key = k + (k === "ride" ? Math.floor((km || 0) * 10) : "") + O + D + forgot;
  if (key === phoneKey) return;
  const pulse = !phoneKey.startsWith(k); phoneKey = key;
  $("phone-title").textContent = M[0];
  $("phone-body").innerHTML = M[1].map(([a, b, c]) => `<div class="row ${c || ""}"><b>${a}</b><span>${b}</span></div>`).join("");
  if (pulse) { $("phone").classList.remove("pulse"); void $("phone").offsetWidth; $("phone").classList.add("pulse"); }
}
// tira de la línea
$("strip").innerHTML = `<div class="line"><div id="fill"></div><div id="tram"></div></div><div class="stations">` + STATIONS.map((s, i) =>
  `<button class="st" data-i="${i}" style="left:${(s.km / 15) * 100}%" title="Clic: usar como destino"><i></i><b>${s.name}</b><span>km ${km1(s.km)}</span></button>`).join("") + `</div>`;
function updateStrip(S, step) {
  const x = (step <= 2 ? R.ox : S.trainX) / UNIT / 15 * 100;
  $("tram").style.left = x + "%";
  const a = Math.min(R.ox, step >= 3 ? S.trainX : R.ox) / UNIT / 15 * 100, b = Math.max(R.ox, step >= 3 ? S.trainX : R.ox) / UNIT / 15 * 100;
  $("fill").style.left = a + "%"; $("fill").style.width = b - a + "%";
}
function markStations() {
  document.querySelectorAll(".st").forEach((b, i) => { b.classList.toggle("o", i === O); b.classList.toggle("d", i === D); });
  $("orig").value = O; $("dest").value = D;
  $("route-fare").textContent = `${km1(Math.abs(STATIONS[D].km - STATIONS[O].km))} km · ${money(fareFor(Math.abs(STATIONS[D].km - STATIONS[O].km)).rounded)}`;
}
const opts = STATIONS.map((s, i) => `<option value="${i}">${s.name} (km ${km1(s.km)})</option>`).join("");
$("orig").innerHTML = opts; $("dest").innerHTML = opts;
function setRoute(o, d) {
  if (o === d) d = o === STATIONS.length - 1 ? o - 1 : o + 1;
  O = o; D = d; buildRoute(); markStations(); syncStep2Dur(); goto(Math.min(step, 1) === 0 ? 0 : 1);
}
$("orig").onchange = (e) => setRoute(+e.target.value, D);
$("dest").onchange = (e) => setRoute(O, +e.target.value);
document.querySelectorAll(".st").forEach((b) => b.addEventListener("click", (e) => {
  const i = +b.dataset.i; if (e.shiftKey || i === O) return; setRoute(O, i);
}));
$("forgot").onchange = (e) => { forgot = e.target.checked; drawReceipt(); if (step >= 4) { stepT = 0; } refreshText(); };
function syncStep2Dur() { steps[2].dur = noCheck && O === 0 ? 12 : 9; }
$("nocheck").onchange = (e) => { noCheck = e.target.checked; syncStep2Dur(); if (step === 2) stepT = 0; refreshText(); };

let step = 0, stepT = 0, playing = false, frozen = false, uiOp = 0, introActive = true;
function refreshText() {
  const s = steps[step];
  $("kicker").textContent = val(s.kicker); $("title").textContent = val(s.title); $("text").textContent = val(s.text);
  $("facts").innerHTML = val(s.facts).map((f) => `<li>${f}</li>`).join("");
}
function goto(i) {
  step = clamp(i, 0, steps.length - 1); stepT = 0; userMoved = false; frozen = false;
  refreshText();
  document.querySelectorAll(".dot").forEach((d, k) => { d.classList.toggle("on", k === step); d.classList.toggle("done", k < step); });
  $("prev").disabled = step === 0; $("next").textContent = step === steps.length - 1 ? "Repetir ↺" : "Siguiente →";
  if (!introActive) { $("panel").classList.remove("in"); void $("panel").offsetWidth; $("panel").classList.add("in"); }
  $("forgot-wrap").classList.toggle("hot", step === 4);
  $("nocheck-wrap").classList.toggle("hot", step === 2 && O === 0);
  $("route").classList.toggle("hot", step === 0);
}
$("dots").innerHTML = steps.map((s, i) => `<button class="dot" data-i="${i}">${i === 0 ? "★" : i}</button>`).join("");
document.querySelectorAll(".dot").forEach((d) => d.addEventListener("click", () => goto(+d.dataset.i)));
$("prev").onclick = () => goto(step - 1);
$("next").onclick = () => goto(step === steps.length - 1 ? 0 : step + 1);
$("play").onclick = () => { playing = !playing; $("play").textContent = playing ? "❚❚ Pausa" : "▶ Auto"; if (playing && step === steps.length - 1) goto(0); };
$("replay").onclick = () => { stepT = 0; userMoved = false; };
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "SELECT") return;
  if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); $("next").click(); }
  if (e.key === "ArrowLeft") $("prev").click();
});
$("start").onclick = () => { $("intro").classList.add("gone"); document.body.classList.add("started"); introActive = false; goto(1); };

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  composer.setSize(w, h); bloom.setSize(w, h); ssao.setSize(w, h); smaa.setSize(w, h);
}
addEventListener("resize", resize); resize();
applyQuality(autoQuality());
$("quality").value = quality;
$("quality").onchange = (e) => applyQuality(e.target.value);

buildRoute(); markStations(); goto(0);
const clock = new THREE.Clock();
// panel y celular ocultos durante la intro (solo tren + fondo); se desvanecen también cuando el tren va rápido en plena vía
function uiFadeTarget(step, t) {
  if (introActive) return 0;
  if (step !== 3) return 1;
  return 1 - clamp(trainSpeed(t) / 11, 0, 1);
}
function updateUiFade(step, t, dt) {
  uiOp += (uiFadeTarget(step, t) - uiOp) * (1 - Math.pow(0.001, dt));
  const o = uiOp < 0.03 ? 0 : uiOp;
  $("panel").style.opacity = o; $("panel").style.pointerEvents = o < 0.2 ? "none" : "auto";
  $("phone").style.opacity = o;
  document.querySelector(".hint").style.opacity = o;
}
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
  if (!frozen) stepT += dt;
  const s = steps[step];
  if (playing && stepT > s.dur + 1) { if (step < steps.length - 1) goto(step + 1); else { playing = false; $("play").textContent = "▶ Auto"; } }
  const S = world(step, stepT);
  apply(S, time, step, dt);
  updateUiFade(step, stepT, dt);
  $("bar").style.width = `${clamp(stepT / s.dur) * 100}%`;
  if (!userMoved) {
    const [p, tg] = cam(step, stepT, S);
    const k = step === 3 ? 1 - Math.pow(0.0005, dt) : 1 - Math.pow(0.02, dt);
    camera.position.lerp(p, k); controls.target.lerp(tg, k);
  } else if (step === 3) {
    const delta = S.trainX - controls.target.x; controls.target.x += delta; camera.position.x += delta;
  }
  controls.update();
  sky.position.copy(camera.position);
  if (quality === "baja") renderer.render(scene, camera); else composer.render();
  requestAnimationFrame(loop);
}
loop();
window.__ot = { goto, seek(t) { stepT = t; frozen = true; const S = world(step, t); const [p, tg] = cam(step, t, S); camera.position.copy(p); controls.target.copy(tg); }, setRoute, setForgot(v) { $("forgot").checked = v; $("forgot").onchange({ target: { checked: v } }); },
  setNoCheck(v) { $("nocheck").checked = v; $("nocheck").onchange({ target: { checked: v } }); }, setQuality: applyQuality };
