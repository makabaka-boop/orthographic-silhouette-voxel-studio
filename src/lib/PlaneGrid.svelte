<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let title: string;
  export let axisH: string; // 横轴（第一轴）名称
  export let axisV: string; // 纵轴（第二轴）名称
  export let na: number;
  export let nb: number;
  export let grid: boolean[][]; // grid[i][j]

  const dispatch = createEventDispatcher<{ toggle: { i: number; j: number } }>();

  const cell = 38;
  const padL = 30;
  const padT = 10;
  const padR = 10;
  const padB = 30;

  $: w = padL + na * cell + padR;
  $: h = padT + nb * cell + padB;
</script>

<figure class="plane">
  <figcaption>{title} <span class="dims">{na}×{nb}</span></figcaption>
  <svg width={w} {h} viewBox="0 0 {w} {h}">
    {#each Array(na) as _, i}
      {#each Array(nb) as _, j}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <g class="cell" on:click={() => dispatch('toggle', { i, j })}>
          <rect
            x={padL + i * cell + 1.5}
            y={padT + (nb - 1 - j) * cell + 1.5}
            width={cell - 3}
            height={cell - 3}
            rx="6"
            class:filled={grid[i][j]}
          />
          <text
            x={padL + i * cell + cell / 2}
            y={padT + (nb - 1 - j) * cell + cell / 2 + 5}
            class:on={grid[i][j]}>{grid[i][j] ? 1 : 0}</text
          >
        </g>
      {/each}
    {/each}

    {#each Array(na) as _, i}
      <text class="tick" x={padL + i * cell + cell / 2} y={padT + nb * cell + 17}>{i}</text>
    {/each}
    {#each Array(nb) as _, j}
      <text class="tick" x={padL - 11} y={padT + (nb - 1 - j) * cell + cell / 2 + 4}>{j}</text>
    {/each}
    <text class="axis" x={padL + (na * cell) / 2} y={h - 5}>{axisH} →</text>
    <text class="axis" x="12" y={padT + (nb * cell) / 2} transform="rotate(-90 12 {padT + (nb * cell) / 2})">
      {axisV} →
    </text>
  </svg>
</figure>

<style>
  .plane {
    margin: 0;
    background: #fff;
    border: 1px solid #dbe2ec;
    border-radius: 10px;
    padding: 10px 12px 6px;
  }
  figcaption {
    font-weight: 600;
    font-size: 14px;
    color: #1e293b;
    margin-bottom: 2px;
  }
  .dims {
    font-weight: 400;
    color: #64748b;
    font-size: 12px;
  }
  .cell {
    cursor: pointer;
  }
  .cell rect {
    fill: #f1f5f9;
    stroke: #cbd5e1;
    stroke-width: 1;
    transition: fill 0.1s;
  }
  .cell:hover rect {
    stroke: #3b82f6;
  }
  .cell rect.filled {
    fill: #3b82f6;
    stroke: #1d4ed8;
  }
  .cell text {
    font-size: 13px;
    text-anchor: middle;
    fill: #94a3b8;
    pointer-events: none;
    user-select: none;
  }
  .cell text.on {
    fill: #fff;
    font-weight: 700;
  }
  .tick {
    font-size: 10px;
    text-anchor: middle;
    fill: #94a3b8;
  }
  .axis {
    font-size: 11px;
    text-anchor: middle;
    fill: #475569;
    font-weight: 600;
  }
</style>
