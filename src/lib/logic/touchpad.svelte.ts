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
// - Позиция уходит в видео через общую очередь перемоток (см. seek-queue.ts):
//   инерционный свайп сыплет wheel-событиями быстрее, чем элемент успевает
//   отработать seek, и без очереди каждая перемотка отменяла предыдущую —
//   превью не успевало обновляться
// ============================================================================

import type { SeekQueue } from "./seek-queue";

export class TouchpadHandler {
    // Коэффициент чувствительности: сколько секунд перемотки на 1 пиксель deltaX.
    // При sensitivity = 0.05: свайп на 100px = перемотка на 5 секунд.
    private sensitivity = 0.05;

    /**
     * @param getVideo — getter для HTMLVideoElement (может быть undefined)
     * @param seekQueue — общая очередь перемоток (одна на элемент)
     * @param context.getDuration — длительность видео из состояния плеера
     * @param context.onShowControls — колбэк для показа контролов при скролле
     * @param context.onSeekUpdate — колбэк «жест идёт»: плеер ведёт метку на
     *   прогресс-баре за целью перемотки, а не за отстающим currentTime
     */
    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private seekQueue: SeekQueue,
        private context: {
            getDuration: () => number;
            onShowControls: () => void;
            onSeekUpdate: () => void;
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

        // Шаг относительный, поэтому прибавляем к цели очереди, а не к
        // currentTime: тот ещё не догнал очередь, и накопление шагов терялось бы
        const duration = this.context.getDuration() || videoElement.duration || 0;
        const targetTime = Math.max(
            0,
            Math.min(duration, this.seekQueue.getTargetTime() + seekAmount)
        );

        this.seekQueue.request(targetTime);

        // Показываем контролы при скролле (чтобы прогресс-бар был виден)
        this.context.onShowControls();
        this.context.onSeekUpdate();
    }
}
