/**
 * 三向正交投影 → 最少体素重建。
 *
 * 规则：
 *  - 体素 (x,y,z) 可占用的必要条件：XY[x][y]、XZ[x][z]、YZ[y][z] 三格都为 1；
 *  - 每个为 1 的投影格必须至少被一个选中体素覆盖；
 *  - 求占用体素数最少的模型；并列时取“按 (x,y,z) 排序后的体素列表”字典序最小者；
 *  - 无解时报告首个没有任何候选体素支撑的投影格
 *    （判定顺序：XY → XZ → YZ 面；面内第二轴 j 升序、同行内第一轴 i 升序）。
 */

export interface Dims {
  nx: number;
  ny: number;
  nz: number;
}

export type PlaneId = 'xy' | 'xz' | 'yz';

export interface CellRef {
  plane: PlaneId;
  /** 该面第一轴坐标（xy/xz 为 x，yz 为 y） */
  i: number;
  /** 该面第二轴坐标（xy 为 y，xz/yz 为 z） */
  j: number;
}

export interface Voxel {
  x: number;
  y: number;
  z: number;
}

/** grid[i][j]，i 为该面第一轴、j 为第二轴 */
export type Grid = boolean[][];

export type SolveResult =
  | { ok: true; voxels: Voxel[] }
  | { ok: false; unsupported: CellRef };

export const PLANES: PlaneId[] = ['xy', 'xz', 'yz'];

export function planeDims(dims: Dims, plane: PlaneId): [number, number] {
  if (plane === 'xy') return [dims.nx, dims.ny];
  if (plane === 'xz') return [dims.nx, dims.nz];
  return [dims.ny, dims.nz];
}

export function getCell(
  plane: PlaneId,
  xy: Grid,
  xz: Grid,
  yz: Grid,
  i: number,
  j: number,
): boolean {
  if (plane === 'xy') return xy[i][j];
  if (plane === 'xz') return xz[i][j];
  return yz[i][j];
}

/** 全部投影格按“首个无支撑”判定顺序排列 */
export function cellsInOrder(dims: Dims): CellRef[] {
  const out: CellRef[] = [];
  for (const plane of PLANES) {
    const [na, nb] = planeDims(dims, plane);
    for (let j = 0; j < nb; j++) {
      for (let i = 0; i < na; i++) out.push({ plane, i, j });
    }
  }
  return out;
}

export function coversCell(plane: PlaneId, i: number, j: number, v: Voxel): boolean {
  if (plane === 'xy') return v.x === i && v.y === j;
  if (plane === 'xz') return v.x === i && v.z === j;
  return v.y === i && v.z === j;
}

/** 全部候选体素（三向投影对应格均为 1），按 (x,y,z) 字典序返回 */
export function candidates(dims: Dims, xy: Grid, xz: Grid, yz: Grid): Voxel[] {
  const out: Voxel[] = [];
  for (let x = 0; x < dims.nx; x++) {
    for (let y = 0; y < dims.ny; y++) {
      for (let z = 0; z < dims.nz; z++) {
        if (xy[x][y] && xz[x][z] && yz[y][z]) out.push({ x, y, z });
      }
    }
  }
  return out;
}

/** 首个没有任何候选体素支撑的为 1 的投影格；全部有支撑则返回 null */
export function firstUnsupported(
  dims: Dims,
  xy: Grid,
  xz: Grid,
  yz: Grid,
  cand: Voxel[] = candidates(dims, xy, xz, yz),
): CellRef | null {
  for (const cell of cellsInOrder(dims)) {
    if (!getCell(cell.plane, xy, xz, yz, cell.i, cell.j)) continue;
    if (!cand.some((v) => coversCell(cell.plane, cell.i, cell.j, v))) return cell;
  }
  return null;
}

/** 由体素集合计算三向投影 */
export function projectionsOf(dims: Dims, voxels: Voxel[]): { xy: Grid; xz: Grid; yz: Grid } {
  const xy: Grid = Array.from({ length: dims.nx }, () => Array(dims.ny).fill(false));
  const xz: Grid = Array.from({ length: dims.nx }, () => Array(dims.nz).fill(false));
  const yz: Grid = Array.from({ length: dims.ny }, () => Array(dims.nz).fill(false));
  for (const v of voxels) {
    xy[v.x][v.y] = true;
    xz[v.x][v.z] = true;
    yz[v.y][v.z] = true;
  }
  return { xy, xz, yz };
}

function popcount(n: number): number {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** 最低有效位的下标 */
function lowbitIndex(n: number): number {
  return 31 - Math.clz32(n & -n);
}

export function solve(dims: Dims, xy: Grid, xz: Grid, yz: Grid): SolveResult {
  const cand = candidates(dims, xy, xz, yz);
  const unsupported = firstUnsupported(dims, xy, xz, yz, cand);
  if (unsupported) return { ok: false, unsupported };
  // 至此必然有解：选中全部候选体素即可覆盖所有为 1 的投影格，
  // 且候选体素的投影只落在为 1 的格上。

  const { nx, ny, nz } = dims;
  // 每个投影面对应一个位掩码，格 (i,j) 的位号为 j*na+i
  let reqXY = 0;
  let reqXZ = 0;
  let reqYZ = 0;
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) if (xy[x][y]) reqXY |= 1 << (y * nx + x);
    for (let z = 0; z < nz; z++) if (xz[x][z]) reqXZ |= 1 << (z * nx + x);
  }
  for (let y = 0; y < ny; y++) {
    for (let z = 0; z < nz; z++) if (yz[y][z]) reqYZ |= 1 << (z * ny + y);
  }

  // 每个候选体素在三个面上覆盖的位
  const mXY: number[] = [];
  const mXZ: number[] = [];
  const mYZ: number[] = [];
  // 每个投影格被哪些候选体素覆盖（候选下标位掩码）
  const covXY: number[] = new Array(nx * ny).fill(0);
  const covXZ: number[] = new Array(nx * nz).fill(0);
  const covYZ: number[] = new Array(ny * nz).fill(0);
  cand.forEach((v, ci) => {
    const bXY = 1 << (v.y * nx + v.x);
    const bXZ = 1 << (v.z * nx + v.x);
    const bYZ = 1 << (v.z * ny + v.y);
    mXY.push(bXY);
    mXZ.push(bXZ);
    mYZ.push(bYZ);
    covXY[v.y * nx + v.x] |= 1 << ci;
    covXZ[v.z * nx + v.x] |= 1 << ci;
    covYZ[v.z * ny + v.y] |= 1 << ci;
  });

  /**
   * 是否能在 allowed（候选下标位掩码）中再选至多 k 个，
   * 使三个面的已覆盖掩码达到各自的要求掩码。
   */
  function dfs(allowed: number, cxy: number, cxz: number, cyz: number, k: number): boolean {
    if ((cxy & reqXY) === reqXY && (cxz & reqXZ) === reqXZ && (cyz & reqYZ) === reqYZ) return true;
    if (k <= 0) return false;
    // 每个体素在每个面上恰覆盖一格 → 各面未覆盖格数即剩余体素数下界
    const ux = popcount(reqXY & ~cxy);
    const uy = popcount(reqXZ & ~cxz);
    const uz = popcount(reqYZ & ~cyz);
    if (Math.max(ux, uy, uz) > k) return false;
    // 在未覆盖最多的面上取第一个未覆盖格，枚举能覆盖它的候选
    let coverers: number;
    if (ux >= uy && ux >= uz) coverers = allowed & covXY[lowbitIndex(reqXY & ~cxy)];
    else if (uy >= uz) coverers = allowed & covXZ[lowbitIndex(reqXZ & ~cxz)];
    else coverers = allowed & covYZ[lowbitIndex(reqYZ & ~cyz)];
    let excluded = 0;
    while (coverers !== 0) {
      const bit = coverers & -coverers;
      coverers ^= bit;
      const ci = 31 - Math.clz32(bit);
      if (dfs(allowed & ~bit & ~excluded, cxy | mXY[ci], cxz | mXZ[ci], cyz | mYZ[ci], k - 1)) {
        return true;
      }
      excluded |= bit;
    }
    return false;
  }

  const full = (1 << cand.length) - 1;
  const lb0 = Math.max(popcount(reqXY), popcount(reqXZ), popcount(reqYZ));
  let k = lb0;
  while (!dfs(full, 0, 0, 0, k)) k++; // 全选必然可行，循环必终止

  // 字典序最小构造：逐位确定排序后列表的下一个体素，
  // 取最小的候选 ci，使得“强制包含已选前缀 + 只从 ci 之后的候选补足 k 个”仍可行。
  const gt = new Array<number>(cand.length).fill(0); // gt[i]：下标严格大于 i 的候选位掩码
  for (let i = cand.length - 2; i >= 0; i--) gt[i] = gt[i + 1] | (1 << (i + 1));

  const chosen: number[] = [];
  let cxy = 0;
  let cxz = 0;
  let cyz = 0;
  let after = -1;
  for (let pos = 0; pos < k; pos++) {
    let pick = -1;
    for (let ci = after + 1; ci < cand.length; ci++) {
      if (dfs(gt[ci], cxy | mXY[ci], cxz | mXZ[ci], cyz | mYZ[ci], k - pos - 1)) {
        pick = ci;
        break;
      }
    }
    chosen.push(pick);
    cxy |= mXY[pick];
    cxz |= mXZ[pick];
    cyz |= mYZ[pick];
    after = pick;
  }

  return { ok: true, voxels: chosen.map((ci) => cand[ci]) };
}
