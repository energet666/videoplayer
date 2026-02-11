<script lang="ts">
  import { onMount } from "svelte";
  import VideoPlayer from "./lib/VideoPlayer.svelte";

  let videoSrc = $state<string | null>(null);
  let isDragging = $state(false);

  function loadVideo(url: string) {
    if (videoSrc && videoSrc.startsWith("blob:")) {
      URL.revokeObjectURL(videoSrc);
    }
    videoSrc = url;
  }

  onMount(async () => {
    if (window.electronAPI) {
      const initialFile = await window.electronAPI.getInitialFile();
      if (initialFile) {
        loadVideo(initialFile);
      }

      window.electronAPI.onOpenFile((fileURL) => {
        loadVideo(fileURL);
      });
    }
  });

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;

    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      const file = dt.files[0];
      // Check if video
      if (
        file.type.startsWith("video/") ||
        file.name.match(/\.(mp4|mkv|webm|mov|avi)$/i)
      ) {
        // Revoke previous URL if exists to free memory
        if (videoSrc && videoSrc.startsWith("blob:")) {
          URL.revokeObjectURL(videoSrc);
        }
        videoSrc = URL.createObjectURL(file);

        // Also update title if we wanted, but we have none.
      }
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    // Only set to false if we are leaving the window, not just entering a child
    if (e.relatedTarget === null) {
      isDragging = false;
    }
  }
</script>

<main
  class="w-screen h-screen bg-black overflow-hidden relative flex items-center justify-center text-white select-none"
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  role="application"
>
  {#if videoSrc}
    <div class="video-container w-full h-full relative group">
      <!-- Drag Handle: Top of the screen -->
      <div
        class="absolute top-0 left-0 w-full h-16 z-50 transition-opacity opacity-0 group-hover:opacity-100 bg-gradient-to-b from-black/50 to-transparent"
        style="-webkit-app-region: drag;"
      ></div>

      <VideoPlayer {videoSrc} />
    </div>
  {:else}
    <!-- Empty State -->

    <!-- Title Bar / Drag Handle (Top Only, allowing Drop elsewhere) -->
    <div
      class="absolute top-0 left-0 w-full h-12 z-20"
      style="-webkit-app-region: drag;"
    ></div>

    <!-- Welcome Screen -->
    <div
      class="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none"
    >
      <div
        class="flex flex-col items-center gap-6 max-w-sm w-full px-6 transition-transform duration-300"
        class:scale-105={isDragging}
      >
        <!-- Drop Video Icon -->
        <div class="flex flex-col items-center">
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
              class="text-gray-600"
            />
            <!-- Sprocket holes left -->
            <rect
              x="14"
              y="17"
              width="5"
              height="4"
              rx="1"
              fill="currentColor"
              class="text-gray-600"
            />
            <rect
              x="14"
              y="25"
              width="5"
              height="4"
              rx="1"
              fill="currentColor"
              class="text-gray-600"
            />
            <rect
              x="14"
              y="33"
              width="5"
              height="4"
              rx="1"
              fill="currentColor"
              class="text-gray-600"
            />
            <rect
              x="14"
              y="41"
              width="5"
              height="4"
              rx="1"
              fill="currentColor"
              class="text-gray-600"
            />
            <!-- Sprocket holes right -->
            <rect
              x="61"
              y="17"
              width="5"
              height="4"
              rx="1"
              fill="currentColor"
              class="text-gray-600"
            />
            <rect
              x="61"
              y="25"
              width="5"
              height="4"
              rx="1"
              fill="currentColor"
              class="text-gray-600"
            />
            <rect
              x="61"
              y="33"
              width="5"
              height="4"
              rx="1"
              fill="currentColor"
              class="text-gray-600"
            />
            <rect
              x="61"
              y="41"
              width="5"
              height="4"
              rx="1"
              fill="currentColor"
              class="text-gray-600"
            />
            <!-- Play triangle -->
            <path
              d="M35 26 L35 42 L49 34 Z"
              fill="currentColor"
              class="text-gray-500"
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
              class="text-gray-500"
              class:text-blue-400={isDragging}
            />
            <polyline
              points="33,65 40,72 47,65"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="text-gray-500"
              class:text-blue-400={isDragging}
            />
          </svg>
        </div>

        <!-- Divider -->
        <div class="w-full border-t border-gray-800"></div>

        <!-- Keyboard Shortcuts -->
        <div class="w-full text-sm text-gray-500 space-y-2">
          <p
            class="text-gray-400 text-[11px] uppercase tracking-widest font-medium mb-3 text-center"
          >
            Управление
          </p>
          <div class="grid grid-cols-[90px_1fr] gap-x-5 gap-y-2.5 items-center">
            <div class="flex gap-1"><kbd class="flex-1">Space</kbd></div>
            <span>Пауза / Воспроизведение</span>

            <div class="flex gap-1"><kbd class="flex-1">Space</kbd></div>
            <span>Зажать — ускорение ×2</span>

            <div class="flex gap-1">
              <kbd class="flex-1">←</kbd><kbd class="flex-1">→</kbd>
            </div>
            <span>Перемотка ±1 сек</span>

            <div class="flex gap-1">
              <kbd class="flex-1">←</kbd><kbd class="flex-1">→</kbd>
            </div>
            <span>Зажать — быстрая перемотка</span>

            <div class="flex gap-1">
              <kbd class="flex-1">↑</kbd><kbd class="flex-1">↓</kbd>
            </div>
            <span>Скорость воспроизведения</span>

            <div
              class="flex justify-center items-center h-[28px] text-gray-400 font-mono text-sm"
            >
              2×клик
            </div>
            <span>Полноэкранный режим</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Background (Visual only) -->
    <div class="absolute inset-0 z-0 bg-neutral-950"></div>

    <!-- Drag overlay indication -->
    {#if isDragging}
      <div
        class="absolute inset-0 bg-blue-500/10 border-4 border-blue-500/30 z-50 pointer-events-none backdrop-blur-sm transition-all duration-300"
      ></div>
    {/if}
  {/if}
</main>

<style>
  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 28px;
    padding: 0 10px;
    font-size: 14px;
    text-align: center;
    background: linear-gradient(180deg, #2a2a2e 0%, #1e1e22 100%);
    border: 1px solid #3a3a40;
    border-bottom-width: 2px;
    border-radius: 6px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    color: #d4d4d8;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    white-space: nowrap;
  }
</style>
