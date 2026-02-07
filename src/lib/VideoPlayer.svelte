<script>
  import { onMount, onDestroy } from "svelte";

  let { videoSrc } = $props();
  let videoElement;

  // Video state
  let paused = $state(true);
  let duration = $state(0);
  let currentTime = $state(0);
  let volume = $state(1);
  let lastVolume = $state(1);
  let isMuted = $state(false);

  // Playback Speed State
  let userPlaybackRate = $state(1.0);
  const availableSpeeds = [1.0, 1.25, 1.5, 2.0];

  // UI state
  let showControls = $state(false);
  let isDragging = $state(false);
  let controlsTimeout;

  // Speed Indicator State
  let showSpeedIndicator = $state(false);
  let speedIndicatorTimeout;

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
    if (!isDragging) {
      controlsTimeout = setTimeout(() => {
        showControls = false;
      }, 1000);
    }
  }

  function handleVolumeChange(e) {
    volume = parseFloat(e.target.value);
    videoElement.volume = volume;
    isMuted = volume === 0;
  }

  function toggleMute() {
    if (isMuted) {
      volume = lastVolume || 1;
      videoElement.volume = volume;
      isMuted = false;
    } else {
      lastVolume = volume;
      videoElement.volume = 0;
      volume = 0;
      isMuted = true;
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      videoElement.parentNode.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  function onEnd() {
    paused = true;
    showControls = true;
  }

  // Keyboard controls state
  // Space (Play/Pause/Speed)
  let isSpaceDown = false;
  let spaceTimer;
  let isSpaceLongPress = false;

  // Arrows (Seek)
  let isArrowDown = false;
  let arrowTimer;
  let seekInterval;
  let rewindRequest;
  let isArrowLongPress = false;

  function handleKeyDown(e) {
    // Space Logic
    if (e.code === "Space") {
      e.preventDefault();
      if (isSpaceDown) return;
      isSpaceDown = true;
      isSpaceLongPress = false;

      spaceTimer = setTimeout(() => {
        if (!videoElement) return;
        videoElement.playbackRate = 2.0;
        isSpaceLongPress = true;
        // If long press activates, ensure we are playing
        if (videoElement.paused) {
          videoElement.play();
        }
      }, 200);
      return;
    }

    // Arrow Logic: Seek and Speed
    if (e.code.startsWith("Arrow")) {
      e.preventDefault();

      // Speed Control (Up/Down)
      if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        if (!videoElement) return;
        const currentIndex = availableSpeeds.indexOf(userPlaybackRate);
        let newIndex = currentIndex;

        if (e.code === "ArrowUp") {
          newIndex = Math.min(availableSpeeds.length - 1, currentIndex + 1);
        } else {
          newIndex = Math.max(0, currentIndex - 1);
        }

        if (newIndex !== currentIndex) {
          userPlaybackRate = availableSpeeds[newIndex];
          videoElement.playbackRate = userPlaybackRate;

          // Show speed indicator
          showSpeedIndicator = true;
          clearTimeout(speedIndicatorTimeout);
          speedIndicatorTimeout = setTimeout(() => {
            showSpeedIndicator = false;
          }, 500);
        }
        return;
      }

      // Seek Logic (Left/Right)
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        if (isArrowDown) return;
        isArrowDown = true;
        isArrowLongPress = false;

        const isRight = e.code === "ArrowRight";

        arrowTimer = setTimeout(() => {
          // Disable rewind on hold (Left Arrow) per user request
          // if (!isRight) return; -> Removed to enable rewind

          isArrowLongPress = true;
          showControls = true;
          clearTimeout(controlsTimeout);

          if (!videoElement) return;

          if (isRight) {
            // 16x Forward
            videoElement.playbackRate = 16.0;
            if (videoElement.paused) videoElement.play();
          } else {
            // Rewind: Jump back 3s every 300ms
            const doRewind = () => {
              videoElement.currentTime = Math.max(
                0,
                videoElement.currentTime - 3,
              );
            };
            doRewind(); // Immediate execution
            seekInterval = setInterval(doRewind, 300);
          }
        }, 200);
      }
    }
  }

  function handleKeyUp(e) {
    // Space Logic
    if (e.code === "Space") {
      e.preventDefault();
      isSpaceDown = false;
      clearTimeout(spaceTimer);

      if (isSpaceLongPress) {
        if (videoElement) {
          videoElement.playbackRate = userPlaybackRate;
        }
      } else {
        togglePlay();
      }
      return;
    }

    // Arrow Logic
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      e.preventDefault();
      // Only handle if this was the active arrow action
      if (!isArrowDown) return;

      isArrowDown = false;
      clearTimeout(arrowTimer);
      clearInterval(seekInterval);
      if (rewindRequest) cancelAnimationFrame(rewindRequest);

      if (!isArrowLongPress) {
        // Short press action: 1s jump
        if (videoElement) {
          const isRight = e.code === "ArrowRight";
          const direction = isRight ? 1 : -1;
          videoElement.currentTime = Math.max(
            0,
            Math.min(duration, videoElement.currentTime + direction),
          );
        }
      } else {
        // Long press release - Restore normal speed
        if (videoElement) {
          videoElement.playbackRate = userPlaybackRate;
          if (videoElement.paused) videoElement.play();
        }
        handleMouseMove(); // Reset controls timeout
      }
    }
  }

  // Cleanup timeout on destroy
  onDestroy(() => {
    clearTimeout(controlsTimeout);
    clearTimeout(spaceTimer);
    clearTimeout(arrowTimer);
    clearTimeout(speedIndicatorTimeout);
    clearInterval(seekInterval);
    if (rewindRequest) cancelAnimationFrame(rewindRequest);
  });
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<!-- Container triggers controls visibility -->
<div
  class="relative w-full h-full bg-black group overflow-hidden"
  class:cursor-none={!showControls}
  role="application"
  ondblclick={toggleFullscreen}
  onmousemove={handleMouseMove}
  onmouseleave={() => {
    showControls = false;
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
      class="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300"
      class:opacity-0={!showControls}
    >
      <div
        class="bg-black/30 p-6 rounded-full text-white/90 shadow-2xl transition-transform scale-100"
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

  <!-- Speed Indicator (Top Right) -->
  <div
    class="absolute top-8 right-8 bg-black/50 backdrop-blur-md text-white/90 px-4 py-2 rounded-lg text-lg font-medium transition-opacity duration-200 pointer-events-none"
    class:opacity-0={!showSpeedIndicator}
    class:opacity-100={showSpeedIndicator}
  >
    {userPlaybackRate}x
  </div>

  <!-- Bottom Controls Bar -->
  <div
    class="absolute bottom-8 left-0 right-0 flex justify-center items-end px-4 pb-4 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
    class:translate-y-48={!showControls}
    class:translate-y-0={showControls}
    class:pointer-events-none={!showControls}
  >
    <!-- Liquid Glass Panel -->
    <div
      class="bg-black/40 backdrop-blur-2xl backdrop-saturate-150 rounded-3xl py-3 px-6 flex flex-row items-center gap-5 border border-white/10 shadow-2xl w-full max-w-2xl transform-gpu"
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
