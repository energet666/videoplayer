// ============================================================================
// video-actions.ts — Утилиты для управления видео
// ============================================================================
// Набор функций для базовых действий с <video>: play, pause, fullscreen, PiP.
// ============================================================================

/**
 * Безопасный запуск воспроизведения.
 * AbortError при быстром play/pause — нормальная ситуация, игнорируем.
 */
export function safePlay(videoElement: HTMLVideoElement | undefined) {
    videoElement?.play()?.catch((e) => {
        if (e.name !== "AbortError") {
            console.error("Play error:", e);
        }
    });
}

/**
 * Переключает воспроизведение/паузу.
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
 * Переключает полноэкранный режим.
 * Fullscreen запрашивается для parentNode (контейнера), а не для <video>,
 * чтобы кастомные контролы отображались поверх видео.
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
 * Переключает PiP (Picture-in-Picture).
 * При входе в PiP окно Electron скрывается, при выходе — показывается.
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
