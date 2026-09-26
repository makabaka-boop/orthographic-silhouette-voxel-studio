import { describe, expect, it } from 'vitest';
import {
  ALL_PERMS,
  candidates,
  emptyProjections,
  fullProjections,
  permuteDims,
  permuteProjections,
  permuteVoxel,
  projectionsEqual,
  projectVoxels,
  solve,
  type Dims,
  type Projections,
  type UnsupportedCell,
  type Voxel,
} from './solver';

// ---------------------------------------------------------------------------
// 对拍用暴力法：枚举全部体素子集，取投影与输入完全一致且 (数量, 字典序) 最优者
// ---------------------------------------------------------------------------

function lexLess(a: Voxel[], b: Voxel[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const ka = (a[i].x << 16) | (a[i].y << 8) | a[i].z;
    const kb = (b[i].x << 16) | (b[i].y << 8) | b[i].z;
    if (ka !== kb) return ka < kb;
  }
  return a.length < b.length;
}

function bruteForce(d: Dims, p: Projections): Voxel[] | null {
  const all: Voxel[] = [];
  for (let x = 0; x < d.nx; x++)
    for (let y = 0; y < d.ny; y++)
      for (let z = 0; z < d.nz; z++) all.push({ x, y, z });

  let best: Voxel[] | null = null;
  for (let mask = 0; mask < 1 << all.length; mask++) {
    const sel = all.filter((_, i) => (mask >> i) & 1);
    if (best !== null && sel.length > best.length) continue;
    if (!projectionsEqual(projectVoxels(d, sel), p)) continue;
    if (best === null || sel.length < best.length || lexLess(sel, best)) best = sel;
  }
  return best;
}

/** 2×2×2 的三张投影编码为 12 个比特（xy、xz、yz 各 4 格，行主序） */
function projectionsFromBits(bits: number): Projections {
  const g = (i: number) => ((bits >> i) & 1) === 1;
  return {
    xy: [
      [g(0), g(1)],
      [g(2), g(3)],
    ],
    xz: [
      [g(4), g(5)],
      [g(6), g(7)],
    ],
    yz: [
      [g(8), g(9)],
      [g(10), g(11)],
    ],
  };
}

/** 该投影格是否确实没有任何候选体素能覆盖 */
function cellUncovered(d: Dims, p: Projections, cell: UnsupportedCell): boolean {
  const cand = candidates(d, p);
  if (cell.plane === 'xy') return !cand.some((v) => v.x === cell.col && v.y === cell.row);
  if (cell.plane === 'xz') return !cand.some((v) => v.x === cell.col && v.z === cell.row);
  return !cand.some((v) => v.y === cell.col && v.z === cell.row);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomProjections(d: Dims, rng: () => number): Projections {
  const p = emptyProjections(d);
  for (const plane of ['xy', 'xz', 'yz'] as const) {
    for (const row of p[plane]) {
      for (let c = 0; c < row.length; c++) row[c] = rng() < 0.55;
    }
  }
  return p;
}

// ---------------------------------------------------------------------------
// 1) 2×2×2 穷举对拍：4096 组投影 × 全部 256 个体素子集
// ---------------------------------------------------------------------------

describe('2×2×2 穷举对拍', () => {
  it('4096 组投影的解与暴力枚举全部体素子集完全一致', () => {
    const d: Dims = { nx: 2, ny: 2, nz: 2 };
    const mismatches: string[] = [];

    for (let bits = 0; bits < 1 << 12; bits++) {
      const p = projectionsFromBits(bits);
      const expected = bruteForce(d, p);
      const got = solve(d, p);
      const tag = `bits=${bits.toString(2).padStart(12, '0')}`;

      if (expected === null) {
        if (got.ok) {
          mismatches.push(`${tag}: 暴力判无解，求解器却给出 ${JSON.stringify(got.voxels)}`);
        } else if (!cellUncovered(d, p, got.cell)) {
          mismatches.push(`${tag}: 报告的无支撑格 ${JSON.stringify(got.cell)} 实际可被候选体素覆盖`);
        }
        continue;
      }

      if (!got.ok) {
        mismatches.push(`${tag}: 暴力最优 ${expected.length} 个，求解器却判无解`);
        continue;
      }
      if (got.count !== expected.length) {
        mismatches.push(`${tag}: 数量 ${got.count} ≠ 暴力 ${expected.length}`);
      }
      if (JSON.stringify(got.voxels) !== JSON.stringify(expected)) {
        mismatches.push(
          `${tag}: 字典序最小列表不一致 ${JSON.stringify(got.voxels)} ≠ ${JSON.stringify(expected)}`,
        );
      }
      // 解的三向投影必须与输入一致
      if (!projectionsEqual(projectVoxels(d, got.voxels), p)) {
        mismatches.push(`${tag}: 解的三向投影与输入不一致`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2) 轴置换一致性：最少体素数不变，解的三向投影与置换后的投影一致
// ---------------------------------------------------------------------------

function checkPermutationConsistency(d: Dims, p: Projections, tag: string): string[] {
  const problems: string[] = [];
  const r1 = solve(d, p);

  for (const perm of ALL_PERMS) {
    const pd = permuteDims(d, perm);
    const pp = permuteProjections(p, d, perm);
    const r2 = solve(pd, pp);
    const label = `${tag} perm=${perm.join('')}`;

    if (r1.ok !== r2.ok) {
      problems.push(`${label}: 可解性不一致`);
      continue;
    }
    if (!r1.ok || !r2.ok) continue;

    if (r1.count !== r2.count) {
      problems.push(`${label}: 最少体素数 ${r1.count} ≠ ${r2.count}`);
    }
    // 置换后问题的解，其三向投影必须等于置换后的投影
    if (!projectionsEqual(projectVoxels(pd, r2.voxels), pp)) {
      problems.push(`${label}: 置换后解的三向投影不一致`);
    }
    // 原解直接置换坐标，也必须是新问题的合法解
    const moved = r1.voxels.map((v) => permuteVoxel(v, perm));
    if (!projectionsEqual(projectVoxels(pd, moved), pp)) {
      problems.push(`${label}: 原解置换坐标后的三向投影不一致`);
    }
  }
  return problems;
}

describe('轴置换一致性', () => {
  it('2×2×2 全部 4096 组投影 × 6 种轴置换', () => {
    const d: Dims = { nx: 2, ny: 2, nz: 2 };
    const problems: string[] = [];
    for (let bits = 0; bits < 1 << 12; bits++) {
      problems.push(...checkPermutationConsistency(d, projectionsFromBits(bits), `bits=${bits}`));
    }
    expect(problems).toEqual([]);
  });

  it('随机 2~3 维投影 × 6 种轴置换', () => {
    const rng = mulberry32(20260926);
    const problems: string[] = [];
    for (let t = 0; t < 150; t++) {
      const d: Dims = {
        nx: 2 + Math.floor(rng() * 2),
        ny: 2 + Math.floor(rng() * 2),
        nz: 2 + Math.floor(rng() * 2),
      };
      problems.push(...checkPermutationConsistency(d, randomProjections(d, rng), `case=${t}`));
    }
    expect(problems).toEqual([]);
  });

  it('投影置换与体素置换互为对应（机器本身自洽）', () => {
    const rng = mulberry32(7);
    const problems: string[] = [];
    for (let t = 0; t < 200; t++) {
      const d: Dims = { nx: 3, ny: 2, nz: 3 };
      const voxels: Voxel[] = [];
      for (let x = 0; x < d.nx; x++)
        for (let y = 0; y < d.ny; y++)
          for (let z = 0; z < d.nz; z++) if (rng() < 0.4) voxels.push({ x, y, z });
      const p = projectVoxels(d, voxels);
      for (const perm of ALL_PERMS) {
        const pd = permuteDims(d, perm);
        const moved = voxels.map((v) => permuteVoxel(v, perm));
        if (!projectionsEqual(projectVoxels(pd, moved), permuteProjections(p, d, perm))) {
          problems.push(`case=${t} perm=${perm.join('')}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3) 针对性用例
// ---------------------------------------------------------------------------

describe('针对性用例', () => {
  it('填满所有候选体素 ≠ 用料最少：2×2×2 全 1 投影候选 8 个、最优 4 个', () => {
    const d: Dims = { nx: 2, ny: 2, nz: 2 };
    const r = solve(d, fullProjections(d));
    expect(candidates(d, fullProjections(d))).toHaveLength(8);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.count).toBe(4);
      // 字典序最小解：z = x XOR y 的四个体素
      expect(r.voxels).toEqual([
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 1 },
        { x: 1, y: 0, z: 1 },
        { x: 1, y: 1, z: 0 },
      ]);
    }
  });

  it('3×3×3 全 1 投影：每个 XY 格至少一个体素，下界 9 可达', () => {
    const d: Dims = { nx: 3, ny: 3, nz: 3 };
    const r = solve(d, fullProjections(d));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.count).toBe(9);
      expect(projectionsEqual(projectVoxels(d, r.voxels), fullProjections(d))).toBe(true);
    }
  });

  it('全 0 投影：空模型即最优', () => {
    const d: Dims = { nx: 3, ny: 2, nz: 3 };
    const r = solve(d, emptyProjections(d));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.count).toBe(0);
      expect(r.voxels).toEqual([]);
    }
  });

  it('孤立 1 格无候选支撑时报告首个格子（XY → XZ → YZ，行主序）', () => {
    const d: Dims = { nx: 2, ny: 2, nz: 2 };
    const p = emptyProjections(d);
    p.xy[1][0] = true; // 需要某个 z 使 xz[z][0] 与 yz[z][1] 同时为 1，但二者全 0
    const r = solve(d, p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.cell).toEqual({ plane: 'xy', row: 1, col: 0 });
  });

  it('交叉支撑不足时按顺序报告：XY 可行而 XZ 失败', () => {
    const d: Dims = { nx: 2, ny: 2, nz: 2 };
    const p = emptyProjections(d);
    p.xy[0][0] = true;
    p.xz[0][0] = true;
    p.yz[0][0] = true; // 体素 (0,0,0) 成为候选，XY 全部 1 格均有支撑
    p.xz[1][1] = true; // xz(x=1,z=1) 需要某个 y 使 xy[y][1] 且 yz[1][y]，但 xy 第 1 列全 0
    const r = solve(d, p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.cell).toEqual({ plane: 'xz', row: 1, col: 1 });
  });
});
