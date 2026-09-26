<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /** 单张二值投影的可编辑网格：点击切换 0/1，按住拖动连续绘制 */
  export let title: string;
  export let rows: number;
  export let cols: number;
  export let matrix: boolean[][];
  export let rowAxis: string;
  export let colAxis: string;
  export let highlight: { row: number; col: number } | null = null;

  const dispatch = createEventDispatcher<{
    change: { row: number; col: number; value: boolean };
  }>();

  const CELL = 30;
  const PAD = 24;

  let painting = false;
  let paintValue = true;

  function pointerDown(r: number, c: number) {
    paintValue = !matrix[r][c];
    painting = true;
    dispatch('change', { row: r, col: c, value: paintValue });
  }

  function pointerEnter(r: number, c: number) {
    if (painting && matrix[r][c] !== paintValue) {
      dispatch('change', { row: r, col: c, value: paintValue });
    }
  }
</script>

<svelte:window on:pointerup={() => (painting = false)} />

<figure class="mask">
  <figcaption>{title}</figcaption>
  <svg
    width={cols * CELL + PAD + 8}
    height={rows * CELL + PAD + 8}
    role="grid"
    aria-label={title}
  >
    {#each Array(cols) as _, c}
      <text class="axis" x={PAD + c * CELL + CELL / 2} y={PAD - 9} text-anchor="middle">
        {colAxis}{c}
      </text>
    {/each}
    {#each Array(rows) as _, r}
      <text class="axis" x={PAD - 9} y={PAD + r * CELL + CELL / 2 + 4} text-anchor="end">
        {rowAxis}{r}
      </text>
    {/each}
    {#each matrix as row, r}
      {#each row as on, c}
        <rect
          x={PAD + c * CELL + 1}
          y={PAD + r * CELL + 1}
          width={CELL - 2}
          height={CELL - 2}
          rx="5"
          class:filled={on}
          class:bad={highlight !== null && highlight.row === r && highlight.col === c}
          on:pointerdown={() => pointerDown(r, c)}
          on:pointerenter={() => pointerEnter(r, c)}
        />
      {/each}
    {/each}
  </svg>
</figure>

<style>
  .mask {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  figcaption {
    font-size: 13px;
    font-weight: 600;
    color: #475569;
  }
  svg {
    user-select: none;
    touch-action: none;
  }
  .axis {
    font-size: 10px;
    fill: #94a3b8;
    font-family: ui-monospace, monospace;
  }
  rect {
    fill: #e8edf3;
    stroke: #cbd5e1;
    cursor: pointer;
    transition: fill 0.08s;
  }
  rect:hover {
    stroke: #64748b;
  }
  rect.filled {
    fill: #2563eb;
    stroke: #1d4ed8;
  }
  rect.bad {
    fill: #fecaca;
    stroke: #dc2626;
    stroke-width: 2.5;
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      stroke-opacity: 0.35;
    }
  }
</style>
