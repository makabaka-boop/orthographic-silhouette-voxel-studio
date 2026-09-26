import { describe, it, expect } from 'vitest';
import {
  solve,
  candidates,
  cellsInOrder,
  getCell,
  coversCell,
  projectionsOf,
  type Dims,
  type Grid,
  type Voxel,
} from './solver';

/* ---------- 独立参考实现（对拍用） ---------- */

function gridsEqual(a: Grid, b: Grid): boolean {
  return (
    a.length === b.length &&
    a.every((row, i) => row.length === b[i].length && row.every((v, j) => v === b[i][j]))
  );
}

function lexCmp(a: Voxel[], b: Voxel[]): number {
  for (let k = 0; k < Math.min(a.length, b.length); k++) {
    if (a[k].x !== b[k].x) return a[k].x - b[k].x;
    if (a[k].y !== b[k].y) return a[k].y - b[k].y;
    if (a[k].z !== b[k].z) return a[k].z - b[k].z;
  }
  return a.length - b.length;
}

/** 暴力枚举全部体素子集：投影完全相等且体素数最少、并列取字典序最小 */
function brute(dims: Dims, xy: Grid, xz: Grid, yz: Grid): Voxel[] | null {
  const all: Voxel[] = [];
  for (let x = 0; x < dims.nx; x++)
    for (let y = 0; y < dims.ny; y++)
      for (let z = 0; z < dims.nz; z++) all.push({ x, y, z });
  let best: Voxel[] | null = null;
  for (let mask = 0; mask < 1 << all.length; mask++) {
    const sel = all.filter((_, i) => ((mask >> i) & 1) === 1); // 已按 (x,y,z) 有序
    const p = projectionsOf(dims, sel);
    if (!gridsEqual(p.xy, xy) || !gridsEqual(p.xz, xz) || !gridsEqual(p.yz, yz)) continue;
    if (!best || sel.length < best.length || (sel.length === best.length && lexCmp(sel, best) < 0)) {
      best = sel;
    }
  }
  return best;
}

/** bits 的 (j*na+i) 位 → grid[i][j] */
function gridFromBits(na: number, nb: number, bits: number): Grid {
  return Array.from({ length: na }, (_, i) =>
    Array.from({ length: nb }, (_, j) => ((bits >> (j * na + i)) & 1) === 1),
  );
}

function fullGrid(a: number, b: number, v: boolean): Grid {
  return Array.from({ length: a }, () => Array(b).fill(v));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 2×2×2 全投影穷举对拍 ---------- */

describe('2×2×2 全部 4096 组投影穷举对拍', () => {
  it('solve 与暴力枚举全部体素子集结果一致', () => {
    const dims: Dims = { nx: 2, ny: 2, nz: 2 };
    for (let bits = 0; bits < 4096; bits++) {
      const xy = gridFromBits(2, 2, bits & 15);
      const xz = gridFromBits(2, 2, (bits >> 4) & 15);
      const yz = gridFromBits(2, 2, (bits >> 8) & 15);
      const r = solve(dims, xy, xz, yz);
      const best = brute(dims, xy, xz, yz);
      if (best === null) {
        expect(r.ok, `bits=${bits} 应判无解`).toBe(false);
        if (!r.ok) {
          const { plane, i, j } = r.unsupported;
          const cand = candidates(dims, xy, xz, yz);
          // 被报告的格必须为 1 且确实无候选支撑
          expect(getCell(plane, xy, xz, yz, i, j)).toBe(true);
          expect(cand.some((v) => coversCell(plane, i, j, v))).toBe(false);
          // 判定顺序在它之前的所有为 1 的格都必须有候选支撑
          for (const c of cellsInOrder(dims)) {
            if (c.plane === plane && c.i === i && c.j === j) break;
            if (getCell(c.plane, xy, xz, yz, c.i, c.j)) {
              expect(cand.some((v) => coversCell(c.plane, c.i, c.j, v))).toBe(true);
            }
          }
        }
      } else {
        expect(r.ok, `bits=${bits} 应有解`).toBe(true);
        if (r.ok) {
          expect(r.voxels.length, `bits=${bits} 最少体素数`).toBe(best.length);
          expect(r.voxels, `bits=${bits} 字典序最小列表`).toEqual(best);
        }
      }
    }
  });
});

/* ---------- 轴置换一致性 ---------- */

type Perm = [number, number, number];
const PERMS: Perm[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/** 旧轴 a、b 上的投影格值（u 沿 a、v 沿 b） */
function projVal(xy: Grid, xz: Grid, yz: Grid, a: number, b: number, u: number, v: number): boolean {
  const key = a * 3 + b;
  if (key === 1) return xy[u][v]; // (0,1)
  if (key === 2) return xz[u][v]; // (0,2)
  if (key === 5) return yz[u][v]; // (1,2)
  if (key === 3) return xy[v][u]; // (1,0)
  if (key === 6) return xz[v][u]; // (2,0)
  return yz[v][u]; // (2,1)
}

/** 新轴 i = 旧轴 p[i]，体素坐标与三向投影随之重排 */
function permuteProblem(dims: Dims, xy: Grid, xz: Grid, yz: Grid, p: Perm) {
  const d = [dims.nx, dims.ny, dims.nz];
  const nd: Dims = { nx: d[p[0]], ny: d[p[1]], nz: d[p[2]] };
  const build = (a: number, b: number): Grid =>
    Array.from({ length: d[p[a]] }, (_, i) =>
      Array.from({ length: d[p[b]] }, (_, j) => projVal(xy, xz, yz, p[a], p[b], i, j)),
    );
  return { dims: nd, xy: build(0, 1), xz: build(0, 2), yz: build(1, 2) };
}

describe('轴置换', () => {
  it('置换后最少体素数不变、三向投影仍一致', () => {
    const rand = mulberry32(20260926);
    for (let t = 0; t < 200; t++) {
      const dims: Dims = {
        nx: 2 + Math.floor(rand() * 2),
        ny: 2 + Math.floor(rand() * 2),
        nz: 2 + Math.floor(rand() * 2),
      };
      const rndGrid = (a: number, b: number): Grid =>
        Array.from({ length: a }, () => Array.from({ length: b }, () => rand() < 0.5));
      const xy = rndGrid(dims.nx, dims.ny);
      const xz = rndGrid(dims.nx, dims.nz);
      const yz = rndGrid(dims.ny, dims.nz);
      const r1 = solve(dims, xy, xz, yz);

      for (const p of PERMS) {
        const q = permuteProblem(dims, xy, xz, yz, p);
        const r2 = solve(q.dims, q.xy, q.xz, q.yz);
        expect(r2.ok, `t=${t} perm=${p} 有解性应一致`).toBe(r1.ok);
        if (!r1.ok || !r2.ok) continue;

        // 最少体素数不随轴置换改变
        expect(r2.voxels.length, `t=${t} perm=${p} 最少体素数`).toBe(r1.voxels.length);

        // 两个解各自的三向投影与各自输入完全一致
        const p1 = projectionsOf(dims, r1.voxels);
        expect(gridsEqual(p1.xy, xy)).toBe(true);
        expect(gridsEqual(p1.xz, xz)).toBe(true);
        expect(gridsEqual(p1.yz, yz)).toBe(true);
        const p2 = projectionsOf(q.dims, r2.voxels);
        expect(gridsEqual(p2.xy, q.xy)).toBe(true);
        expect(gridsEqual(p2.xz, q.xz)).toBe(true);
        expect(gridsEqual(p2.yz, q.yz)).toBe(true);

        // 原解直接置换坐标后仍是置换后问题的合法解
        const pv = r1.voxels.map((v) => {
          const c = [v.x, v.y, v.z];
          return { x: c[p[0]], y: c[p[1]], z: c[p[2]] };
        });
        const pp = projectionsOf(q.dims, pv);
        expect(gridsEqual(pp.xy, q.xy)).toBe(true);
        expect(gridsEqual(pp.xz, q.xz)).toBe(true);
        expect(gridsEqual(pp.yz, q.yz)).toBe(true);
      }
    }
  });
});

/* ---------- 已知答案的定点用例 ---------- */

describe('定点用例', () => {
  it('2×2×2 全 1：最少 4 个体素，字典序最小列表确定', () => {
    const dims: Dims = { nx: 2, ny: 2, nz: 2 };
    const r = solve(dims, fullGrid(2, 2, true), fullGrid(2, 2, true), fullGrid(2, 2, true));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.voxels).toEqual([
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 1 },
        { x: 1, y: 0, z: 1 },
        { x: 1, y: 1, z: 0 },
      ]);
    }
  });

  it('3×3×3 全 1：最少 9 个体素且投影吻合', () => {
    const dims: Dims = { nx: 3, ny: 3, nz: 3 };
    const r = solve(dims, fullGrid(3, 3, true), fullGrid(3, 3, true), fullGrid(3, 3, true));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.voxels.length).toBe(9);
      const p = projectionsOf(dims, r.voxels);
      expect(gridsEqual(p.xy, fullGrid(3, 3, true))).toBe(true);
      expect(gridsEqual(p.xz, fullGrid(3, 3, true))).toBe(true);
      expect(gridsEqual(p.yz, fullGrid(3, 3, true))).toBe(true);
    }
  });

  it('全空投影：0 个体素', () => {
    const dims: Dims = { nx: 3, ny: 2, nz: 3 };
    const r = solve(dims, fullGrid(3, 2, false), fullGrid(3, 3, false), fullGrid(2, 3, false));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.voxels).toEqual([]);
  });

  it('无解时报告首个无支撑投影格', () => {
    const dims: Dims = { nx: 2, ny: 2, nz: 2 };
    const xy = fullGrid(2, 2, false);
    xy[1][0] = true; // 需要 x=1,y=0 的体素，但 XZ/YZ 全空
    const r = solve(dims, xy, fullGrid(2, 2, false), fullGrid(2, 2, false));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unsupported).toEqual({ plane: 'xy', i: 1, j: 0 });
  });

  it('无解时按 XY→XZ→YZ 顺序报告首个', () => {
    const dims: Dims = { nx: 2, ny: 2, nz: 2 };
    // XZ(0,0) 与 YZ(0,0) 都无支撑，但 XY 全空 → 应报告 XZ 面
    const xz = fullGrid(2, 2, false);
    xz[0][0] = true;
    const yz = fullGrid(2, 2, false);
    yz[0][0] = true;
    const r = solve(dims, fullGrid(2, 2, false), xz, yz);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unsupported).toEqual({ plane: 'xz', i: 0, j: 0 });
  });
});
