<script lang="ts">
  import type { Dims, Voxel } from './solver';

  /** 等轴（isometric）视图：候选体素半透明，最优解体素实心 */
  export let dims: Dims;
  export let candidates: Voxel[] = [];
  export let solution: Voxel[] | null = null;
  export let showCandidates = true;

  // 等轴投影参数：x/y 轴斜向，z 轴竖直向上
  const UX = 30;
  const UY = 15;
  const UZ = 30;

  function iso(x: number, y: number, z: number): [number, number] {
    return [(x - y) * UX, (x + y) * UY - z * UZ];
  }

  interface Cube {
    key: string;
    kind: 'sol' | 'cand';
    top: string;
    left: string;
    right: string;
  }

  function makeCube(v: Voxel, kind: 'sol' | 'cand'): Cube {
    const { x, y, z } = v;
    const p = (dx: number, dy: number, dz: number) => iso(x + dx, y + dy, z + dz).join(',');
    return {
      key: `${kind}:${x},${y},${z}`,
      kind,
      // 摄像机位于 (+x, +y, +z) 方向，可见面为顶面、+y 面、+x 面
      top: `${p(0, 0, 1)} ${p(1, 0, 1)} ${p(1, 1, 1)} ${p(0, 1, 1)}`,
      left: `${p(0, 1, 0)} ${p(1, 1, 0)} ${p(1, 1, 1)} ${p(0, 1, 1)}`,
      right: `${p(1, 0, 0)} ${p(1, 1, 0)} ${p(1, 1, 1)} ${p(1, 0, 1)}`,
    };
  }

  let cubes: Cube[] = [];
  $: {
    const list: { v: Voxel; kind: 'sol' | 'cand' }[] = [];
    if (showCandidates) for (const v of candidates) list.push({ v, kind: 'cand' });
    if (solution) for (const v of solution) list.push({ v, kind: 'sol' });
    // 画家算法：离摄像机越远（x+y+z 越小）越先画；同位置候选垫底、解覆盖其上
    list.sort(
      (a, b) =>
        a.v.x + a.v.y + a.v.z - (b.v.x + b.v.y + b.v.z) ||
        a.v.z - b.v.z ||
        (a.kind === b.kind ? 0 : a.kind === 'cand' ? -1 : 1),
    );
    cubes = list.map(({ v, kind }) => makeCube(v, kind));
  }

  interface Line {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  let gridLines: Line[] = [];
  $: {
    const lines: Line[] = [];
    for (let i = 0; i <= dims.nx; i++) {
      const [x1, y1] = iso(i, 0, 0);
      const [x2, y2] = iso(i, dims.ny, 0);
      lines.push({ x1, y1, x2, y2 });
    }
    for (let j = 0; j <= dims.ny; j++) {
      const [x1, y1] = iso(0, j, 0);
      const [x2, y2] = iso(dims.nx, j, 0);
      lines.push({ x1, y1, x2, y2 });
    }
    gridLines = lines;
  }

  let viewBox = '0 0 100 100';
  let axisLabels: { x: number; y: number; text: string }[] = [];
  $: {
    const us: number[] = [];
    const vs: number[] = [];
    for (const dx of [0, dims.nx]) {
      for (const dy of [0, dims.ny]) {
        for (const dz of [0, dims.nz]) {
          const [u, v] = iso(dx, dy, dz);
          us.push(u);
          vs.push(v);
        }
      }
    }
    const minU = Math.min(...us);
    const maxU = Math.max(...us);
    const minV = Math.min(...vs);
    const maxV = Math.max(...vs);
    const M = 36;
    viewBox = `${minU - M} ${minV - M} ${maxU - minU + 2 * M} ${maxV - minV + 2 * M}`;
    const [xx, xy] = iso(dims.nx + 0.9, -0.3, 0);
    const [yx, yy] = iso(-0.3, dims.ny + 0.9, 0);
    const [zx, zy] = iso(-0.35, -0.35, dims.nz + 0.7);
    axisLabels = [
      { x: xx, y: xy, text: 'x' },
      { x: yx, y: yy, text: 'y' },
      { x: zx, y: zy, text: 'z' },
    ];
  }
</script>

<figure class="iso-view">
  <figcaption>
    等轴视图 · 候选 {showCandidates ? candidates.length : 0} 个{#if solution}
      · 解 {solution.length} 个{/if}
  </figcaption>
  <svg {viewBox} role="img" aria-label="等轴视图">
    <g class="grid">
      {#each gridLines as l}
        <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
      {/each}
    </g>
    {#each cubes as c (c.key)}
      <g class={c.kind}>
        <polygon points={c.top} class="top" />
        <polygon points={c.left} class="left" />
        <polygon points={c.right} class="right" />
      </g>
    {/each}
    {#each axisLabels as a}
      <text x={a.x} y={a.y} class="axis-label">{a.text}</text>
    {/each}
  </svg>
</figure>

<style>
  .iso-view {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 260px;
  }
  figcaption {
    font-size: 13px;
    font-weight: 600;
    color: #475569;
  }
  svg {
    width: 100%;
    max-width: 420px;
    height: auto;
  }
  .grid line {
    stroke: #cbd5e1;
    stroke-width: 1;
  }
  polygon {
    stroke-linejoin: round;
    stroke-width: 1;
  }
  .cand {
    opacity: 0.28;
  }
  .cand .top {
    fill: #94a3b8;
    stroke: #64748b;
  }
  .cand .left {
    fill: #64748b;
    stroke: #475569;
  }
  .cand .right {
    fill: #475569;
    stroke: #334155;
  }
  .sol .top {
    fill: #7cc4ff;
    stroke: #1d4ed8;
  }
  .sol .left {
    fill: #3b82f6;
    stroke: #1d4ed8;
  }
  .sol .right {
    fill: #1e5fc4;
    stroke: #1d4ed8;
  }
  .axis-label {
    font-size: 13px;
    font-weight: 700;
    fill: #64748b;
    font-family: ui-monospace, monospace;
  }
</style>
