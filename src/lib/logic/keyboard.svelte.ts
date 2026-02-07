import { safePlay, togglePlay } from "./video-actions";

export const availableSpeeds = [1.0, 1.25, 1.5, 2.0];

export class KeyboardHandler {
    // Space State
    private isSpaceDown = false;
    private spaceTimer: ReturnType<typeof setTimeout> | undefined;
    private isSpaceLongPress = false;

    // Arrow State
    private isArrowDown = false;
    private arrowTimer: ReturnType<typeof setTimeout> | undefined;
    private seekInterval: ReturnType<typeof setInterval> | undefined;
    private isArrowLongPress = false;

    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private context: {
            getPlaybackRate: () => number;
            setPlaybackRate: (rate: number) => void;
            getDuration: () => number;
            onShowControls: () => void;
            onShowSpeedIndicator: () => void;
        }
    ) { }

    handleKeyDown(e: KeyboardEvent) {
        const videoElement = this.getVideo();

        // Space Logic
        if (e.code === "Space") {
            e.preventDefault();
            if (this.isSpaceDown) return;
            this.isSpaceDown = true;
            this.isSpaceLongPress = false;

            this.spaceTimer = setTimeout(() => {
                if (!videoElement) return;
                videoElement.playbackRate = 2.0;
                this.isSpaceLongPress = true;
                // If long press activates, ensure we are playing
                if (videoElement.paused) {
                    safePlay(videoElement);
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
                const currentRate = this.context.getPlaybackRate();
                const currentIndex = availableSpeeds.indexOf(currentRate);
                let newIndex = currentIndex;

                if (e.code === "ArrowUp") {
                    newIndex = Math.min(availableSpeeds.length - 1, currentIndex + 1);
                } else {
                    newIndex = Math.max(0, currentIndex - 1);
                }

                if (newIndex !== currentIndex) {
                    const newRate = availableSpeeds[newIndex];
                    this.context.setPlaybackRate(newRate);
                    videoElement.playbackRate = newRate;

                    // Show speed indicator
                    this.context.onShowSpeedIndicator();
                }
                return;
            }

            // Seek Logic (Left/Right)
            if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
                if (this.isArrowDown) return;
                this.isArrowDown = true;
                this.isArrowLongPress = false;

                const isRight = e.code === "ArrowRight";

                this.arrowTimer = setTimeout(() => {
                    this.isArrowLongPress = true;
                    this.context.onShowControls();

                    if (!videoElement) return;

                    if (isRight) {
                        // 16x Forward
                        videoElement.playbackRate = 16.0;
                        if (videoElement.paused) safePlay(videoElement);
                    } else {
                        // Rewind: Jump back 3s every 300ms
                        const doRewind = () => {
                            videoElement.currentTime = Math.max(
                                0,
                                videoElement.currentTime - 3,
                            );
                        };
                        doRewind(); // Immediate execution
                        this.seekInterval = setInterval(doRewind, 300);
                    }
                }, 200);
            }
        }
    }

    handleKeyUp(e: KeyboardEvent) {
        const videoElement = this.getVideo();

        // Space Logic
        if (e.code === "Space") {
            e.preventDefault();
            this.isSpaceDown = false;
            clearTimeout(this.spaceTimer);

            if (this.isSpaceLongPress) {
                if (videoElement) {
                    videoElement.playbackRate = this.context.getPlaybackRate();
                }
            } else {
                togglePlay(videoElement);
            }
            return;
        }

        // Arrow Logic
        if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
            e.preventDefault();
            // Only handle if this was the active arrow action
            if (!this.isArrowDown) return;

            this.isArrowDown = false;
            clearTimeout(this.arrowTimer);
            clearInterval(this.seekInterval);

            if (!this.isArrowLongPress) {
                // Short press action: 1s jump
                if (videoElement) {
                    const isRight = e.code === "ArrowRight";
                    const direction = isRight ? 1 : -1;
                    const duration = this.context.getDuration();

                    videoElement.currentTime = Math.max(
                        0,
                        Math.min(duration, videoElement.currentTime + direction),
                    );
                }
            } else {
                // Long press release - Restore normal speed
                if (videoElement) {
                    videoElement.playbackRate = this.context.getPlaybackRate();
                    if (videoElement.paused) safePlay(videoElement);
                }
                this.context.onShowControls();
            }
        }
    }

    cleanup() {
        clearTimeout(this.spaceTimer);
        clearTimeout(this.arrowTimer);
        clearInterval(this.seekInterval);
    }
}
