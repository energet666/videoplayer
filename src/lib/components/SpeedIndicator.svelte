<!--
  ============================================================================
  SpeedIndicator.svelte — Индикатор скорости воспроизведения
  ============================================================================
  Показывает текущую скорость (например "1.5x", "2x") в правом верхнем углу.
  Появляется на 500мс при изменении скорости стрелками ↑↓.
  pointer-events-none — не мешает взаимодействию с видео.
  ============================================================================
-->

<script lang="ts">
    let {
        showSpeedIndicator, // Показывать ли индикатор сейчас?
        userPlaybackRate, // Текущая скорость воспроизведения
    }: { showSpeedIndicator: boolean; userPlaybackRate: number } = $props();
</script>

<!-- Индикатор скорости: полупрозрачный бейдж с blur-эффектом -->
<div
    class="absolute top-8 right-8 bg-black/50 backdrop-blur-md text-white/90 px-4 py-2 rounded-lg text-lg font-medium transition-opacity duration-200 pointer-events-none"
    class:opacity-0={!showSpeedIndicator}
    class:opacity-100={showSpeedIndicator}
>
    {userPlaybackRate}x
</div>
