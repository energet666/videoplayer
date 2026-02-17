// ============================================================================
// touchpad.svelte.ts — Обработчик жестов тачпада
// ============================================================================
// Позволяет перематывать видео горизонтальным свайпом (scroll) по тачпаду.
//
// Принцип работы:
// - Слушаем event 'wheel' на контейнере видео
// - Если горизонтальный scroll (deltaX) значительнее вертикального (deltaY),
//   считаем это горизонтальным свайпом → перемотка видео
// - Направление инвертировано (-1 * deltaX), чтобы свайп вправо перематывал вперёд
// - preventDefault() блокирует навигацию браузера (назад/вперёд по истории)
// ============================================================================

export class TouchpadHandler {
    // Коэффициент чувствительности: сколько секунд перемотки на 1 пиксель deltaX.
    // При sensitivity = 0.05: свайп на 100px = перемотка на 5 секунд.
    private sensitivity = 0.05;

    /**
     * @param getVideo — getter для HTMLVideoElement (может быть undefined)
     * @param context.onShowControls — колбэк для показа контролов при скролле
     */
    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private context: {
            onShowControls: () => void;
        }
    ) { }

    /**
     * Обработчик WheelEvent.
     * Фильтрует вертикальный scroll (обычная прокрутка страницы) и обрабатывает
     * только горизонтальный (свайп по тачпаду).
     */
    handleWheel(e: WheelEvent) {
        // Пропускаем вертикальный scroll (deltaY > deltaX) — это не свайп
        if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;

        // Блокируем стандартное поведение (навигация назад/вперёд в браузере)
        e.preventDefault();

        const videoElement = this.getVideo();
        if (!videoElement) return;

        // Вычисляем величину перемотки (инвертируем направление)
        const seekAmount = -1 * e.deltaX * this.sensitivity;

        // Перематываем видео, ограничивая диапазон [0, duration]
        videoElement.currentTime = Math.max(
            0,
            Math.min(videoElement.duration, videoElement.currentTime + seekAmount)
        );

        // Показываем контролы при скролле (чтобы прогресс-бар был виден)
        this.context.onShowControls();
    }
}
