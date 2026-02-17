<!--
  ============================================================================
  DropVideoIcon.svelte — Иконка «Перетащите видео»
  ============================================================================
  SVG-иконка кинопленки со стрелкой вниз на экране приветствия.
  При isDragging=true (файл перетаскивается) — стрелка и корпус
  окрашиваются в синий цвет (text-blue-400).
  ============================================================================
-->

<script lang="ts">
    // isDragging — файл перетаскивается над окном? (меняет цвет иконки)
    let { isDragging = false }: { isDragging?: boolean } = $props();
</script>

<svg
    class="w-20 h-20 transition-colors duration-300"
    class:text-blue-400={isDragging}
    viewBox="0 0 80 80"
    fill="none"
>
    <!-- Film strip body -->
    <rect
        x="10"
        y="12"
        width="60"
        height="44"
        rx="4"
        stroke="currentColor"
        stroke-width="2"
        class="text-zinc-400 dark:text-zinc-600"
    />
    <!-- Sprocket holes left -->
    <rect
        x="14"
        y="17"
        width="5"
        height="4"
        rx="1"
        fill="currentColor"
        class="text-zinc-400 dark:text-zinc-600"
    />
    <rect
        x="14"
        y="25"
        width="5"
        height="4"
        rx="1"
        fill="currentColor"
        class="text-zinc-400 dark:text-zinc-600"
    />
    <rect
        x="14"
        y="33"
        width="5"
        height="4"
        rx="1"
        fill="currentColor"
        class="text-zinc-400 dark:text-zinc-600"
    />
    <rect
        x="14"
        y="41"
        width="5"
        height="4"
        rx="1"
        fill="currentColor"
        class="text-zinc-400 dark:text-zinc-600"
    />
    <!-- Sprocket holes right -->
    <rect
        x="61"
        y="17"
        width="5"
        height="4"
        rx="1"
        fill="currentColor"
        class="text-zinc-400 dark:text-zinc-600"
    />
    <rect
        x="61"
        y="25"
        width="5"
        height="4"
        rx="1"
        fill="currentColor"
        class="text-zinc-400 dark:text-zinc-600"
    />
    <rect
        x="61"
        y="33"
        width="5"
        height="4"
        rx="1"
        fill="currentColor"
        class="text-zinc-400 dark:text-zinc-600"
    />
    <rect
        x="61"
        y="41"
        width="5"
        height="4"
        rx="1"
        fill="currentColor"
        class="text-zinc-400 dark:text-zinc-600"
    />
    <!-- Play triangle -->
    <path
        d="M35 26 L35 42 L49 34 Z"
        fill="currentColor"
        class="text-zinc-500 dark:text-zinc-500"
    />
    <!-- Arrow down -->
    <line
        x1="40"
        y1="52"
        x2="40"
        y2="72"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        class="text-zinc-500 dark:text-zinc-400"
        class:text-blue-400={isDragging}
    />
    <polyline
        points="33,65 40,72 47,65"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-zinc-500 dark:text-zinc-400"
        class:text-blue-400={isDragging}
    />
</svg>
