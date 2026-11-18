import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { evaluate, arcAnalytic, fingerprintResult } from "./src/core.mjs";

const app = document.getElementById("app");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
scene.fog = new THREE.Fog(0x0d1117, 18, 40);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 200);
camera.position.set(0, 0.5, 16);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1b2430, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(6, 10, 8);
scene.add(key);
const rim = new THREE.DirectionalLight(0x58a6ff, 1.2);
rim.position.set(-8, -4, -6);
scene.add(rim);

const grid = new THREE.GridHelper(26, 26, 0x30363d, 0x1b2129);
grid.position.y = -7.2;
scene.add(grid);

const doc = await fetch("./data/curves.json").then((r) => r.json());
const state = { mode: "rmf", rings: doc.rings, segments: doc.segments, selected: 0 };
const meshes = [];
const group = new THREE.Group();
scene.add(group);

const select = document.getElementById("curve");
for (const c of doc.curves) {
  const o = document.createElement("option");
  o.value = c.id;
  o.textContent = c.id;
  select.appendChild(o);
}

function slotPosition(index) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { x: (col - 1) * 4.4, y: (1 - row) * 4.4 };
}

function disposeAll() {
  for (const m of meshes) {
    group.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
  meshes.length = 0;
}

function build() {
  disposeAll();
  doc.curves.forEach((def, i) => {
    const res = evaluate(def, { rings: state.rings, segments: state.segments, mode: state.mode });
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(res.mesh.positions);
    // centre each tube in its grid cell
    let cx = 0, cy = 0, cz = 0;
    for (let v = 0; v < pos.length; v += 3) { cx += pos[v]; cy += pos[v + 1]; cz += pos[v + 2]; }
    const n = pos.length / 3;
    cx /= n; cy /= n; cz /= n;
    const s = slotPosition(i);
    for (let v = 0; v < pos.length; v += 3) {
      pos[v] += s.x - cx; pos[v + 1] += s.y - cy; pos[v + 2] -= cz;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(res.mesh.indices), 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: res.flips > 0 ? 0xf85149 : 0x58a6ff,
      roughness: 0.38,
      metalness: 0.15,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { index: i, res };
    group.add(mesh);
    meshes.push(mesh);
  });
  highlight(state.selected);
  renderMetrics();
}

function highlight(i) {
  state.selected = i;
  select.value = doc.curves[i].id;
  meshes.forEach((m, k) => {
    m.material.emissive.setHex(k === i ? 0x1f3a5f : 0x000000);
    m.material.emissiveIntensity = k === i ? 1 : 0;
  });
}

function renderMetrics() {
  const res = meshes[state.selected].userData.res;
  const def = doc.curves[state.selected];
  const bakedFp = doc.baked[state.mode][def.id].fingerprint;
  const fp = fingerprintResult(res);
  const lines = [
    `curve        ${def.id}`,
    `mode         ${state.mode.toUpperCase()}`,
    `watertight   ${res.audit.watertight ? "TRUE" : "FALSE"}  (boundary ${res.audit.boundaryEdges}, non-manifold ${res.audit.nonManifoldEdges})`,
    `frame flips  ${res.flips}   max step ${res.maxStepDeg.toFixed(2)}°`,
    `vertices     ${res.audit.vertices}   triangles ${res.audit.triangles}`,
    `volume       ${res.volume.toFixed(9)}`,
    `fingerprint  ${fp}  ${fp === bakedFp ? "= node bake" : "!= node bake (stale data)"}`,
  ];
  if (def.kind === "arc") {
    const a = arcAnalytic(def, state.segments);
    const err = Math.abs(res.volume - a.volumePolygon) / a.volumePolygon;
    lines.push(`Pappus err   ${err.toExponential(3)}`);
  }
  if (state.mode === "frenet" && res.flips > 0) {
    lines.push("baseline     Frenet normal flips at inflections");
  }
  document.getElementById("metrics").textContent = lines.join("\n");
}

select.addEventListener("change", () => highlight(Number(select.selectedIndex)));

document.getElementById("m-rmf").addEventListener("click", () => setMode("rmf"));
document.getElementById("m-frenet").addEventListener("click", () => setMode("frenet"));
function setMode(mode) {
  state.mode = mode;
  document.getElementById("m-rmf").classList.toggle("on", mode === "rmf");
  document.getElementById("m-frenet").classList.toggle("on", mode === "frenet");
  build();
}

const rings = document.getElementById("rings");
const segs = document.getElementById("seg");
rings.addEventListener("input", () => {
  state.rings = Number(rings.value);
  document.getElementById("rings-v").textContent = rings.value;
  build();
});
segs.addEventListener("input", () => {
  state.segments = Number(segs.value);
  document.getElementById("seg-v").textContent = segs.value;
  build();
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

build();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});