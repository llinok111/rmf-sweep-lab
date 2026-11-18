// rmf-sweep-lab core: pure geometry, no three.js / DOM / I/O.
// Curve evaluation, rotation-minimizing frames (double reflection),
// Frenet baseline, swept tube mesh generation and audit.

const TAU = Math.PI * 2;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => {
  const l = len(a);
  if (!(l > 0)) return [0, 0, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
};
const angleDeg = (a, b) => {
  const c = Math.max(-1, Math.min(1, dot(norm(a), norm(b))));
  return (Math.acos(c) * 180) / Math.PI;
};

// Analytic curves: p(u) and dp/du. All u domains are explicit in the def.
export function curvePoint(def, u) {
  const p = def.params;
  switch (def.kind) {
    case "arc":
      return [p.R * Math.cos(u), p.R * Math.sin(u), 0];
    case "helix":
      return [p.r * Math.cos(u), p.r * Math.sin(u), p.c * u];
    case "wave":
      return [u, p.A * Math.sin(p.k * u), 0];
    case "saddle":
      return [u, p.A * Math.sin(p.k * u), p.B * Math.sin(p.k * u + p.phi)];
    default:
      throw new Error(`unknown curve kind ${def.kind}`);
  }
}

export function curveDeriv(def, u) {
  const p = def.params;
  switch (def.kind) {
    case "arc":
      return [-p.R * Math.sin(u), p.R * Math.cos(u), 0];
    case "helix":
      return [-p.r * Math.sin(u), p.r * Math.cos(u), p.c];
    case "wave":
      return [1, p.A * p.k * Math.cos(p.k * u), 0];
    case "saddle":
      return [1, p.A * p.k * Math.cos(p.k * u), p.B * p.k * Math.cos(p.k * u + p.phi)];
    default:
      throw new Error(`unknown curve kind ${def.kind}`);
  }
}

export function curveDomain(def) {
  switch (def.kind) {
    case "arc":
      return [0, def.params.theta];
    case "helix":
      return [0, TAU * def.params.turns];
    case "wave":
    case "saddle":
      return [0, def.params.span];
    default:
      throw new Error(`unknown curve kind ${def.kind}`);
  }
}

// rings = number of ring positions. Samples rings points, evenly in u.
export function sampleCurve(def, rings) {
  if (!Number.isInteger(rings) || rings < 4) throw new Error("rings must be >= 4");
  const [u0, u1] = curveDomain(def);
  const points = [];
  const tangents = [];
  const params = [];
  for (let i = 0; i < rings; i++) {
    const u = u0 + ((u1 - u0) * i) / (rings - 1);
    const d = curveDeriv(def, u);
    points.push(curvePoint(def, u));
    tangents.push(norm(d));
    params.push(u);
  }
  return { points, tangents, params, sourceDef: def };
}

// Frenet frames from the analytic second derivative, evaluated by central
// differences of the analytic derivative. At an exact inflection the normal is
// undefined; the previous normal is carried and the sample is counted.
export function frenetFrames(samples) {
  const n = samples.points.length;
  const N = new Array(n);
  const B = new Array(n);
  const T = samples.tangents;
  let degenerate = 0;
  let flips = 0;
  let maxStep = 0;
  for (let i = 0; i < n; i++) {
    const u = samples.params[i];
    const h = 1e-6 * Math.max(1, Math.abs(u));
    const a = curveDeriv(samples.sourceDef, u - h);
    const b = curveDeriv(samples.sourceDef, u + h);
    const dd = mul(sub(b, a), 1 / (2 * h));
    let cand = sub(dd, mul(T[i], dot(dd, T[i])));
    if (len(cand) < 1e-9 * Math.max(1, len(dd))) {
      degenerate++;
      N[i] = i > 0 ? N[i - 1] : norm(sub([0, 0, 1], mul(T[i], T[i][2])));
    } else {
      N[i] = norm(cand);
    }
    B[i] = norm(cross(T[i], N[i]));
    if (i > 0) {
      const step = angleDeg(N[i], N[i - 1]);
      maxStep = Math.max(maxStep, step);
      if (step > 90) flips++;
    }
  }
  return { normals: N, binormals: B, flips, maxStepDeg: maxStep, degenerate };
}

// Double-reflection RMF transport (Wang et al. 2008). Unit reflection vectors
// make the transport exactly scale-free (no absolute epsilon).
export function rmfFrames(samples, initialNormal) {
  const n = samples.points.length;
  const T = samples.tangents;
  const N = new Array(n);
  const B = new Array(n);
  if (initialNormal) {
    N[0] = norm(sub(initialNormal, mul(T[0], dot(initialNormal, T[0]))));
  } else {
    const axis = Math.abs(T[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    N[0] = norm(sub(axis, mul(T[0], dot(axis, T[0]))));
  }
  B[0] = norm(cross(T[0], N[0]));
  let maxStep = 0;
  let flips = 0;
  let carried = 0;
  for (let i = 1; i < n; i++) {
    const v1 = norm(sub(samples.points[i], samples.points[i - 1]));
    if (!(len(v1) > 0)) {
      N[i] = N[i - 1];
      B[i] = B[i - 1];
      carried++;
      continue;
    }
    const rL = sub(N[i - 1], mul(v1, 2 * dot(v1, N[i - 1])));
    const tL = sub(T[i - 1], mul(v1, 2 * dot(v1, T[i - 1])));
    const v2 = norm(sub(T[i], tL));
    if (!(len(v2) > 0)) {
      N[i] = norm(sub(rL, mul(T[i], dot(rL, T[i]))));
      carried++;
    } else {
      N[i] = sub(rL, mul(v2, 2 * dot(v2, rL)));
    }
    N[i] = norm(sub(N[i], mul(T[i], dot(N[i], T[i]))));
    B[i] = norm(cross(T[i], N[i]));
    const a = angleDeg(N[i], N[i - 1]);
    maxStep = Math.max(maxStep, a);
    if (a > 90) flips++;
  }
  let orthoErr = 0;
  for (let i = 0; i < n; i++) {
    orthoErr = Math.max(
      orthoErr,
      Math.abs(len(N[i]) - 1),
      Math.abs(len(B[i]) - 1),
      Math.abs(dot(N[i], B[i])),
      Math.abs(dot(N[i], T[i])),
      Math.abs(dot(B[i], T[i]))
    );
  }
  return { normals: N, binormals: B, flips, maxStepDeg: maxStep, orthoErr, carried };
}

// Swept tube with flat polygonal cross-section and two cap fans.
export function sweepMesh(samples, frames, radius, segments) {
  if (!Number.isInteger(segments) || segments < 3) throw new Error("segments must be >= 3");
  const rings = samples.points.length;
  const positions = [];
  const indices = [];
  for (let i = 0; i < rings; i++) {
    const P = samples.points[i];
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j < segments; j++) {
      const th = (TAU * j) / segments;
      const c = Math.cos(th);
      const s = Math.sin(th);
      positions.push(
        P[0] + radius * (c * N[0] + s * B[0]),
        P[1] + radius * (c * N[1] + s * B[1]),
        P[2] + radius * (c * N[2] + s * B[2])
      );
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments;
      const a = i * segments + j;
      const b = (i + 1) * segments + j;
      const c = (i + 1) * segments + j1;
      const d = i * segments + j1;
      indices.push(a, d, c, a, c, b);
    }
  }
  const startCenter = positions.length / 3;
  positions.push(samples.points[0][0], samples.points[0][1], samples.points[0][2]);
  const endCenter = positions.length / 3;
  positions.push(
    samples.points[rings - 1][0],
    samples.points[rings - 1][1],
    samples.points[rings - 1][2]
  );
  for (let j = 0; j < segments; j++) {
    const j1 = (j + 1) % segments;
    indices.push(startCenter, j1, j);
    const base = (rings - 1) * segments;
    indices.push(endCenter, base + j, base + j1);
  }
  // Fix global winding from signed volume so normals point outward.
  let signed = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    signed +=
      positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) -
      positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c]) +
      positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  if (signed < 0) {
    for (let t = 0; t < indices.length; t += 3) {
      const tmp = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = tmp;
    }
  }
  return { positions, indices, rings, segments, radius };
}

export function meshVolume(mesh) {
  const p = mesh.positions;
  let v = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t] * 3, b = mesh.indices[t + 1] * 3, c = mesh.indices[t + 2] * 3;
    v +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return Math.abs(v) / 6;
}

export function meshArea(mesh) {
  const p = mesh.positions;
  let area = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t] * 3, b = mesh.indices[t + 1] * 3, c = mesh.indices[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    area += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  }
  return area;
}

export function auditMesh(mesh) {
  const edgeCount = new Map();
  const dirs = new Map();
  const idx = mesh.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      if (!dirs.has(key)) dirs.set(key, new Set());
      dirs.get(key).add(a < b ? 1 : -1);
    }
  }
  let boundary = 0, nonManifold = 0, consistent = true;
  for (const [key, count] of edgeCount) {
    if (count === 1) boundary++;
    else if (count > 2) nonManifold++;
    const d = dirs.get(key);
    if (!(d.has(1) && d.has(-1))) consistent = false;
    void key;
  }
  return {
    vertices: mesh.positions.length / 3,
    triangles: idx.length / 3,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    orientationConsistent: consistent,
    watertight: boundary === 0 && nonManifold === 0 && consistent,
  };
}

// Exact Pappus values for a circular arc swept with a regular S-gon
// cross-section of circumradius a. Entirely independent of the mesh.
export function arcAnalytic(def, segments) {
  const R = def.params.R;
  const theta = def.params.theta;
  const a = def.radius;
  const polyArea = 0.5 * segments * a * a * Math.sin(TAU / segments);
  const polyPerimeter = 2 * segments * a * Math.sin(Math.PI / segments);
  return {
    polygonArea: polyArea,
    volumePolygon: polyArea * R * theta,
    volumeContinuous: Math.PI * a * a * R * theta,
    areaPolygon: polyPerimeter * R * theta + 2 * polyArea,
    areaContinuous: TAU * a * R * theta + 2 * Math.PI * a * a,
  };
}

export function evaluate(def, opts = {}) {
  const rings = opts.rings || 256;
  const segments = opts.segments || 32;
  const mode = opts.mode || "rmf";
  const samples = sampleCurve(def, rings);
  samples.sourceDef = def;
  const frames =
    mode === "frenet"
      ? frenetFrames(samples)
      : rmfFrames(samples, opts.initialNormal);
  const mesh = sweepMesh(samples, frames, def.radius, segments);
  const audit = auditMesh(mesh);
  const volume = meshVolume(mesh);
  const area = meshArea(mesh);
  return {
    id: def.id,
    mode,
    rings,
    segments,
    flips: frames.flips,
    maxStepDeg: frames.maxStepDeg,
    orthoErr: frames.orthoErr ?? null,
    degenerate: frames.degenerate ?? 0,
    audit,
    volume,
    area,
    mesh,
    samples,
    frames,
  };
}

const quant = (x) => Math.round(x * 1e9);

export function fingerprintMesh(mesh) {
  let h = 2166136261 >>> 0;
  const vals = mesh.positions.concat(mesh.indices);
  for (let i = 0; i < vals.length; i++) {
    h ^= quant(vals[i]) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function fingerprintResult(result) {
  return `${fingerprintMesh(result.mesh)}-${result.rings}-${result.segments}-${result.mode}`;
}