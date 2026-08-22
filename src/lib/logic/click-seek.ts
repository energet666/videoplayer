// ============================================================================
// click-seek.ts — Клики по кадру: пауза и перемотка по половинам
// ============================================================================
// Схема как на YouTube:
//   - одиночный клик         → пауза / воспроизведение
//   - 2-й, 4-й, 6-й… в серии → перемотка на ±CLICK_SEEK_SECONDS по половине
//     кадра (левая — назад, правая — вперёд)
//
// Отличить одиночный клик от двойного заранее нельзя, поэтому переключение
// паузы откладывается на TOGGLE_DELAY_MS: если за это время придёт второй
// клик, отложенное действие снимается и вместо него делается перемотка.
// Считать клики самим не нужно — браузер отдаёт номер в серии в event.detail.
//
// Левая кнопка обслуживает три жеста сразу (клик, перемотка перетаскиванием,
// удержание по зонам кадра), и click браузер присылает всегда, даже когда
// жест оказался драгом или удержанием. Поэтому перед любым действием
// спрашиваем shouldSuppressClick() — иначе каждый жест заканчивался бы паузой
// (см. арбитраж в pointer-router.ts).
//
// Отложенную паузу снимает ещё и начало другого жеста: cancelPendingToggle()
// вызывается из onSeekStart драга и onHoldStart зон, иначе серия
// «клик + удержание» закончилась бы паузой уже после конца удержания.
// ============================================================================

import { togglePlay } from "./video-actions";
import { CLICK_SEEK_SECONDS } from "./constants";
import { clampTime } from "../utils";
import type { SeekQueue } from "./seek-queue.svelte";

// Пауза перед переключением play/pause: столько ждём второй клик серии
const TOGGLE_DELAY_MS = 220;

export class ClickSeekHandler {
    // Таймер отложенного play/pause (undefined — ничего не отложено)
    private toggleTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * @param getVideo — getter для HTMLVideoElement (может быть undefined)
     * @param seekQueue — общая очередь перемоток (одна на элемент)
     * @param context.getBounds — прямоугольник кадра (делит его на половины)
     * @param context.getDuration — длительность видео из состояния плеера
     * @param context.shouldSuppressClick — жест уже обработан другим
     *   обработчиком, этот click нужно проглотить
     * @param context.onShowControls — показать контролы (виден прогресс-бар)
     * @param context.onSeek — перемотка состоялась: сторона и новая позиция
     *   (для индикатора перемотки)
     */
    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private seekQueue: SeekQueue,
        private context: {
            getBounds: () => DOMRect | undefined;
            getDuration: () => number;
            shouldSuppressClick: () => boolean;
            onShowControls: () => void;
            onSeek: (side: "left" | "right", targetTime: number) => void;
        },
    ) { }

    /** Клик по видео. */
    handleClick(e: MouseEvent) {
        if (!this.getVideo()) return;
        if (this.context.shouldSuppressClick()) return;

        const clickCountInSeries = e.detail;
        clearTimeout(this.toggleTimer);

        // Первый клик серии: ждём, не станет ли он двойным
        if (clickCountInSeries === 1) {
            this.toggleTimer = setTimeout(() => {
                togglePlay(this.getVideo());
            }, TOGGLE_DELAY_MS);
            return;
        }

        // Каждый чётный клик серии перематывает: двойной — один раз,
        // счетверённый — ещё раз, и так далее
        if (clickCountInSeries % 2 === 0) {
            this.seekBySide(e);
        }
    }

    /**
     * Снять отложенное переключение паузы.
     * Вызывается, когда жест оказался не кликом, а перемоткой или удержанием.
     */
    cancelPendingToggle() {
        clearTimeout(this.toggleTimer);
    }

    /** Снятие таймера при уничтожении компонента. */
    cleanup() {
        clearTimeout(this.toggleTimer);
    }

    /** Перемотка на шаг назад или вперёд — по половине кадра, куда кликнули. */
    private seekBySide(e: MouseEvent) {
        const videoElement = this.getVideo();
        const rect = this.context.getBounds();
        if (!videoElement || !rect) return;

        const isLeftHalf = e.clientX < rect.left + rect.width / 2;
        const side: "left" | "right" = isLeftHalf ? "left" : "right";
        const step = isLeftHalf ? -CLICK_SEEK_SECONDS : CLICK_SEEK_SECONDS;

        // Считаем от цели очереди, а не от currentTime: серия кликов подряд
        // накапливает перемотку, а видео за ней ещё не доехало
        const duration = this.context.getDuration() || videoElement.duration || 0;
        const nextTime = clampTime(this.seekQueue.getTargetTime() + step, duration);

        this.seekQueue.request(nextTime);
        this.context.onSeek(side, nextTime);
        this.context.onShowControls();
    }
}
