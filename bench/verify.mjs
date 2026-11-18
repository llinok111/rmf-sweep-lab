// Assertions over the generated corpus. Every printed number is measured.
import { readFileSync } from "node:fs";
import {
  evaluate, arcAnalytic, fingerprintResult,
} from "../src/core.mjs";

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS ${name}: ${detail}`); }
  else { fail++; console.log(`FAIL ${name}: ${detail}`); }
}

const doc = JSON.parse(readFileSync("data/curves.json", "utf8"));
check("corpus", doc.curves.length === 12 && doc.baked.rmf && doc.baked.frenet,
  `${doc.curves.length} curves, ${Object.keys(doc.baked.rmf).length} RMF + ${Object.keys(doc.baked.frenet).length} Frenet baked fingerprints`);

const curves = doc.curves;
const opts = { rings: doc.rings, segments: doc.segments };

// Independent edge audit: sort each edge's endpoints, count occurrences and
// directions, without reusing auditMesh.
function edgeAudit(mesh) {
  const edges = new Map();
  const ix = mesh.indices;
  for (let t = 0; t < ix.length; t += 3) {
    const tri = [ix[t], ix[t + 1], ix[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const key = lo * 1e7 + hi;
      if (!edges.has(key)) edges.set(key, { count: 0, fwd: 0, rev: 0 });
      const rec = edges.get(key);
      rec.count++;
      if (a === lo) rec.fwd++; else rec.rev++;
    }
  }
  let boundary = 0, nonManifold = 0, orient = 0;
  for (const rec of edges.values()) {
    if (rec.count === 1) boundary++;
    if (rec.count > 2) nonManifold++;
    if (!(rec.fwd && rec.rev)) orient++;
  }
  return { boundary, nonManifold, orient, edges: edges.size };
}

// 1. baked fingerprints must match a fresh node recomputation (the browser
// recomputes the very same values with the same core module).
let fpOk = 0;
for (const mode of ["rmf", "frenet"]) {
  for (const def of curves) {
    const r = evaluate(def, { ...opts, mode });
    const fp = fingerprintResult(r);
    if (fp === doc.baked[mode][def.id].fingerprint) fpOk++;
  }
}
check("baked-fingerprints", fpOk === 24, `${fpOk}/24 match fresh node recomputation`);

const rmf = curves.map((d) => evaluate(d, { ...opts, mode: "rmf" }));
const frenet = curves.map((d) => evaluate(d, { ...opts, mode: "frenet" }));

// 2. RMF: no flips, no open edges, frames orthonormal.
const rmfFlips = rmf.reduce((s, r) => s + r.flips, 0);
const rmfMaxStep = Math.max(...rmf.map((r) => r.maxStepDeg));
const rmfOrtho = Math.max(...rmf.map((r) => r.orthoErr));
check("rmf-no-flips", rmfFlips === 0, `${rmfFlips} normal flips over 12 curves`);
check("rmf-max-step", rmfMaxStep < 3, `max frame step ${rmfMaxStep.toFixed(4)} deg (threshold 3)`);
check("rmf-orthonormal", rmfOrtho < 1e-12, `max |dot|/length error ${rmfOrtho.toExponential(3)}`);

let wt = 0, boundary = 0, nonManifold = 0, orient = 0;
for (const r of rmf) {
  const a = edgeAudit(r.mesh);
  if (r.audit.watertight && a.boundary === 0 && a.nonManifold === 0 && a.orient === 0) wt++;
  boundary += a.boundary; nonManifold += a.nonManifold; orient += a.orient;
}
check("watertight", wt === 12, `${wt}/12 watertight; independent edge audit boundary=${boundary} nonmanifold=${nonManifold} orientation-bad=${orient}`);

// 3. Frenet baseline really flips on inflected planar curves.
const frenetBad = frenet.filter((r) => r.flips > 0).map((r) => r.id);
const frenetFlips = frenet.reduce((s, r) => s + r.flips, 0);
const frenetMaxStep = Math.max(...frenet.map((r) => r.maxStepDeg));
check("frenet-flips", frenetFlips === 6 && frenetBad.length === 3 &&
  [...frenetBad].sort().join(",") === "wave-high,wave-low,wave-mid",
  `Frenet flips ${frenetFlips} on [${frenetBad.join(",")}], max step ${frenetMaxStep.toFixed(2)} deg`);
check("frenet-vs-rmf", rmfFlips === 0 && frenetFlips > 0,
  `RMF ${rmfFlips} flips vs Frenet ${frenetFlips} flips on the same 12 curves`);

// 4. Arc volumes/areas against the Pappus oracle (independent closed form).
let maxVolErr = 0, maxAreaErr = 0, arcs = 0;
for (let i = 0; i < curves.length; i++) {
  if (curves[i].kind !== "arc") continue;
  arcs++;
  const a = arcAnalytic(curves[i], doc.segments);
  const volErr = Math.abs(rmf[i].volume - a.volumePolygon) / a.volumePolygon;
  const areaErr = Math.abs(rmf[i].area - a.areaPolygon) / a.areaPolygon;
  maxVolErr = Math.max(maxVolErr, volErr);
  maxAreaErr = Math.max(maxAreaErr, areaErr);
}
check("arc-count", arcs === 3, `${arcs}/3 analytic arc curves`);
check("volume-vs-pappus", maxVolErr < 1e-4, `max relative error ${maxVolErr.toExponential(3)} (threshold 1e-4)`);
check("area-vs-pappus", maxAreaErr < 1e-4, `max relative error ${maxAreaErr.toExponential(3)} (threshold 1e-4)`);

// 5. Convergence: doubling ring count must quarter the volume error.
const arc180 = curves.find((c) => c.id === "arc180");
const ana = arcAnalytic(arc180, doc.segments);
const errs = [];
for (const rings of [50, 100, 200, 400, 800]) {
  const r = evaluate(arc180, { rings, segments: doc.segments, mode: "rmf" });
  errs.push({ rings, err: Math.abs(r.volume - ana.volumePolygon) / ana.volumePolygon });
}
const ratios = errs.slice(1).map((e, i) => errs[i].err / e.err);
check("convergence", ratios.every((x) => x > 3.5 && x < 4.5),
  `ratios ${ratios.map((x) => x.toFixed(3)).join(", ")} at rings ${errs.map((e) => e.rings).join("/")} (theory 4)`);

// 6. Scale invariance: same conclusion at 1e-3 .. 1e6, thresholds all relative.
let scaleOk = 0;
const scaleNotes = [];
const normVolumes = [];
for (const s of [1e-3, 1, 1e3, 1e6]) {
  const def = {
    ...arc180,
    params: { R: arc180.params.R * s, theta: arc180.params.theta },
    radius: arc180.radius * s,
  };
  const r = evaluate(def, { ...opts, mode: "rmf" });
  const a = arcAnalytic(def, doc.segments);
  const baseVolume = ana.volumePolygon * 1.0; // scale-1 mesh volume measured below
  const rel = Math.abs(r.volume / (s * s * s) - baseVolume) / baseVolume;
  const ok = r.audit.watertight && r.flips === 0 &&
    Math.abs(r.volume - a.volumePolygon) / a.volumePolygon < 1e-4 && rel < 1e-4;
  if (ok) scaleOk++;
  normVolumes.push(r.volume / (s * s * s));
  scaleNotes.push(`s=${s}: volrel=${(Math.abs(r.volume - a.volumePolygon) / a.volumePolygon).toExponential(2)}`);
}
const spread = (Math.max(...normVolumes) - Math.min(...normVolumes)) / normVolumes[1];
check("scale-invariance", scaleOk === 4 && spread < 1e-9, `${scaleOk}/4 scales [1e-3,1,1e3,1e6] watertight+flip-free, normalized-volume spread ${spread.toExponential(2)}; ${scaleNotes.join(" ")}`);

// 7. Determinism: two evaluations of every curve give the same fingerprint.
let det = 0;
for (const d of curves) {
  const a = evaluate(d, { ...opts, mode: "rmf" });
  const b = evaluate(d, { ...opts, mode: "rmf" });
  if (fingerprintResult(a) === fingerprintResult(b)) det++;
}
check("determinism", det === 12, `${det}/12 identical mesh fingerprints on repeat evaluation`);

// 8. Topology counts match the documented construction exactly.
let topo = 0;
for (const r of rmf) {
  const verts = r.mesh.positions.length / 3;
  const tris = r.mesh.indices.length / 3;
  if (verts === r.rings * r.segments + 2 && tris === (r.rings - 1) * r.segments * 2 + r.segments * 2) topo++;
}
check("topology-counts", topo === 12, `${topo}/12 meshes match rings*segments+2 vertices and 2*(rings-1)*segments+2*segments triangles`);

// 9. No non-finite coordinates anywhere.
let finite = 0;
for (const r of rmf) if (r.mesh.positions.every(Number.isFinite)) finite++;
check("finite-coordinates", finite === 12, `${finite}/12 meshes have only finite coordinates`);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`summary rmfFlips=${rmfFlips} frenetFlips=${frenetFlips} maxStep=${rmfMaxStep.toFixed(4)} maxVolErr=${maxVolErr.toExponential(3)} maxAreaErr=${maxAreaErr.toExponential(3)}`);
process.exit(fail === 0 ? 0 : 1);