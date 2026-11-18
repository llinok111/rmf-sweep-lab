// Baseline: the textbook Frenet-frame sweep. It is the control for the flip
// count, not a strawman: same sampling, same sweepMesh, same audit as the RMF
// path — only the frame transport differs. Run: node baseline/frenet.mjs
import { readFileSync } from "node:fs";
import { evaluate } from "../src/core.mjs";

const doc = JSON.parse(readFileSync(new URL("../data/curves.json", import.meta.url), "utf8"));
const out = doc.curves.map((d) => evaluate(d, { rings: doc.rings, segments: doc.segments, mode: "frenet" }));
console.log(JSON.stringify({
  mode: "frenet",
  totalFlips: out.reduce((s, r) => s + r.flips, 0),
  maxStepDeg: Math.max(...out.map((r) => r.maxStepDeg)),
  watertight: out.filter((r) => r.audit.watertight).length,
  curves: out.map((r) => ({ id: r.id, flips: r.flips, maxStepDeg: r.maxStepDeg })),
}, null, 2));
