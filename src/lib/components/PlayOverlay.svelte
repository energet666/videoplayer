<!--
  ============================================================================
  PlayOverlay.svelte — Большая кнопка Play по центру экрана
  ============================================================================
  Отображается поверх видео, когда оно на паузе.
  Плавно появляется/исчезает вместе с контролами (opacity).
  pointer-events-none — кнопка не перехватывает клики,
  клик по видео обрабатывается в VideoPlayer.svelte.
  ============================================================================
-->

<script lang="ts">
    import { icons } from "../icons";

    // showControls — видны ли контролы? Кнопка Play видна только вместе с ними.
    let { showControls }: { showControls: boolean } = $props();
</script>

<!-- Оверлей с кнопкой Play по центру -->
<div
    class="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300"
    class:opacity-0={!showControls}
>
    <!-- Круглая кнопка с полупрозрачным фоном и иконкой ▶ -->
    <div
        class="bg-black/30 p-6 rounded-full text-white/90 shadow-2xl transition-transform scale-100"
    >
        {@html icons.play}
    </div>
</div>
