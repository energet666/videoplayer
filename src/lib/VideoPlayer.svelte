<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import PlayOverlay from "./components/PlayOverlay.svelte";
  import SpeedIndicator from "./components/SpeedIndicator.svelte";
  import VideoControls from "./components/VideoControls.svelte";
  import {
    safePlay,
    togglePlay,
    toggleFullscreen,
    togglePip,
  } from "./logic/video-actions";
  import { KeyboardHandler } from "./logic/keyboard.svelte";

  let { videoSrc }: { videoSrc: string | null } = $props();
  let videoElement: HTMLVideoElement = $state() as any; // $state() for element binding in Svelte 5

  // Video state
  let paused = $state(true);
  let duration = $state(0);
  let currentTime = $state(0);
  let volume = $state(1);

  // Playback Speed State
  let userPlaybackRate = $state(1.0);

  // UI state
  let showControls = $state(false);
  let isDragging = $state(false);
  let isMouseOverControls = $state(false);
  let controlsTimeout: ReturnType<typeof setTimeout>;

  // Speed Indicator State
  let showSpeedIndicator = $state(false);
  let speedIndicatorTimeout: ReturnType<typeof setTimeout>;

  // PiP State
  let isPip = $state(false);

  function handleMouseMove() {
    showControls = true;
    clearTimeout(controlsTimeout);
    if (!isDragging && !isMouseOverControls) {
      controlsTimeout = setTimeout(() => {
        showControls = false;
      }, 1000);
    }
  }

  // Initialize Keyboard Handler
  // We use a getter for videoElement because it might be undefined initially
  const keyboardHandler = new KeyboardHandler(() => videoElement, {
    getPlaybackRate: () => userPlaybackRate,
    setPlaybackRate: (rate) => {
      userPlaybackRate = rate;
    },
    getDuration: () => duration,
    onShowControls: handleMouseMove,
    onShowSpeedIndicator: () => {
      showSpeedIndicator = true;
      clearTimeout(speedIndicatorTimeout);
      speedIndicatorTimeout = setTimeout(() => {
        showSpeedIndicator = false;
      }, 500);
    },
  });

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

  function onEnd() {
    paused = true;
    showControls = true;
  }

  $effect(() => {
    if (!videoElement) return;

    const onEnterPiP = () => {
      isPip = true;
      window.electronAPI?.hideWindow();
    };
    const onLeavePiP = () => {
      isPip = false;
      window.electronAPI?.showWindow();
    };

    videoElement.addEventListener("enterpictureinpicture", onEnterPiP);
    videoElement.addEventListener("leavepictureinpicture", onLeavePiP);

    return () => {
      videoElement.removeEventListener("enterpictureinpicture", onEnterPiP);
      videoElement.removeEventListener("leavepictureinpicture", onLeavePiP);
    };
  });

  // Cleanup timeout on destroy
  onDestroy(() => {
    clearTimeout(controlsTimeout);
    clearTimeout(speedIndicatorTimeout);
    keyboardHandler.cleanup();
  });
</script>

<svelte:window
  onkeydown={(e) => keyboardHandler.handleKeyDown(e)}
  onkeyup={(e) => keyboardHandler.handleKeyUp(e)}
/>

<!-- Container triggers controls visibility -->
<div
  class="relative w-full h-full bg-black group overflow-hidden"
  class:cursor-none={!showControls}
  role="application"
  ondblclick={() => toggleFullscreen(videoElement)}
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
    bind:volume
    onloadedmetadata={handleLoadedMetadata}
    onended={onEnd}
    onclick={() => togglePlay(videoElement)}
    autoplay
  ></video>

  <!-- Big Center Play Button (only when paused) -->
  {#if paused}
    <PlayOverlay {showControls} />
  {/if}

  <!-- Speed Indicator (Top Right) -->
  <SpeedIndicator {showSpeedIndicator} {userPlaybackRate} />

  <!-- Bottom Controls Bar -->
  <VideoControls
    {showControls}
    bind:currentTime
    {duration}
    bind:volume
    bind:isDragging
    {paused}
    onPipToggle={() => togglePip(videoElement)}
    onHoverStart={() => {
      isMouseOverControls = true;
      clearTimeout(controlsTimeout);
    }}
    onHoverEnd={() => {
      isMouseOverControls = false;
      handleMouseMove();
    }}
  />
</div>
