/**
 * Safely plays the video, catching AbortError which is common
 * when playing/pausing rapidly.
 */
export function safePlay(videoElement: HTMLVideoElement | undefined) {
    videoElement?.play()?.catch((e) => {
        if (e.name !== "AbortError") {
            console.error("Play error:", e);
        }
    });
}

/**
 * Toggles play/pause state
 */
export function togglePlay(videoElement: HTMLVideoElement | undefined) {
    if (!videoElement) return;
    if (videoElement.paused) {
        safePlay(videoElement);
    } else {
        videoElement.pause();
    }
}

/**
 * Toggles fullscreen mode for the video's parent element
 */
export function toggleFullscreen(videoElement: HTMLVideoElement | undefined) {
    if (!videoElement) return;

    if (!document.fullscreenElement) {
        (videoElement.parentNode as HTMLElement)
            .requestFullscreen()
            .catch((err) => {
                console.error(
                    `Error attempting to enable fullscreen: ${err.message}`,
                );
            });
    } else {
        document.exitFullscreen();
    }
}

/**
 * Toggles Picture-in-Picture mode
 */
export async function togglePip(videoElement: HTMLVideoElement | undefined) {
    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled && videoElement) {
            await videoElement.requestPictureInPicture();
        }
    } catch (error) {
        console.error("PiP error:", error);
    }
}
