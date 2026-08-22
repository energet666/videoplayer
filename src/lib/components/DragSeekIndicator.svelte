<!--
  ============================================================================
  DragSeekIndicator.svelte — Индикатор перемотки жестом
  ============================================================================
  Показывается над панелью управления при любой перемотке: драг мышью, свайп
  по тачпаду, удержание ←/→ или крайних зон кадра, двойной клик по половине
  кадра (удержание пробела и центра — ускорение ×2, не перемотка, там
  индикатора нет):
  крупно — смещение относительно точки начала жеста ("+1:23"),
  мельче — время, к которому ведём ("14:05").
  pointer-events-none — не мешает самому жесту.
  ============================================================================
-->

<script lang="ts">
    import { formatTime } from "../utils";

    let {
        isActive, // Идёт ли перемотка жестом (мышь, тачпад, удержание)?
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

<!-- Бейдж над панелью управления: полупрозрачный фон с blur, как у остальных
     индикаторов. pb-32 — отступ от низа кадра: панель стоит на bottom-8 и
     занимает около 3.5rem, так что бейдж встаёт вплотную над ней, не перекрывая -->
<div
    class="absolute inset-0 flex items-end justify-center pb-32 pointer-events-none z-20 transition-opacity duration-150"
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
