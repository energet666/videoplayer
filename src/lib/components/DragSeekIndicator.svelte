<!--
  ============================================================================
  DragSeekIndicator.svelte — Индикатор перемотки перетаскиванием мыши
  ============================================================================
  Показывается по центру экрана, пока пользователь тащит мышь по видео:
  крупно — смещение относительно точки начала жеста ("+1:23"),
  мельче — время, к которому ведём ("14:05").
  pointer-events-none — не мешает самому жесту.
  ============================================================================
-->

<script lang="ts">
    import { formatTime } from "../utils";

    let {
        isActive, // Идёт ли перемотка перетаскиванием?
        deltaSeconds, // Смещение от точки начала жеста (может быть отрицательным)
        targetTime, // Время, к которому перематываем
    }: {
        isActive: boolean;
        deltaSeconds: number;
        targetTime: number;
    } = $props();

    // Знак смещения показываем явно, formatTime не умеет в отрицательные числа
    let sign = $derived(deltaSeconds < 0 ? "−" : "+");
</script>

<!-- Бейдж по центру: полупрозрачный фон с blur, как у остальных индикаторов -->
<div
    class="absolute inset-0 flex items-center justify-center pointer-events-none z-20 transition-opacity duration-150"
    class:opacity-0={!isActive}
>
    <div
        class="bg-black/50 backdrop-blur-md text-white/90 px-6 py-3 rounded-xl flex flex-col items-center gap-1"
    >
        <span class="text-2xl font-semibold tabular-nums"
            >{sign}{formatTime(Math.abs(deltaSeconds))}</span
        >
        <span class="text-sm text-white/60 tabular-nums"
            >{formatTime(targetTime)}</span
        >
    </div>
</div>
