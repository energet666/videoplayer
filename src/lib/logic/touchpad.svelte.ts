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
// - У свайпа нет явного конца (кнопку никто не отпускает), поэтому жест
//   считается законченным, если wheel-события не приходили TOUCHPAD_GESTURE_GAP_MS.
//   Это же разделение задаёт точку отсчёта для индикатора перемотки: смещение
//   показывается от начала текущего свайпа, а не от начала файла
// ============================================================================

import { debugLog } from "./debug-log";
import type { SeekQueue } from "./seek-queue.svelte";

// Пауза в wheel-событиях, после которой свайп считается законченным.
// То же значение гасит индикатор перемотки в VideoPlayer.svelte.
export const TOUCHPAD_GESTURE_GAP_MS = 300;

export class TouchpadHandler {
    // Коэффициент чувствительности: сколько секунд перемотки на 1 пиксель deltaX.
    // При sensitivity = 0.05: свайп на 100px = перемотка на 5 секунд.
    private sensitivity = 0.05;

    // ========================
    // Состояние текущего свайпа (нужно индикатору перемотки)
    // ========================
    private gestureStartTime = 0; // Позиция видео в начале свайпа
    private lastWheelAt = 0;      // Момент последнего wheel-события

    /**
     * @param getVideo — getter для HTMLVideoElement (может быть undefined)
     * @param seekQueue — общая очередь перемоток (одна на элемент)
     * @param context.getDuration — длительность видео из состояния плеера
     * @param context.onShowControls — колбэк для показа контролов при скролле
     * @param context.onSeekUpdate — колбэк «жест идёт»: плеер ведёт метку на
     *   прогресс-баре за целью перемотки, а не за отстающим currentTime, и
     *   показывает индикатор со смещением от начала свайпа и целевым временем
     */
    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private seekQueue: SeekQueue,
        private context: {
            getDuration: () => number;
            onShowControls: () => void;
            onSeekUpdate: (deltaSeconds: number, targetTime: number) => void;
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

        // Новый свайп (пауза между событиями больше порога) — запоминаем точку
        // отсчёта для индикатора: смещение считается от начала жеста
        const now = performance.now();
        if (now - this.lastWheelAt > TOUCHPAD_GESTURE_GAP_MS) {
            this.gestureStartTime = this.seekQueue.getTargetTime();
        }
        this.lastWheelAt = now;

        // Шаг относительный, поэтому прибавляем к цели очереди, а не к
        // currentTime: тот ещё не догнал очередь, и накопление шагов терялось бы
        const duration = this.context.getDuration() || videoElement.duration || 0;
        const targetTime = Math.max(
            0,
            Math.min(duration, this.seekQueue.getTargetTime() + seekAmount)
        );

        debugLog.event("wheel", {
            deltaX: Math.round(e.deltaX * 100) / 100,
            deltaY: Math.round(e.deltaY * 100) / 100,
            targetTime: Math.round(targetTime * 1000) / 1000,
        });

        this.seekQueue.request(targetTime);

        // Показываем контролы при скролле (чтобы прогресс-бар был виден)
        this.context.onShowControls();
        this.context.onSeekUpdate(targetTime - this.gestureStartTime, targetTime);
    }
}
