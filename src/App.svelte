<script lang="ts">
  import { onMount } from "svelte";
  import VideoPlayer from "./lib/VideoPlayer.svelte";

  let videoSrc = $state<string | null>(null);
  let isDragging = $state(false);

  function loadVideoFromFilePath(path: string) {
    if (videoSrc && videoSrc.startsWith("blob:")) {
      URL.revokeObjectURL(videoSrc);
    }
    // file:// protocol is needed for local files in Electron.
    // Encode the path to handle spaces and special characters.
    // We replace # and ? manually because encodeURI doesn't touch them.
    const encodedPath = encodeURI(path)
      .replace(/#/g, "%23")
      .replace(/\?/g, "%3F");
    videoSrc = `file://${encodedPath}`;
  }

  onMount(async () => {
    if (window.electronAPI) {
      const initialFile = await window.electronAPI.getInitialFile();
      if (initialFile) {
        loadVideoFromFilePath(initialFile);
      }

      window.electronAPI.onOpenFile((path) => {
        loadVideoFromFilePath(path);
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

    <!-- Drop Zone (Non-Draggable) -->
    <div
      class="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none"
    >
      <div
        class="border-2 border-dashed border-gray-600 rounded-xl p-12 bg-gray-900/50 backdrop-blur-sm transition-colors duration-300 transform scale-100"
        class:bg-gray-800={isDragging}
        class:scale-105={isDragging}
      >
        <h1 class="text-3xl font-light mb-2 tracking-wider text-gray-200">
          Drag & Drop
        </h1>
        <p class="text-gray-500 text-xs uppercase tracking-widest text-center">
          Video File Here
        </p>
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
