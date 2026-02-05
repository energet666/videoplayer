<script>
  import { onMount, onDestroy } from "svelte";

  let { videoSrc } = $props();
  let videoElement;

  // Video state
  let paused = $state(true);
  let duration = $state(0);
  let currentTime = $state(0);
  let volume = $state(1);
  let isMuted = $state(false);

  // UI state
  let showControls = $state(false);
  let isDragging = $state(false);
  let controlsTimeout;

  function handleLoadedMetadata() {
    if (videoElement) {
      const width = videoElement.videoWidth;
      const height = videoElement.videoHeight;
      console.log(`Video metadata loaded. Dimensions: ${width}x${height}`);

      if (window.electronAPI) {
        window.electronAPI.resizeWindow(width, height);
      }
    }
  }

  function formatTime(seconds) {
    if (!seconds && seconds !== 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function togglePlay() {
    if (videoElement.paused) {
      videoElement.play();
    } else {
      videoElement.pause();
    }
  }

  function handleSeek(e) {
    const time = parseFloat(e.target.value);
    videoElement.currentTime = time;
  }

  function handleMouseMove() {
    showControls = true;
    clearTimeout(controlsTimeout);
    if (!paused && !isDragging) {
      controlsTimeout = setTimeout(() => {
        showControls = false;
      }, 2500);
    }
  }

  function handleVolumeChange(e) {
    volume = parseFloat(e.target.value);
    videoElement.volume = volume;
    isMuted = volume === 0;
  }

  function toggleMute() {
    if (isMuted) {
      videoElement.volume = 1;
      volume = 1;
      isMuted = false;
    } else {
      videoElement.volume = 0;
      volume = 0;
      isMuted = true;
    }
  }

  function onEnd() {
    paused = true;
    showControls = true;
  }

  // Cleanup timeout on destroy
  onDestroy(() => {
    clearTimeout(controlsTimeout);
  });
</script>

<!-- Container triggers controls visibility -->
<div
  class="relative w-full h-full bg-black group overflow-hidden"
  role="application"
  onmousemove={handleMouseMove}
  onmouseleave={() => {
    if (!paused) showControls = false;
  }}
>
  <!-- Main Video -->
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoElement}
    src={videoSrc}
    class="w-full h-full object-contain"
    bind:paused
    bind:duration
    bind:currentTime
    onloadedmetadata={handleLoadedMetadata}
    onended={onEnd}
    onclick={togglePlay}
    autoplay
  ></video>

  <!-- Big Center Play Button (only when paused) -->
  {#if paused}
    <div
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      <div
        class="bg-black/30 backdrop-blur-sm p-6 rounded-full text-white/90 shadow-2xl transition-transform scale-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polygon points="7 3 21 12 7 21 7 3"></polygon>
        </svg>
      </div>
    </div>
  {/if}

  <!-- Bottom Controls Bar -->
  <div
    class="absolute bottom-0 left-0 right-0 p-4 transition-opacity duration-300 ease-in-out bg-linear-to-t from-black/80 to-transparent pt-12"
    class:opacity-0={!showControls && !paused}
    class:opacity-100={showControls || paused}
  >
    <!-- Glass Panel -->
    <div
      class="bg-white/10 backdrop-blur-md rounded-2xl p-3 flex flex-row items-center gap-4 border border-white/5 shadow-lg"
    >
      <!-- Play/Pause Button -->
      <button
        onclick={togglePlay}
        class="text-white/90 hover:text-white transition-colors focus:outline-none shrink-0"
      >
        {#if paused}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            ><polygon points="5 3 19 12 5 21 5 3"></polygon></svg
          >
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            ><rect x="6" y="4" width="4" height="16"></rect><rect
              x="14"
              y="4"
              width="4"
              height="16"
            ></rect></svg
          >
        {/if}
      </button>

      <!-- Current Time -->
      <span class="text-xs font-medium text-white/70 w-10 text-right shrink-0"
        >{formatTime(currentTime)}</span
      >

      <!-- Progress Bar -->
      <div class="relative flex-1 h-8 flex items-center group/slider">
        <input
          type="range"
          min="0"
          max={duration || 100}
          step="0.1"
          value={currentTime}
          oninput={handleSeek}
          onmousedown={() => (isDragging = true)}
          onmouseup={() => (isDragging = false)}
          class="absolute w-full h-full opacity-0 cursor-pointer z-10"
        />
        <!-- Track Background -->
        <div class="w-full h-1 bg-white/20 rounded-full overflow-hidden">
          <!-- Progress Fill -->
          <div
            class="h-full bg-white/90 rounded-full transition-all duration-75"
            style="width: {(currentTime / duration) * 100}%"
          ></div>
        </div>
        <!-- Thumb (Visual Only) -->
        <div
          class="absolute w-3 h-3 bg-white rounded-full shadow-md transition-opacity duration-200 pointer-events-none"
          style="left: {(currentTime / duration) *
            100}%; transform: translateX(-50%) scale({paused || showControls
            ? 1
            : 0});"
        ></div>
      </div>

      <!-- Duration -->
      <span class="text-xs font-medium text-white/50 w-10 shrink-0"
        >{formatTime(duration)}</span
      >

      <!-- Volume -->
      <div class="flex items-center gap-2 group/vol shrink-0">
        <button
          onclick={toggleMute}
          class="text-white/80 hover:text-white transition-colors"
        >
          {#if isMuted || volume === 0}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M11 5L6 9H2v6h4l5 4V5z" /><line
                x1="23"
                y1="9"
                x2="17"
                y2="15"
              /><line x1="17" y1="9" x2="23" y2="15" /></svg
            >
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"
              ></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path
                d="M19.07 4.93a10 10 0 0 1 0 14.14"
              ></path></svg
            >
          {/if}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          oninput={handleVolumeChange}
          class="w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 android-slider"
        />
      </div>
    </div>
  </div>
</div>

<style>
  /* Custom slider styles for webkit */
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
  }
</style>
