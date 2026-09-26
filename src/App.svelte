<script lang="ts">
  import { onMount } from 'svelte';
  import PlaneGrid from './lib/PlaneGrid.svelte';
  import IsoView from './lib/IsoView.svelte';
  import {
    solve,
    candidates,
    type SolveResult,
    type Grid,
    type PlaneId,
  } from './lib/solver';

  let nx = 3;
  let ny = 3;
  let nz = 3;

  const fill = (a: number, b: number, v: boolean): Grid =>
    Array.from({ length: a }, () => Array(b).fill(v));

  let xy: Grid = fill(3, 3, true);
  let xz: Grid = fill(3, 3, true);
  let yz: Grid = fill(3, 3, true);

  let result: SolveResult | null = null;
  let candCount = 0;

  // 任何编辑都清除旧结论
  function invalidate() {
    result = null;
  }

  function resize(g: Grid, a: number, b: number): Grid {
    return Array.from({ length: a }, (_, i) =>
      Array.from({ length: b }, (_, j) => g[i]?.[j] ?? false),
    );
  }

  function onDimsChange() {
    xy = resize(xy, nx, ny);
    xz = resize(xz, nx, nz);
    yz = resize(yz, ny, nz);
    invalidate();
  }

  function toggle(plane: PlaneId, i: number, j: number) {
    if (plane === 'xy') {
      xy[i][j] = !xy[i][j];
      xy = [...xy];
    } else if (plane === 'xz') {
      xz[i][j] = !xz[i][j];
      xz = [...xz];
    } else {
      yz[i][j] = !yz[i][j];
      yz = [...yz];
    }
    invalidate();
  }

  function rebuild() {
    const dims = { nx, ny, nz };
    result = solve(dims, xy, xz, yz);
    candCount = candidates(dims, xy, xz, yz).length;
  }

  onMount(rebuild);

  function cellDesc(plane: PlaneId, i: number, j: number): string {
    if (plane === 'xy') return `x=${i}, y=${j}`;
    if (plane === 'xz') return `x=${i}, z=${j}`;
    return `y=${i}, z=${j}`;
  }
</script>

<main>
  <header>
    <h1>三向投影体素重建</h1>
    <p>
      编辑 XY / XZ / YZ 三张二值正交投影（点击格子切换 0/1）。体素可占用的必要条件是三张投影对应格都为
      1，且每个为 1 的投影格都必须被覆盖。点击「重建」求<strong>占用体素数最少</strong>的模型；并列时取按
      (x,y,z) 排序后字典序最小的体素列表。任何编辑都会清除旧结论。
    </p>
  </header>

  <section class="controls">
    <label>X 尺寸
      <select bind:value={nx} on:change={onDimsChange}>
        <option value={2}>2</option>
        <option value={3}>3</option>
      </select>
    </label>
    <label>Y 尺寸
      <select bind:value={ny} on:change={onDimsChange}>
        <option value={2}>2</option>
        <option value={3}>3</option>
      </select>
    </label>
    <label>Z 尺寸
      <select bind:value={nz} on:change={onDimsChange}>
        <option value={2}>2</option>
        <option value={3}>3</option>
      </select>
    </label>
    <button on:click={rebuild}>重建</button>
  </section>

  <div class="layout">
    <section class="planes">
      <PlaneGrid
        title="XY 投影"
        axisH="x"
        axisV="y"
        na={nx}
        nb={ny}
        grid={xy}
        on:toggle={(e) => toggle('xy', e.detail.i, e.detail.j)}
      />
      <PlaneGrid
        title="XZ 投影"
        axisH="x"
        axisV="z"
        na={nx}
        nb={nz}
        grid={xz}
        on:toggle={(e) => toggle('xz', e.detail.i, e.detail.j)}
      />
      <PlaneGrid
        title="YZ 投影"
        axisH="y"
        axisV="z"
        na={ny}
        nb={nz}
        grid={yz}
        on:toggle={(e) => toggle('yz', e.detail.i, e.detail.j)}
      />
    </section>

    <section class="side">
      <IsoView voxels={result && result.ok ? result.voxels : null} dims={{ nx, ny, nz }} />

      <div class="result">
        {#if result === null}
          <p class="muted">投影已修改，旧结论已清除。点击「重建」重新求解。</p>
        {:else if result.ok}
          <p class="ok">
            ✅ 最少体素数：<strong>{result.voxels.length}</strong>
            <span class="muted">（候选体素 {candCount} 个）</span>
          </p>
          {#if result.voxels.length > 0}
            <ol class="voxels">
              {#each result.voxels as v}
                <li><code>({v.x}, {v.y}, {v.z})</code></li>
              {/each}
            </ol>
          {/if}
        {:else}
          <p class="bad">
            ❌ 无解：{result.unsupported.plane.toUpperCase()} 面格（{cellDesc(
              result.unsupported.plane,
              result.unsupported.i,
              result.unsupported.j,
            )}）为 1，但没有任何候选体素能覆盖它。
          </p>
        {/if}
      </div>
    </section>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f4f6fa;
    color: #1e293b;
    font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
  }
  main {
    max-width: 1060px;
    margin: 0 auto;
    padding: 24px 20px 48px;
  }
  header h1 {
    font-size: 22px;
    margin: 0 0 8px;
  }
  header p {
    margin: 0 0 16px;
    color: #475569;
    font-size: 13.5px;
    line-height: 1.7;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }
  .controls label {
    font-size: 13px;
    color: #475569;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  select {
    font-size: 14px;
    padding: 4px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #fff;
  }
  button {
    font-size: 14px;
    font-weight: 600;
    padding: 7px 22px;
    border: none;
    border-radius: 8px;
    background: #2563eb;
    color: #fff;
    cursor: pointer;
  }
  button:hover {
    background: #1d4ed8;
  }
  .layout {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 18px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  .planes {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .result {
    background: #fff;
    border: 1px solid #dbe2ec;
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 14px;
  }
  .result p {
    margin: 4px 0;
  }
  .ok {
    color: #15803d;
  }
  .bad {
    color: #b91c1c;
    line-height: 1.6;
  }
  .muted {
    color: #94a3b8;
    font-size: 13px;
  }
  .voxels {
    list-style: none;
    padding: 0;
    margin: 8px 0 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .voxels li {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    padding: 2px 8px;
  }
  .voxels code {
    font-size: 13px;
    color: #1e40af;
  }
</style>
