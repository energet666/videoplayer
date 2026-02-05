<script>
  let { videoSrc } = $props();
  let videoElement;

  function handleLoadedMetadata() {
    if (videoElement) {
      const width = videoElement.videoWidth;
      const height = videoElement.videoHeight;
      console.log(`Video metadata loaded. Dimensions: ${width}x${height}`);
      console.log(`Electron API available: ${!!window.electronAPI}`);

      // Call Electron API to resize window
      if (window.electronAPI) {
        console.log("Sending resize-window command...");
        window.electronAPI.resizeWindow(width, height);
      } else {
        console.warn("Electron API is not available. Resize command skipped.");
      }
    }
  }
</script>

<video
  bind:this={videoElement}
  src={videoSrc}
  controls
  autoplay
  class="w-full h-full object-contain bg-black"
  onloadedmetadata={handleLoadedMetadata}
>
  <track kind="captions" />
</video>

<style>
  video {
    outline: none;
  }
</style>
