// Deterministic sample generator: curve definitions plus node-baked fingerprints
// for the browser to recompute with the same core.
import { writeFileSync, mkdirSync } from "node:fs";
import { evaluate, arcAnalytic, fingerprintResult } from "../src/core.mjs";

const PI = Math.PI;
const curves = [
  { id: "arc90", kind: "arc", params: { R: 1.2, theta: PI / 2 }, radius: 0.18 },
  { id: "arc180", kind: "arc", params: { R: 2.0, theta: PI }, radius: 0.25 },
  { id: "arc270", kind: "arc", params: { R: 3.0, theta: (3 * PI) / 2 }, radius: 0.4 },
  { id: "helix-tight", kind: "helix", params: { r: 1.5, c: 0.12, turns: 1.5 }, radius: 0.12 },
  { id: "helix-loose", kind: "helix", params: { r: 1.0, c: 0.3, turns: 2 }, radius: 0.1 },
  { id: "helix-wide", kind: "helix", params: { r: 2.2, c: 0.05, turns: 1 }, radius: 0.2 },
  { id: "wave-low", kind: "wave", params: { A: 0.35, k: 2.2, span: 4 }, radius: 0.07 },
  { id: "wave-mid", kind: "wave", params: { A: 0.6, k: 1.6, span: 5 }, radius: 0.09 },
  { id: "wave-high", kind: "wave", params: { A: 0.25, k: 3.0, span: 3 }, radius: 0.05 },
  { id: "saddle-1", kind: "saddle", params: { A: 0.4, B: 0.15, k: 1.8, span: 4, phi: 0.5 }, radius: 0.08 },
  { id: "saddle-2", kind: "saddle", params: { A: 0.25, B: 0.3, k: 2.4, span: 3.5, phi: 1.2 }, radius: 0.06 },
  { id: "saddle-3", kind: "saddle", params: { A: 0.5, B: 0.1, k: 1.2, span: 5, phi: 2.0 }, radius: 0.1 },
];

const rings = 256;
const segments = 32;
const baked = {};
for (const mode of ["rmf", "frenet"]) {
  baked[mode] = {};
  for (const def of curves) {
    const r = evaluate(def, { rings, segments, mode });
    baked[mode][def.id] = {
      fingerprint: fingerprintResult(r),
      flips: r.flips,
      maxStepDeg: Number(r.maxStepDeg.toFixed(6)),
      orthoErr: r.orthoErr === null ? null : Number(r.orthoErr.toExponential(3)),
      watertight: r.audit.watertight,
      volume: Number(r.volume.toPrecision(12)),
      area: Number(r.area.toPrecision(12)),
    };
  }
}

const analytic = {};
for (const def of curves) {
  if (def.kind === "arc") {
    const a = arcAnalytic(def, segments);
    analytic[def.id] = {
      volumePolygon: Number(a.volumePolygon.toPrecision(12)),
      volumeContinuous: Number(a.volumeContinuous.toPrecision(12)),
    };
  }
}

mkdirSync("data", { recursive: true });
const doc = {
  generatedBy: "tools/gen-sample.mjs",
  rings,
  segments,
  curves,
  baked,
  analytic,
};
writeFileSync("data/curves.json", JSON.stringify(doc, null, 2) + "\n");

for (const def of curves) {
  const rmf = baked.rmf[def.id];
  const fre = baked.frenet[def.id];
  console.log(
    `${def.id.padEnd(12)} rmf[${
      rmf.watertight ? "wt" : "OPEN"
    } flips=${rmf.flips} step=${rmf.maxStepDeg.toFixed(2)}] frenet[flips=${fre.flips} step=${fre.maxStepDeg.toFixed(2)}]`
  );
}