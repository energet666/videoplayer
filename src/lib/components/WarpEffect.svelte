<!--
  WarpEffect.svelte — Эффект горизонтального движения (speed lines)
  Частицы движутся справа налево (фон), показывая движение вперёд
  Располагаются только в верхней и нижней части экрана

  Показывается при ускорении ×16 (удержание → или правой трети кадра), поэтому
  эффект намеренно плотный и быстрый: на ×2 он выглядел бы громче, чем сама
  картинка, а на ×16 — ровно по скорости происходящего.
-->
<script lang="ts">
  import { fade } from 'svelte/transition';
  
  let { isActive }: { isActive: boolean } = $props();
</script>

{#if isActive}
  <div 
    class="absolute inset-0 pointer-events-none overflow-hidden"
    transition:fade={{ duration: 180 }}
  >
    <!-- Голубое свечение сверху -->
    <div class="blue-glow top-glow"></div>
    
    <!-- Голубое свечение снизу -->
    <div class="blue-glow bottom-glow"></div>
    
    <!-- Верхняя зона: частицы движутся справа налево -->
    <div class="speed-zone top-zone">
      {#each Array(24) as _, i}
        <div
          class="speed-line"
          style="--top: {Math.random() * 100}%; --width: {110 + Math.random() * 240}px; --delay: {Math.random() * 0.6}s; --duration: {0.34 + Math.random() * 0.3}s"
        ></div>
      {/each}
    </div>
    
    <!-- Нижняя зона: частицы движутся справа налево -->
    <div class="speed-zone bottom-zone">
      {#each Array(24) as _, i}
        <div
          class="speed-line"
          style="--top: {Math.random() * 100}%; --width: {110 + Math.random() * 240}px; --delay: {Math.random() * 0.6}s; --duration: {0.34 + Math.random() * 0.3}s"
        ></div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .blue-glow {
    position: absolute;
    left: 0;
    right: 0;
    height: 22%;
    pointer-events: none;
    animation: glowPulse 2.4s ease-in-out infinite;
  }

  .top-glow {
    top: 0;
    background: linear-gradient(
      180deg,
      rgba(110, 188, 255, 0.19) 0%,
      rgba(80, 160, 240, 0.1) 50%,
      transparent 100%
    );
  }

  .bottom-glow {
    bottom: 0;
    background: linear-gradient(
      0deg,
      rgba(110, 188, 255, 0.19) 0%,
      rgba(80, 160, 240, 0.1) 50%,
      transparent 100%
    );
    animation-delay: 0.8s;
  }

  @keyframes glowPulse {
    0%, 100% {
      opacity: 0.75;
    }
    50% {
      opacity: 1;
    }
  }

  .speed-zone {
    position: absolute;
    left: 0;
    right: 0;
    height: 20%;
    overflow: hidden;
  }

  .top-zone {
    top: 0;
  }

  .bottom-zone {
    bottom: 0;
  }

  .speed-line {
    position: absolute;
    right: -400px;
    top: var(--top);
    width: var(--width);
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(200, 220, 255, 0.18) 40%,
      rgba(255, 255, 255, 0.42) 70%,
      rgba(200, 220, 255, 0.12) 100%
    );
    animation: speedMove var(--duration) linear infinite;
    animation-delay: var(--delay);
    filter: blur(1px);
  }

  @keyframes speedMove {
    0% {
      transform: translateX(0);
      opacity: 0;
    }
    10% {
      opacity: 0.6;
    }
    90% {
      opacity: 0.35;
    }
    100% {
      transform: translateX(calc(-100vw - 800px));
      opacity: 0;
    }
  }
</style>
