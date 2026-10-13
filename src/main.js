import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ---------- utilidades ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t = clamp(t), t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const seg = (t, a, b) => ease((t - a) / (b - a)); // 0..1 entre a y b
const C = {
  navy: 0x14213d, teal: 0x2a9d8f, tealDark: 0x1d6f66, orange: 0xe9893a, light: 0xf5f6f2,
  red: 0xc62f3a, glass: 0x9fd3e6, concrete: 0xc9ced3, asphalt: 0x3a3f47,
};

// ---------- escena ----------
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const DAY = new THREE.Color(0xbfdcec), NIGHT = new THREE.Color(0x0a1224);
scene.background = DAY.clone();
scene.fog = new THREE.Fog(DAY.clone(), 45, 110);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
camera.position.set(-22, 16, -26);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 6; controls.maxDistance = 70;
controls.target.set(0, 2, 0);
let userMoved = false;
controls.addEventListener("start", () => { userMoved = true; });

const hemi = new THREE.HemisphereLight(0xffffff, 0x6b7a8a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-20, 30, -14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
scene.add(sun);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });
function box(w, h, d, m, x = 0, y = 0, z = 0, parent = scene) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b;
}

// texto en canvas
function textCanvas(lines, { w = 512, h = 128, bg = "#14213D", fg = "#F5F6F2", size = 44, radius = 28, sub = null } = {}) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, radius); g.fill();
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `700 ${size}px "Segoe UI", Arial, sans-serif`;
  const L = Array.isArray(lines) ? lines : [lines];
  L.forEach((t, i) => g.fillText(t, w / 2, h / 2 + (i - (L.length - 1) / 2) * size * 1.15 - (sub ? size * 0.35 : 0)));
  if (sub) { g.font = `500 ${size * 0.6}px "Segoe UI", Arial, sans-serif`; g.globalAlpha = 0.8; g.fillText(sub, w / 2, h / 2 + size * 0.6); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function label(text, sub, pos, scale = 4) {
  const tex = textCanvas(text, { sub, w: 640, h: 160, size: 52 });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(scale, scale / 4, 1); s.position.copy(pos); s.renderOrder = 10; scene.add(s); return s;
}

// ---------- suelo, vía y andén ----------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), mat(0x9db08f));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
box(260, 0.05, 9, mat(C.asphalt), 0, 0.02, 8.6);                 // vía exclusiva
for (let x = -120; x < 120; x += 6) box(3, 0.06, 0.18, mat(0xf2f2f2), x, 0.04, 8.6);
box(260, 0.08, 7, mat(0xb9bec4), 0, 0.03, -9);                   // andén peatonal
for (let x = -30; x <= 30; x += 3) box(0.05, 0.09, 7, mat(0xa7adb3), x, 0.04, -9);

// estación
const station = new THREE.Group(); scene.add(station);
box(22, 0.35, 6.8, mat(C.concrete), 0, 0.17, 0.85, station);       // plataforma z -2.55..4.25
box(22, 0.1, 0.25, mat(0xf2c230), 0, 0.37, 4.1, station);         // borde amarillo
for (const x of [-10, -5, 0, 5, 10]) for (const z of [-2.2, 3.8]) box(0.25, 3.8, 0.25, mat(0x7c8691, { metalness: 0.5 }), x, 2.25, z, station);
const roof = box(23, 0.3, 7.6, mat(0xe9edf1), 0, 4.25, 0.8, station);
box(23, 0.5, 0.3, mat(C.navy), 0, 4.2, -3.05, station);
const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshBasicMaterial({ map: textCanvas("Estación Calle 26", { w: 896, h: 140, size: 70, sub: null }), transparent: true }));
sign.position.set(0, 5, -3.25); sign.rotation.y = Math.PI; scene.add(sign);
for (const x of [-9, -3, 3, 9]) box(5.6, 2.6, 0.08, mat(C.glass, { transparent: true, opacity: 0.25, metalness: 0.3, roughness: 0.1 }), x, 1.7, -2.5, station).castShadow = false;

// barrera de acceso con puertas de vidrio
box(1.2, 1.0, 0.18, mat(0x8c96a0, { metalness: 0.6 }), -1.4, 0.85, -2.6);
box(1.2, 1.0, 0.18, mat(0x8c96a0, { metalness: 0.6 }), 1.4, 0.85, -2.6);
const doorMat = mat(C.glass, { transparent: true, opacity: 0.55, metalness: 0.2, roughness: 0.1 });
const doorL = box(0.82, 1.1, 0.06, doorMat, -0.4, 0.95, -2.6);
const doorR = box(0.82, 1.1, 0.06, doorMat, 0.4, 0.95, -2.6);

// validador
const validator = new THREE.Group(); validator.position.set(1.45, 0, -2.85); scene.add(validator);
box(0.32, 1.25, 0.28, mat(C.navy), 0, 0.97, 0, validator);
const head = box(0.5, 0.55, 0.36, mat(0x1d2b4a), 0, 1.8, -0.02, validator);
head.rotation.x = 0.35;
const screenCv = document.createElement("canvas"); screenCv.width = 256; screenCv.height = 200;
const screenTex = new THREE.CanvasTexture(screenCv); screenTex.colorSpace = THREE.SRGBColorSpace;
const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.31), new THREE.MeshBasicMaterial({ map: screenTex }));
screen.position.set(0, 1.86, -0.21); screen.rotation.set(0.35, Math.PI, 0); validator.add(screen);
const ledMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 1.5 });
const led = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 12, 40), ledMat);
led.position.set(0, 1.62, -0.25); led.rotation.set(0.35, 0, 0); validator.add(led);
const ledLight = new THREE.PointLight(0x3b82f6, 2, 3); ledLight.position.set(0, 1.7, -0.5); validator.add(ledLight);
let screenState = "";
function drawScreen(state) {
  if (state === screenState) return; screenState = state;
  const g = screenCv.getContext("2d");
  const map = {
    idle: ["#14213D", "#F5F6F2", "Acerque", "su tarjeta"],
    read: ["#14213D", "#7FD1C6", "Leyendo…", "EMV"],
    ok: ["#1D6F66", "#FFFFFF", "✓ Aprobado", "0,3 s"],
    no: ["#9B1C24", "#FFFFFF", "✗ Rechazado", "Use otro medio"],
  }[state];
  g.fillStyle = map[0]; g.fillRect(0, 0, 256, 200);
  g.fillStyle = map[1]; g.textAlign = "center";
  g.font = "700 40px Segoe UI, Arial"; g.fillText(map[2], 128, 88);
  g.font = "500 30px Segoe UI, Arial"; g.fillText(map[3], 128, 140);
  screenTex.needsUpdate = true;
}
drawScreen("idle");

// ondas NFC
const rings = [0, 1, 2].map(() => {
  const r = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 8, 48), new THREE.MeshBasicMaterial({ color: 0x7fd1c6, transparent: true, opacity: 0 }));
  r.position.set(1.45, 1.62, -3.15); r.rotation.x = 0.35; scene.add(r); return r;
});

// ---------- pasajero ----------
function makePerson() {
  const p = new THREE.Group();
  const skin = mat(0xc68b5f), jacket = mat(C.teal), pants = mat(0x2b3546), shoe = mat(0x1a1a1a);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 6, 14), jacket); torso.position.y = 1.2; torso.castShadow = true; p.add(torso);
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin); headM.position.y = 1.78; headM.castShadow = true; p.add(headM);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x2a1b12)); hair.position.y = 1.8; p.add(hair);
  const bag = box(0.38, 0.45, 0.18, mat(C.orange), 0, 1.25, -0.27, p);
  const limb = (len, r, m) => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m); c.position.y = -len / 2 - r; c.castShadow = true; g.add(c); return g; };
  const legL = limb(0.62, 0.1, pants), legR = limb(0.62, 0.1, pants);
  legL.position.set(-0.12, 0.88, 0); legR.position.set(0.12, 0.88, 0); p.add(legL, legR);
  [legL, legR].forEach((l) => box(0.18, 0.1, 0.3, shoe, 0, -0.86, 0.05, l));
  const armL = limb(0.42, 0.08, jacket), armR = limb(0.42, 0.08, jacket);
  armL.position.set(-0.36, 1.48, 0); armR.position.set(0.36, 1.48, 0); p.add(armL, armR);
  const phone = box(0.09, 0.17, 0.02, mat(0x111111, { emissive: 0x2a9d8f, emissiveIntensity: 0.4 }), 0, -0.68, 0.06, armR);
  p.userData = { legL, legR, armL, armR, phone, bag };
  return p;
}
const person = makePerson(); scene.add(person);
function posePerson(walk, armUp, t) {
  const { legL, legR, armL, armR } = person.userData;
  const s = Math.sin(t * 9) * 0.55 * walk;
  legL.rotation.x = s; legR.rotation.x = -s; armL.rotation.x = -s * 0.8;
  armR.rotation.x = lerp(s * 0.8, -1.35, armUp); armR.rotation.z = lerp(0, 0.25, armUp);
  person.position.y = walk ? Math.abs(Math.sin(t * 9)) * 0.04 : 0;
}

// ---------- bus ----------
const bus = new THREE.Group(); scene.add(bus);
const busRed = mat(C.red, { roughness: 0.45, metalness: 0.2 });
box(17, 2.7, 2.55, busRed, 0, 1.75, 0, bus);
box(17.05, 0.9, 2.6, mat(0x1b2230, { roughness: 0.2, metalness: 0.4 }), 0, 2.3, 0, bus);
box(0.5, 2.75, 2.62, mat(0x30343b), 0, 1.75, 0, bus); // articulación
for (const x of [-6, -2.6, 2.6, 6]) {
  const d = box(1.2, 2.1, 0.05, mat(0xd9dee3, { metalness: 0.3 }), x, 1.55, -1.3, bus);
  d.userData.door = true;
}
for (const x of [-6.5, -1.5, 1.5, 6.5]) for (const z of [-1.25, 1.25]) {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 24), mat(0x16181c)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.5, z); w.castShadow = true; bus.add(w);
}
const busSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.45), new THREE.MeshBasicMaterial({ map: textCanvas("Pago abierto · OpenTransit", { w: 768, h: 128, size: 50, bg: "#14213D" }) }));
busSign.position.set(0, 2.95, -1.29); busSign.rotation.y = Math.PI; bus.add(busSign);
const BUS_STOP_X = 2, BUS_Z = 5.9;

// ---------- nube y red financiera ----------
const CLOUD = new THREE.Vector3(-9, 12, -12);
const cloud = new THREE.Group(); cloud.position.copy(CLOUD); scene.add(cloud);
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
[[0, 0, 0, 2.6], [2.4, -0.3, 0.4, 2], [-2.4, -0.4, 0.2, 1.9], [1, 0.9, -0.6, 1.8], [-1, 0.7, 0.8, 1.6]].forEach(([x, y, z, r]) => {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), cloudMat); s.position.set(x, y, z); cloud.add(s);
});
const servers = [];
for (let i = -1; i <= 1; i++) {
  const sv = box(0.9, 1.8, 0.9, mat(0x1f2a44, { metalness: 0.4 }), i * 1.25, -2.9, 0, cloud);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.02), new THREE.MeshStandardMaterial({ color: 0x7fd1c6, emissive: 0x2a9d8f, emissiveIntensity: 0.4 }));
  strip.position.set(0, 0.4, -0.46); sv.add(strip); servers.push(strip);
  const strip2 = strip.clone(); strip2.material = strip.material.clone(); strip2.position.y = 0; sv.add(strip2); servers.push(strip2);
}
label("Plataforma ABT", "nube de OpenTransit", CLOUD.clone().add(new THREE.Vector3(0, 3.7, 0)), 5.2);

const BANK = new THREE.Vector3(11, 0, -17);
const bank = new THREE.Group(); bank.position.copy(BANK); scene.add(bank);
box(9, 0.6, 6, mat(0xd8d2c4), 0, 0.3, 0, bank);
box(8, 5.5, 5, mat(0xe9e4d8), 0, 3.35, 0, bank);
for (let i = -3; i <= 3; i += 1.5) box(0.45, 4.8, 0.45, mat(0xf7f3ea), i, 3.1, -2.75, bank);
const pedi = new THREE.Mesh(new THREE.ConeGeometry(5.6, 1.6, 4, 1), mat(0xd8d2c4)); pedi.rotation.y = Math.PI / 4; pedi.scale.set(1, 1, 0.65); pedi.position.y = 6.9; bank.add(pedi);
const bankWin = [];
for (let i = -3; i <= 3; i += 1.5) for (const y of [2.2, 4.2]) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1), new THREE.MeshStandardMaterial({ color: 0x324055, emissive: 0xffc875, emissiveIntensity: 0 }));
  w.position.set(i + 0.75, y, -2.52); w.rotation.y = Math.PI; bank.add(w); bankWin.push(w);
}
label("Red financiera", "adquirente · franquicia · banco", BANK.clone().add(new THREE.Vector3(0, 9.2, 0)), 5.2);
const valLabel = label("Validador NFC", null, new THREE.Vector3(1.45, 2.75, -2.9), 1.8);

// ---------- paquetes de datos ----------
function glowPacket(color, r = 0.28) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2 }));
  g.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(r * 2.2, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 }));
  g.add(halo);
  g.visible = false; scene.add(g); return g;
}
const packet = glowPacket(0x7fd1c6, 0.45);
const trail = [...Array(8)].map((_, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22 - i * 0.022, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7fd1c6, transparent: true, opacity: 0.5 - i * 0.05 })); m.visible = false; scene.add(m); return m; });
const curveUp = new THREE.QuadraticBezierCurve3(new THREE.Vector3(1.45, 1.9, -3), new THREE.Vector3(-4, 14, -4), CLOUD.clone().add(new THREE.Vector3(0, -2, 0)));
const curveBank = new THREE.QuadraticBezierCurve3(CLOUD.clone().add(new THREE.Vector3(1, -1, 0)), new THREE.Vector3(4, 20, -14), BANK.clone().add(new THREE.Vector3(0, 7, 0)));
const bigPacket = glowPacket(0xe9893a, 0.8);
const miniPackets = [...Array(10)].map(() => glowPacket(0x7fd1c6, 0.25));

// estrellas y luces nocturnas
const starGeo = new THREE.BufferGeometry();
const sp = new Float32Array(900);
for (let i = 0; i < 300; i++) { const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.45 * Math.PI; sp.set([Math.cos(th) * Math.cos(ph) * 160, Math.sin(ph) * 160 + 10, Math.sin(th) * Math.cos(ph) * 160], i * 3); }
starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0, fog: false }));
scene.add(stars);
const lamps = [-8, 0, 8].map((x) => { const l = new THREE.PointLight(0xffd59a, 0, 14); l.position.set(x, 3.8, 0.8); scene.add(l); return l; });

// ---------- pasos ----------
const steps = [
  { title: "Así funciona OpenTransit", kicker: "Recorrido del usuario",
    text: "Pagar el transporte con la misma tarjeta o el celular que ya usas. Recorre los 6 pasos con las flechas, arrastra para girar la cámara y usa la rueda para acercarte.",
    facts: ["Sin tarjeta propia de cada ciudad", "Fase 1: 20 estaciones de TransMilenio"],
    dur: 7, cam: [[-24, 15, -24], [2, 3, -2]] },
  { title: "1. Llega a la estación", kicker: "Paso 1 de 6",
    text: "Andrés llega a la estación. No tiene que hacer fila para recargar ni comprar una tarjeta del sistema: lleva su tarjeta débito y su celular.",
    facts: ["4,2 millones de validaciones en día hábil", "Cero filas de recarga"],
    dur: 6, cam: [[-7, 4.5, -14], [0, 1.5, -5]] },
  { title: "2. Tap-in con tarjeta o celular", kicker: "Paso 2 de 6",
    text: "Acerca el celular (o la tarjeta, o el reloj) al validador. La lectura usa NFC bajo el estándar EMV, el mismo de los datáfonos.",
    facts: ["Débito, crédito, celular o reloj", "64 % de las compras presenciales ya son sin contacto"],
    dur: 5, cam: [[-2.4, 2.3, -6.4], [0.9, 1.5, -3.1]] },
  { title: "3. Validación en menos de 0,5 s", kicker: "Paso 3 de 6",
    text: "El validador consulta su lista de restricción local, sin esperar al banco. Si todo está bien, aprueba y abre la barrera. Activa \"Simular tarjeta rechazada\" para ver qué pasa con un medio reportado.",
    facts: ["Aprobación local < 0,5 s", "Lista de restricción en el validador"],
    dur: 7, cam: [[-3.2, 2.9, -7], [0.6, 1.3, -2.4]] },
  { title: "4. El evento viaja cifrado a la nube", kicker: "Paso 4 de 6",
    text: "El validador no guarda datos de la tarjeta: envía un token cifrado con la hora y la estación. La plataforma ABT lo registra y su motor de reglas lo procesa.",
    facts: ["Token cifrado, sin datos de la tarjeta", "Motor de reglas basado en cuenta (ABT)"],
    dur: 6, cam: [[9, 7, -31], [-7, 8, -7]] },
  { title: "5. Viaja y hace transbordo", kicker: "Paso 5 de 6",
    text: "Andrés sube al bus y sigue su viaje. Cada validación llega a la nube, donde se aplican transbordos, tarifas diferenciales y topes de cobro automáticamente.",
    facts: ["Transbordos y topes automáticos", "Tarifa 2026: $3.550"],
    dur: 8, cam: [[-12, 5, 17], [2, 1.5, 3]] },
  { title: "6. Cobro único en la noche", kicker: "Paso 6 de 6",
    text: "Al cierre del día la plataforma agrupa todos los viajes de cada tarjeta y envía un solo cobro por la red financiera. Andrés recibe el resumen en la app. El usuario no paga nada extra.",
    facts: ["Un solo cobro diario por tarjeta", "El operador paga $347 por validación"],
    dur: 9, cam: [[32, 16, -38], [0, 6, -10]] },
];

const START = new THREE.Vector3(-7, 0, -13), AT_VAL = new THREE.Vector3(0.45, 0, -3.55), INSIDE = new THREE.Vector3(0.2, 0.35, -0.6), AT_DOOR = new THREE.Vector3(2, 0.35, 3.6);
let rejected = false;

// estado del mundo como función de (paso, tiempo)
function world(step, t) {
  const S = { pos: START.clone(), face: Math.atan2(AT_VAL.x - START.x, AT_VAL.z - START.z), walk: 0, arm: 0, show: true,
    doors: 0, scr: "idle", led: 0x3b82f6, rings: -1, pkt: -1, busX: BUS_STOP_X, busDoor: 0, night: 0, big: -1, minis: -1,
    servers: 0, bankGlow: 0, phone: "home" };

  if (step >= 1) {
    const k = step === 1 ? seg(t, 0.3, 5) : 1;
    S.pos.lerpVectors(START, AT_VAL, k); S.walk = step === 1 && k > 0 && k < 1 ? 1 : 0;
    if (step > 1 || k >= 1) S.face = 0;
  }
  if (step === 2) {
    S.arm = seg(t, 0.2, 1.2); S.scr = t > 1.2 ? "read" : "idle"; S.rings = t > 1.2 ? (t - 1.2) % 1 : -1; S.phone = "pay";
  }
  if (step === 3) {
    let okStart = 0.3;
    S.arm = 1; S.scr = "read"; S.phone = "pay";
    if (rejected) {
      okStart = 3.2;
      if (t >= 0.3 && t < 2.2) { S.scr = "no"; S.led = 0xd33a46; S.phone = "declined"; S.arm = 1 - seg(t, 1.0, 1.6); }
      else if (t >= 2.2 && t < okStart) { S.scr = "idle"; S.phone = "switch"; S.arm = seg(t, 2.3, 3.0); }
    }
    if (t >= okStart) {
      S.scr = "ok"; S.led = 0x22c55e; S.phone = rejected ? "ok2" : "ok";
      S.arm = 1 - seg(t, okStart + 0.3, okStart + 0.9);
      S.doors = seg(t, okStart + 0.1, okStart + 0.6) * (1 - seg(t, okStart + 3.2, okStart + 3.7));
      const k = seg(t, okStart + 0.8, okStart + 3.0);
      S.pos.lerpVectors(AT_VAL, INSIDE, k); S.walk = k > 0 && k < 1 ? 1 : 0;
    }
  }
  if (step >= 4) { S.pos.copy(INSIDE); S.scr = step === 4 ? "ok" : "idle"; S.led = step === 4 ? 0x22c55e : 0x3b82f6; S.phone = "ok"; }
  if (step === 4) { S.pkt = seg(t, 0.4, 3.6); S.servers = t > 3.4 ? 1 : 0; }
  if (step === 5) {
    const k = seg(t, 0.2, 2.6);
    S.pos.lerpVectors(INSIDE, AT_DOOR, k); S.walk = k > 0 && k < 1 ? 1 : 0;
    S.face = Math.atan2(AT_DOOR.x - INSIDE.x, AT_DOOR.z - INSIDE.z);
    S.busDoor = seg(t, 0, 0.8) * (1 - seg(t, 3.4, 4));
    S.show = t < 3.0; S.busX = BUS_STOP_X + Math.pow(clamp((t - 4.2) / 3.8), 2) * 70;
    S.servers = t > 4.4 ? 1 : 0; S.phone = t > 4.8 ? "transfer" : "ok";
  }
  if (step >= 6) {
    S.show = false; S.busX = 200; S.night = seg(t, 0, 2);
    S.minis = seg(t, 1.6, 3.6); S.big = seg(t, 3.8, 6.6); S.bankGlow = t > 6.4 ? 1 : 0; S.servers = t > 2 && t < 4 ? 1 : 0;
    S.phone = t > 6.8 ? "charge" : "night";
  }
  if (step === 0) { S.show = true; S.busX = BUS_STOP_X; }
  return S;
}

function apply(S, time) {
  person.visible = S.show;
  valLabel.visible = step !== 2 && step !== 3;
  person.position.x = S.pos.x; person.position.z = S.pos.z;
  person.rotation.y = S.face;
  posePerson(S.walk, S.arm, time);
  person.position.y += S.pos.y || 0;
  doorL.position.x = -0.4 - S.doors * 0.75; doorR.position.x = 0.4 + S.doors * 0.75;
  drawScreen(S.scr);
  ledMat.color.setHex(S.led); ledMat.emissive.setHex(S.led); ledLight.color.setHex(S.led);
  ledMat.emissiveIntensity = 1.2 + Math.sin(time * 6) * 0.3;
  rings.forEach((r, i) => {
    if (S.rings < 0) { r.material.opacity = 0; return; }
    const p = (S.rings + i / 3) % 1; r.scale.setScalar(1 + p * 2.5); r.material.opacity = (1 - p) * 0.8;
  });
  // paquete hacia la nube
  packet.visible = S.pkt > 0 && S.pkt < 1;
  if (packet.visible) { packet.position.copy(curveUp.getPoint(S.pkt)); packet.rotation.y = time * 3; }
  trail.forEach((m, i) => { const u = S.pkt - (i + 1) * 0.025; m.visible = packet.visible && u > 0; if (m.visible) m.position.copy(curveUp.getPoint(u)); });
  servers.forEach((s, i) => { s.material.emissiveIntensity = S.servers ? 1.5 + Math.sin(time * 14 + i) * 1.2 : 0.4; });
  // bus
  bus.position.set(S.busX, 0, BUS_Z);
  bus.children.forEach((c) => { if (c.userData.door) c.scale.x = 1 - S.busDoor * 0.85; });
  // noche
  scene.background.copy(DAY).lerp(NIGHT, S.night); scene.fog.color.copy(scene.background);
  hemi.intensity = lerp(1.1, 0.25, S.night); sun.intensity = lerp(2.2, 0.15, S.night);
  stars.material.opacity = S.night; lamps.forEach((l) => (l.intensity = S.night * 18));
  bankWin.forEach((w) => (w.material.emissiveIntensity = S.night * (0.8 + S.bankGlow * 1.6)));
  miniPackets.forEach((m, i) => {
    m.visible = S.minis > 0 && S.minis < 1;
    if (m.visible) { const a = (i / miniPackets.length) * Math.PI * 2 + time; const r = lerp(6, 0.3, S.minis); m.position.copy(CLOUD).add(new THREE.Vector3(Math.cos(a) * r, -1 + Math.sin(a * 2) * 0.6, Math.sin(a) * r)); }
  });
  bigPacket.visible = S.big > 0 && S.big < 1;
  if (bigPacket.visible) { bigPacket.position.copy(curveBank.getPoint(S.big)); bigPacket.rotation.y = time * 2; }
  setPhone(S.phone);
}

// ---------- interfaz ----------
const $ = (id) => document.getElementById(id);
let phoneState = "";
const PHONE = {
  home: ["Tus viajes", [["Hoy", "Aún no hay viajes"]]],
  pay: ["Pago sin contacto", [["Débito ···· 4821", "Listo para pagar"]]],
  declined: ["Medio rechazado", [["Crédito ···· 1109", "Reportado: usa otro medio"]], "warn"],
  switch: ["Pago sin contacto", [["Débito ···· 4821", "Intentando con otro medio"]]],
  ok: ["Tus viajes", [["6:42 a. m.", "Entrada · Estación Calle 26"]], "ok"],
  ok2: ["Tus viajes", [["6:42 a. m.", "Entrada · Estación Calle 26 (2.º intento)"]], "ok"],
  transfer: ["Tus viajes", [["6:42 a. m.", "Entrada · Estación Calle 26"], ["7:05 a. m.", "Transbordo aplicado automáticamente"]], "ok"],
  night: ["Tus viajes", [["6:42 a. m.", "Entrada · Estación Calle 26"], ["7:05 a. m.", "Transbordo aplicado"], ["11:59 p. m.", "Procesando cobro del día…"]]],
  charge: ["Resumen del día", [["Cobro único", "$3.550 · débito ···· 4821"], ["Viajes", "2 validaciones · 1 cobro"], ["Estado", "Aprobado por el banco"]], "ok"],
};
function setPhone(k) {
  if (k === phoneState) return; phoneState = k;
  const [title, rows, kind] = PHONE[k];
  $("phone-title").textContent = title;
  $("phone-body").innerHTML = rows.map(([a, b]) => `<div class="row ${kind || ""}"><b>${a}</b><span>${b}</span></div>`).join("");
  $("phone").classList.remove("pulse"); void $("phone").offsetWidth; $("phone").classList.add("pulse");
}

let step = 0, stepT = 0, playing = false, frozen = false;
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
function goto(i) {
  step = clamp(i, 0, steps.length - 1); stepT = 0; userMoved = false;
  const s = steps[step];
  $("kicker").textContent = s.kicker; $("title").textContent = s.title; $("text").textContent = s.text;
  $("facts").innerHTML = s.facts.map((f) => `<li>${f}</li>`).join("");
  document.querySelectorAll(".dot").forEach((d, k) => { d.classList.toggle("on", k === step); d.classList.toggle("done", k < step); });
  $("prev").disabled = step === 0; $("next").textContent = step === steps.length - 1 ? "Repetir ↺" : "Siguiente →";
  $("panel").classList.remove("in"); void $("panel").offsetWidth; $("panel").classList.add("in");
  $("reject-wrap").classList.toggle("hot", step === 3);
}
$("dots").innerHTML = steps.map((s, i) => `<button class="dot" data-i="${i}" title="${s.title}">${i === 0 ? "★" : i}</button>`).join("");
document.querySelectorAll(".dot").forEach((d) => d.addEventListener("click", () => goto(+d.dataset.i)));
$("prev").onclick = () => goto(step - 1);
$("next").onclick = () => goto(step === steps.length - 1 ? 0 : step + 1);
$("play").onclick = () => { playing = !playing; $("play").textContent = playing ? "❚❚ Pausa" : "▶ Auto"; if (playing && step === steps.length - 1) goto(0); };
$("replay").onclick = () => { stepT = 0; userMoved = false; };
$("reject").onchange = (e) => { rejected = e.target.checked; if (step === 3) stepT = 0; };
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); $("next").click(); }
  if (e.key === "ArrowLeft") $("prev").click();
});
$("start").onclick = () => { $("intro").classList.add("gone"); goto(1); };

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize); resize();

const clock = new THREE.Clock();
goto(0);
camPos.set(...steps[0].cam[0]); camTgt.set(...steps[0].cam[1]);
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
  if (!frozen) stepT += dt;
  const s = steps[step];
  if (playing && stepT > s.dur + (step === 3 && rejected ? 3 : 0) + 1.2) { if (step < steps.length - 1) goto(step + 1); else { playing = false; $("play").textContent = "▶ Auto"; } }
  apply(world(step, stepT), time);
  $("bar").style.width = `${clamp(stepT / (s.dur + (step === 3 && rejected ? 3 : 0))) * 100}%`;
  if (!userMoved) {
    const orbit = step === 0 ? time * 0.08 : 0;
    const p = new THREE.Vector3(...s.cam[0]);
    if (orbit) p.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit);
    if (step === 5 && stepT > 3.5) p.x += Math.min(14, (stepT - 3.5) * 3);
    const k = 1 - Math.pow(0.02, dt);
    camera.position.lerp(p, k); controls.target.lerp(new THREE.Vector3(...s.cam[1]), k);
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
window.__ot = { goto, seek(t) { stepT = t; frozen = true; const s = steps[step]; camera.position.set(...s.cam[0]); controls.target.set(...s.cam[1]); } };
