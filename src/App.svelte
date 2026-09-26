<script lang="ts">
  import MaskGrid from './lib/MaskGrid.svelte';
  import IsoView from './lib/IsoView.svelte';
  import {
    candidates,
    emptyProjections,
    fullProjections,
    resizeProjections,
    solve,
    type Dims,
    type Plane,
    type Projections,
    type SolveResult,
    type UnsupportedCell,
    type Voxel,
  } from './lib/solver';

  // ---- 状态 ----
  let nx = 2;
  let ny = 2;
  let nz = 2;
  let dims: Dims = { nx, ny, nz };
  // 初始示例：2×2×2 全 1 投影（候选 8 个，最优只需 4 个）
  let proj: Projections = fullProjections(dims);
  let result: SolveResult | null = solve(dims, proj);
  let showCandidates = true;

  const PLANE_NAME: Record<Plane, string> = { xy: 'XY', xz: 'XZ', yz: 'YZ' };

  // 维度变化：保留重叠区域，并清除旧结论
  let prev: Dims = { ...dims };
  $: if (nx !== prev.nx || ny !== prev.ny || nz !== prev.nz) {
    prev = { nx, ny, nz };
    dims = { nx, ny, nz };
    proj = resizeProjections(proj, dims);
    result = null;
  }

  // 候选体素：由投影实时派生（联动，不算「结论」）
  let candList: Voxel[] = [];
  $: candList = candidates(dims, proj);

  let solutionVoxels: Voxel[] | null = null;
  $: solutionVoxels = result && result.ok ? result.voxels : null;

  let failCell: UnsupportedCell | null = null;
  $: failCell = result && !result.ok ? result.cell : null;

  function onCell(plane: Plane, e: CustomEvent<{ row: number; col: number; value: boolean }>) {
    const { row, col, value } = e.detail;
    proj[plane][row][col] = value;
    proj = { ...proj }; // 触发响应式更新
    result = null; // 任何编辑清除旧结论
  }

  function rebuild() {
    result = solve(dims, proj);
  }

  function clearAll() {
    proj = emptyProjections(dims);
    result = null;
  }
</script>

<main>
  <header>
    <h1>三向投影 · 最少体素重建</h1>
    <p class="hint">
      体素 (x, y, z) 可占用 ⟺ XY[y][x]、XZ[z][x]、YZ[z][y] 三格全为 1；
      可行解必须让每个为 1 的投影格至少被一个体素覆盖。
      点击投影格切换 0/1，按住拖动可连续绘制；任何编辑都会清除旧结论。
    </p>
  </header>

  <section class="panel controls">
    <div class="dims">
      <label>
        X 维
        <select bind:value={nx}>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>
      <label>
        Y 维
        <select bind:value={ny}>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>
      <label>
        Z 维
        <select bind:value={nz}>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>
    </div>
    <div class="actions">
      <button class="primary" on:click={rebuild}>重建最少体素模型</button>
      <button on:click={clearAll}>清空投影</button>
      <label class="chk">
        <input type="checkbox" bind:checked={showCandidates} /> 显示候选体素
      </label>
    </div>
    <div class="stat">候选体素：<strong>{candList.length}</strong> 个</div>
  </section>

  <section class="boards">
    <div class="grids">
      <MaskGrid
        title="XY 投影（沿 z 轴俯视）"
        rows={dims.ny}
        cols={dims.nx}
        matrix={proj.xy}
        rowAxis="y"
        colAxis="x"
        highlight={failCell && failCell.plane === 'xy' ? failCell : null}
        on:change={(e) => onCell('xy', e)}
      />
      <MaskGrid
        title="XZ 投影（沿 y 轴正视）"
        rows={dims.nz}
        cols={dims.nx}
        matrix={proj.xz}
        rowAxis="z"
        colAxis="x"
        highlight={failCell && failCell.plane === 'xz' ? failCell : null}
        on:change={(e) => onCell('xz', e)}
      />
      <MaskGrid
        title="YZ 投影（沿 x 轴侧视）"
        rows={dims.nz}
        cols={dims.ny}
        matrix={proj.yz}
        rowAxis="z"
        colAxis="y"
        highlight={failCell && failCell.plane === 'yz' ? failCell : null}
        on:change={(e) => onCell('yz', e)}
      />
    </div>
    <IsoView {dims} candidates={candList} solution={solutionVoxels} {showCandidates} />
  </section>

  {#if result}
    <section class="panel result" class:fail={failCell !== null}>
      {#if solutionVoxels}
        <h2>✅ 最少体素数：{solutionVoxels.length}</h2>
        <p class="voxels">
          [{#each solutionVoxels as v, i}{#if i > 0},&nbsp;{/if}({v.x},&nbsp;{v.y},&nbsp;{v.z}){/each}]
        </p>
        <p class="note">并列最优中按 (x, y, z) 排序后的字典序最小解。</p>
      {:else if failCell}
        <h2>❌ 无解</h2>
        <p>
          首个无支撑的投影格：<strong>{PLANE_NAME[failCell.plane]}</strong> 平面第
          {failCell.row} 行、第 {failCell.col} 列（已在上方投影图中红框标出）——
          该格为 1，但没有任何候选体素能覆盖它。
        </p>
      {/if}
    </section>
  {:else}
    <section class="panel placeholder">
      结论已清除。编辑投影后点击「重建最少体素模型」重新求解。
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 1080px;
    margin: 0 auto;
    padding: 24px 16px 48px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  header h1 {
    margin: 0 0 6px;
    font-size: 22px;
    color: #0f172a;
  }
  .hint {
    margin: 0;
    font-size: 13px;
    color: #64748b;
    line-height: 1.7;
  }
  .panel {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px 18px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 18px;
  }
  .dims {
    display: flex;
    gap: 12px;
  }
  .dims label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #334155;
  }
  select {
    font: inherit;
    padding: 4px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #fff;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  button {
    font: inherit;
    font-size: 13px;
    padding: 7px 14px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
    color: #334155;
    cursor: pointer;
  }
  button:hover {
    background: #eef2f7;
  }
  button.primary {
    background: #2563eb;
    border-color: #1d4ed8;
    color: #fff;
    font-weight: 600;
  }
  button.primary:hover {
    background: #1d4ed8;
  }
  .chk {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #334155;
  }
  .stat {
    font-size: 13px;
    color: #64748b;
  }
  .boards {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
  }
  .grids {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  .grids :global(.mask),
  .boards :global(.iso-view) {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px 18px 16px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  }
  .result h2 {
    margin: 0 0 8px;
    font-size: 17px;
    color: #15803d;
  }
  .result.fail h2 {
    color: #dc2626;
  }
  .result p {
    margin: 4px 0;
    font-size: 14px;
    color: #334155;
  }
  .voxels {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 13px;
    word-break: break-all;
  }
  .note {
    font-size: 12px !important;
    color: #94a3b8 !important;
  }
  .placeholder {
    font-size: 13px;
    color: #94a3b8;
    text-align: center;
  }
</style>
