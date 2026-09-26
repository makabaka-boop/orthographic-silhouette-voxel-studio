// 三向正交投影 → 最少体素重建的核心逻辑（纯函数，无 DOM 依赖，可同时供页面与测试使用）。
//
// 约定：
// - 体素坐标 (x, y, z)，范围 0..nx-1 / 0..ny-1 / 0..nz-1，z 轴向上。
// - XY 投影 xy[y][x]：沿 z 轴看，格 (x, y) 为 1 表示该 (x,y) 列至少有一个体素。
// - XZ 投影 xz[z][x]：沿 y 轴看；YZ 投影 yz[z][y]：沿 x 轴看。
// - 体素 (x,y,z) 可占用（成为候选）的必要条件：xy[y][x] && xz[z][x] && yz[z][y]。
// - 可行解：候选体素的子集，且每个为 1 的投影格至少被一个选中体素覆盖。
//   （候选体素的三格投影必为 1，所以可行解的三向投影恰好等于输入。）
// - 目标：占用体素数最少；并列时取「按 (x,y,z) 排序后的体素列表」字典序最小者。

export interface Dims {
  nx: number;
  ny: number;
  nz: number;
}

export type Plane = 'xy' | 'xz' | 'yz';

export interface Projections {
  /** xy[y][x]，沿 z 轴投影 */
  xy: boolean[][];
  /** xz[z][x]，沿 y 轴投影 */
  xz: boolean[][];
  /** yz[z][y]，沿 x 轴投影 */
  yz: boolean[][];
}

export interface Voxel {
  x: number;
  y: number;
  z: number;
}

export interface UnsupportedCell {
  plane: Plane;
  row: number;
  col: number;
}

export type SolveResult =
  | { ok: true; voxels: Voxel[]; count: number }
  | { ok: false; cell: UnsupportedCell };

/** 全 0 投影 */
export function emptyProjections(d: Dims): Projections {
  const mat = (rows: number, cols: number) =>
    Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  return { xy: mat(d.ny, d.nx), xz: mat(d.nz, d.nx), yz: mat(d.nz, d.ny) };
}

/** 全 1 投影 */
export function fullProjections(d: Dims): Projections {
  const p = emptyProjections(d);
  for (const plane of ['xy', 'xz', 'yz'] as Plane[]) {
    for (const row of p[plane]) row.fill(true);
  }
  return p;
}

/** 维度变化时保留重叠区域的投影内容 */
export function resizeProjections(p: Projections, d: Dims): Projections {
  const fit = (src: boolean[][], rows: number, cols: number) =>
    Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => Boolean(src[r]?.[c])),
    );
  return { xy: fit(p.xy, d.ny, d.nx), xz: fit(p.xz, d.nz, d.nx), yz: fit(p.yz, d.nz, d.ny) };
}

export function projectionsEqual(a: Projections, b: Projections): boolean {
  const eq = (m1: boolean[][], m2: boolean[][]) =>
    m1.length === m2.length &&
    m1.every((row, r) => row.length === m2[r].length && row.every((v, c) => v === m2[r][c]));
  return eq(a.xy, b.xy) && eq(a.xz, b.xz) && eq(a.yz, b.yz);
}

/** 全部候选体素（满足三向投影必要条件的体素），按 (x,y,z) 字典序返回 */
export function candidates(d: Dims, p: Projections): Voxel[] {
  const out: Voxel[] = [];
  for (let x = 0; x < d.nx; x++) {
    for (let y = 0; y < d.ny; y++) {
      for (let z = 0; z < d.nz; z++) {
        if (p.xy[y][x] && p.xz[z][x] && p.yz[z][y]) out.push({ x, y, z });
      }
    }
  }
  return out;
}

/**
 * 首个「没有任何候选体素支撑」的为 1 投影格。
 * 扫描顺序：XY → XZ → YZ，平面内按行主序（先行后列）。
 * 返回 null 表示每个 1 格都至少有一个候选体素，即问题可行（取全部候选即为一组解）。
 */
export function firstUnsupportedCell(d: Dims, p: Projections): UnsupportedCell | null {
  for (let y = 0; y < d.ny; y++) {
    for (let x = 0; x < d.nx; x++) {
      if (!p.xy[y][x]) continue;
      let ok = false;
      for (let z = 0; z < d.nz; z++) if (p.xz[z][x] && p.yz[z][y]) { ok = true; break; }
      if (!ok) return { plane: 'xy', row: y, col: x };
    }
  }
  for (let z = 0; z < d.nz; z++) {
    for (let x = 0; x < d.nx; x++) {
      if (!p.xz[z][x]) continue;
      let ok = false;
      for (let y = 0; y < d.ny; y++) if (p.xy[y][x] && p.yz[z][y]) { ok = true; break; }
      if (!ok) return { plane: 'xz', row: z, col: x };
    }
  }
  for (let z = 0; z < d.nz; z++) {
    for (let y = 0; y < d.ny; y++) {
      if (!p.yz[z][y]) continue;
      let ok = false;
      for (let x = 0; x < d.nx; x++) if (p.xy[y][x] && p.xz[z][x]) { ok = true; break; }
      if (!ok) return { plane: 'yz', row: z, col: y };
    }
  }
  return null;
}

/** 由体素集合计算三向投影 */
export function projectVoxels(d: Dims, voxels: Iterable<Voxel>): Projections {
  const p = emptyProjections(d);
  for (const v of voxels) {
    p.xy[v.y][v.x] = true;
    p.xz[v.z][v.x] = true;
    p.yz[v.z][v.y] = true;
  }
  return p;
}

/**
 * 精确求解：体素数最少；并列时按 (x,y,z) 排序的体素列表字典序最小。
 * 无可行解时返回首个无候选体素支撑的投影格。
 */
export function solve(d: Dims, p: Projections): SolveResult {
  const bad = firstUnsupportedCell(d, p);
  if (bad) return { ok: false, cell: bad };

  const cand = candidates(d, p);

  // 投影格编号：XY 在前、XZ 其次、YZ 最后，各自行主序。
  // 总数 ≤ 3×3 + 3×3 + 3×3 = 27，可用 32 位整数位掩码表示覆盖集合。
  const xzBase = d.nx * d.ny;
  const yzBase = xzBase + d.nx * d.nz;
  const total = yzBase + d.ny * d.nz;

  const masks = cand.map(
    (v) =>
      (1 << (v.y * d.nx + v.x)) |
      (1 << (xzBase + v.z * d.nx + v.x)) |
      (1 << (yzBase + v.z * d.ny + v.y)),
  );

  let required = 0;
  for (let y = 0; y < d.ny; y++)
    for (let x = 0; x < d.nx; x++) if (p.xy[y][x]) required |= 1 << (y * d.nx + x);
  for (let z = 0; z < d.nz; z++)
    for (let x = 0; x < d.nx; x++) if (p.xz[z][x]) required |= 1 << (xzBase + z * d.nx + x);
  for (let z = 0; z < d.nz; z++)
    for (let y = 0; y < d.ny; y++) if (p.yz[z][y]) required |= 1 << (yzBase + z * d.ny + y);

  // 每个投影格 → 覆盖它的候选体素下标列表
  const cellToVoxels: number[][] = Array.from({ length: total }, () => []);
  masks.forEach((m, i) => {
    let bits = m;
    while (bits) {
      const bit = bits & -bits;
      cellToVoxels[31 - Math.clz32(bit)].push(i);
      bits &= bits - 1;
    }
  });

  const popcount = (m: number) => {
    let c = 0;
    while (m) { m &= m - 1; c++; }
    return c;
  };

  // 分支限界：覆盖 need 中所有投影格所需的最少体素数；返回值 > limit 表示「在 limit 内无解」。
  function minCover(allowed: boolean[], need: number, limit: number): number {
    let best = limit + 1;
    function dfs(covered: number, count: number) {
      const uncovered = need & ~covered;
      if (uncovered === 0) {
        if (count < best) best = count;
        return;
      }
      // 下界：每个体素至多新覆盖 3 个投影格
      if (count + Math.ceil(popcount(uncovered) / 3) >= best) return;
      // 最约束优先：挑可用体素最少的未覆盖格进行分支
      let pick: number[] | null = null;
      let bits = uncovered;
      while (bits) {
        const bit = bits & -bits;
        const cell = 31 - Math.clz32(bit);
        bits &= bits - 1;
        const list = cellToVoxels[cell].filter((i) => allowed[i]);
        if (list.length === 0) return; // 该格无人能盖，此分支不可行
        if (pick === null || list.length < pick.length) {
          pick = list;
          if (list.length === 1) break;
        }
      }
      for (const i of pick!) dfs(covered | masks[i], count + 1);
    }
    dfs(0, 0);
    return best;
  }

  // 第一步：求最少体素数 k（全部候选一起必能覆盖，故 k ≤ cand.length）
  const k = minCover(cand.map(() => true), required, cand.length);

  // 第二步：字典序最小化。按 (x,y,z) 升序逐个决定体素去留——
  // 若「选它」后仍存在不超过 k 的完整方案，则必选它（字典序更小），否则永久排除。
  const chosen: number[] = [];
  const excluded = new Set<number>();
  let covered = 0;
  let remaining = k;
  for (let i = 0; i < cand.length && remaining > 0; i++) {
    const need = required & ~covered & ~masks[i];
    const allowed = cand.map((_, j) => j !== i && !excluded.has(j) && !chosen.includes(j));
    if (minCover(allowed, need, remaining - 1) <= remaining - 1) {
      chosen.push(i);
      covered |= masks[i];
      remaining--;
    } else {
      excluded.add(i);
    }
  }

  return { ok: true, voxels: chosen.map((i) => cand[i]), count: k };
}

// ---------------------------------------------------------------------------
// 轴置换（用于一致性检验：换轴不应改变最少体素数，三向投影应随之对应变换）
// ---------------------------------------------------------------------------

export type Axis = 0 | 1 | 2; // 0=x, 1=y, 2=z

/** 新坐标系的第 i 根轴取自旧坐标系的第 perm[i] 根轴 */
export type Perm = [Axis, Axis, Axis];

export const ALL_PERMS: Perm[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

export function permuteDims(d: Dims, perm: Perm): Dims {
  const a = [d.nx, d.ny, d.nz];
  return { nx: a[perm[0]], ny: a[perm[1]], nz: a[perm[2]] };
}

export function permuteVoxel(v: Voxel, perm: Perm): Voxel {
  const a = [v.x, v.y, v.z];
  return { x: a[perm[0]], y: a[perm[1]], z: a[perm[2]] };
}

/** 各投影平面：沿哪根轴投影、行/列分别对应哪根轴 */
const PLANE_INFO: Record<Plane, { along: Axis; row: Axis; col: Axis }> = {
  xy: { along: 2, row: 1, col: 0 },
  xz: { along: 1, row: 2, col: 0 },
  yz: { along: 0, row: 2, col: 1 },
};
const PLANE_FOR_ALONG: Plane[] = ['yz', 'xz', 'xy'];

/** 按轴置换变换三张投影 */
export function permuteProjections(p: Projections, d: Dims, perm: Perm): Projections {
  const out = emptyProjections(permuteDims(d, perm));
  for (const plane of ['xy', 'xz', 'yz'] as Plane[]) {
    const info = PLANE_INFO[plane];
    const srcPlane = PLANE_FOR_ALONG[perm[info.along]];
    const srcInfo = PLANE_INFO[srcPlane];
    const src = p[srcPlane];
    const dst = out[plane];
    const oldRowAxis = perm[info.row];
    for (let r = 0; r < dst.length; r++) {
      for (let c = 0; c < dst[r].length; c++) {
        // 新格 (r, c)：旧坐标系下行轴取值为 r、列轴取值为 c；行列轴顺序可能交换
        dst[r][c] = srcInfo.row === oldRowAxis ? src[r][c] : src[c][r];
      }
    }
  }
  return out;
}
