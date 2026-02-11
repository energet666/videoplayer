export class TouchpadHandler {
    private sensitivity = 0.05; // Seconds per pixel of delta

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

        // Calculate seek amount with inverted direction
        const seekAmount = -1 * e.deltaX * this.sensitivity;

        videoElement.currentTime = Math.max(
            0,
            Math.min(videoElement.duration, videoElement.currentTime + seekAmount)
        );

        this.context.onShowControls();
    }
}
