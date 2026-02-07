export class TouchpadHandler {
    private sensitivity = 0.05; // Seconds per pixel of delta
    private isProcessing = false;

    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private context: {
            onShowControls: () => void;
        }
    ) { }

    handleWheel(e: WheelEvent) {
        // We only care about horizontal scrolling (touchpad swipe)
        // Check if deltaX is significantly larger than deltaY
        if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;

        // Prevent default browser navigation (history back/forward)
        e.preventDefault();

        const videoElement = this.getVideo();
        if (!videoElement) return;

        // Calculate seek amount
        // deltaX > 0 means swipe left (move forward in content -> forward in time)
        // deltaX < 0 means swipe right (move backward in content -> backward in time)
        const seekAmount = e.deltaX * this.sensitivity;

        videoElement.currentTime = Math.max(
            0,
            Math.min(videoElement.duration, videoElement.currentTime + seekAmount)
        );

        this.context.onShowControls();
    }
}
