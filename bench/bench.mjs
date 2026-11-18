// Timing + evidence writer. Warmup once, then >=5 measured runs.
import { readFileSync, writeFileSync } from "node:fs";
import { evaluate, arcAnalytic, fingerprintResult } from "../src/core.mjs";

const doc = JSON.parse(readFileSync("data/curves.json", "utf8"));
const opts = { rings: doc.rings, segments: doc.segments };

function stats(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varSum = xs.reduce((a, b) => a + (b - mean) ** 2, 0);
  const stddev = Math.sqrt(varSum / xs.length);
  return {
    min: Math.min(...xs),
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    max: Math.max(...xs),
    mean,
    stddev,
    rsdPct: (stddev / mean) * 100,
  };
}

function runAll(mode) {
  const t0 = performance.now();
  const results = doc.curves.map((d) => evaluate(d, { ...opts, mode }));
  const ms = performance.now() - t0;
  return { ms, results };
}

// Cold start: the very first call includes module/JIT warmup.
const cold = runAll("rmf");
runAll("rmf"); // warmup
runAll("frenet"); // warmup

const samples = 7;
const rmfTimes = [];
const frenetTimes = [];
for (let i = 0; i < samples; i++) {
  rmfTimes.push(runAll("rmf").ms);
  frenetTimes.push(runAll("frenet").ms);
}

const rmf = cold.results;
const frenet = doc.curves.map((d) => evaluate(d, { ...opts, mode: "frenet" }));
const arcChecks = [];
for (let i = 0; i < doc.curves.length; i++) {
  const d = doc.curves[i];
  if (d.kind !== "arc") continue;
  const a = arcAnalytic(d, doc.segments);
  arcChecks.push({
    id: d.id,
    volumeRelativeError: Math.abs(rmf[i].volume - a.volumePolygon) / a.volumePolygon,
    areaRelativeError: Math.abs(rmf[i].area - a.areaPolygon) / a.areaPolygon,
    volume: rmf[i].volume,
    analyticVolume: a.volumePolygon,
  });
}

const result = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  corpus: {
    curves: doc.curves.length,
    rings: doc.rings,
    segments: doc.segments,
    trianglesPerMesh: (doc.rings - 1) * doc.segments * 2 + doc.segments * 2,
    totalTriangles: rmf.reduce((s, r) => s + r.audit.triangles, 0),
  },
  implementation: {
    rmf: {
      flips: rmf.reduce((s, r) => s + r.flips, 0),
      maxStepDeg: Math.max(...rmf.map((r) => r.maxStepDeg)),
      maxOrthoErr: Math.max(...rmf.map((r) => r.orthoErr)),
      watertight: rmf.filter((r) => r.audit.watertight).length,
      boundaryEdges: rmf.reduce((s, r) => s + r.audit.boundaryEdges, 0),
      nonManifoldEdges: rmf.reduce((s, r) => s + r.audit.nonManifoldEdges, 0),
    },
    frenetBaseline: {
      flips: frenet.reduce((s, r) => s + r.flips, 0),
      maxStepDeg: Math.max(...frenet.map((r) => r.maxStepDeg)),
      curvedCurvesWithFlips: frenet.filter((r) => r.flips > 0).map((r) => r.id),
      watertight: frenet.filter((r) => r.audit.watertight).length,
    },
  },
  analytic: {
    arcs: arcChecks,
    maxVolumeRelativeError: Math.max(...arcChecks.map((x) => x.volumeRelativeError)),
    maxAreaRelativeError: Math.max(...arcChecks.map((x) => x.areaRelativeError)),
  },
  timing: {
    coldStartMs: cold.ms,
    samples,
    unit: "12 curves (rings=256, segments=32) per run",
    rmf: stats(rmfTimes),
    frenet: stats(frenetTimes),
    perMeshMedianMs: stats(rmfTimes).median / doc.curves.length,
  },
  fingerprints: {
    rmf: rmf.map((r) => fingerprintResult(r)),
    frenet: frenet.map((r) => fingerprintResult(r)),
  },
};

writeFileSync("bench/result.json", JSON.stringify(result, null, 2) + "\n");

console.log(`cold ${cold.ms.toFixed(3)} ms`);
console.log(`rmf    median ${result.timing.rmf.median.toFixed(3)} ms  p95 ${result.timing.rmf.p95.toFixed(3)}  rsd ${result.timing.rmf.rsdPct.toFixed(2)}%`);
console.log(`frenet median ${result.timing.frenet.median.toFixed(3)} ms  p95 ${result.timing.frenet.p95.toFixed(3)}  rsd ${result.timing.frenet.rsdPct.toFixed(2)}%`);
console.log(`flips rmf=${result.implementation.rmf.flips} frenet=${result.implementation.frenetBaseline.flips} watertight ${result.implementation.rmf.watertight}/12`);
console.log(`max volume rel err ${result.analytic.maxVolumeRelativeError.toExponential(3)}, max area rel err ${result.analytic.maxAreaRelativeError.toExponential(3)}`);
console.log("wrote bench/result.json");