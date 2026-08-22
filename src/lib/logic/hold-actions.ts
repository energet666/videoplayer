// ============================================================================
// hold-actions.ts — Действия при удержании (общие для клавиатуры и мыши)
// ============================================================================
// Три «длинных» действия плеера, каждое живёт, пока кнопку держат:
//
//   rewind  — прыжки назад на 1 секунду каждые 300мс (HTML5 video не умеет
//             отрицательную playbackRate, поэтому перемотка назад — интервал)
//   boost   — ускорение ×2 (на паузе видео запускается и продолжает играть
//             после отпускания)
//   forward — ускорение ×16 с warp-эффектом, быстрая перемотка вперёд (на
//             паузе видео запускается временно и по окончании снова встаёт
//             на паузу). Warp висит именно здесь, а не на ×2: эффект
//             оправдан только той скоростью, на которой картинка реально
//             летит.
//
// Вынесено отдельно, потому что вызывающих двое: KeyboardHandler (пробел и
// стрелки ←→) и HoldZoneHandler (зажатие левой кнопки мыши в трёх зонах кадра).
// Дублировать эту логику нельзя: восстановление скорости и остановка интервала
// — то, из-за чего плеер выглядит зависшим, если где-то забыть про них.
//
// Важно: скорость всегда восстанавливается из getPlaybackRate() (выбор
// пользователя), а не читается из элемента — там на время действия стоит ×2/×16.
// ============================================================================

import { safePlay } from "./video-actions";
import type { SeekQueue } from "./seek-queue.svelte";

export type HoldAction = "rewind" | "boost" | "forward";

// Шаг перемотки назад при удержании и период его повторения.
// Шаг мелкий (1 секунда) специально: удержание догоняет нужное место плавно,
// а точный прыжок на ±3 секунды даёт короткое нажатие (см. keyboard.svelte.ts).
const REWIND_STEP_SECONDS = 1;
const REWIND_INTERVAL_MS = 300;

export class HoldActionRunner {
    // Текущее действие (null — ничего не удерживается)
    private action: HoldAction | null = null;

    // Интервал прыжков назад (только для rewind)
    private rewindInterval: ReturnType<typeof setInterval> | undefined;

    // Видео стояло на паузе, и мы запустили его только ради ×16
    private temporarilyPlayed = false;

    /**
     * @param getVideo — getter для HTMLVideoElement (может быть undefined)
     * @param seekQueue — общая очередь перемоток (одна на элемент)
     * @param context.getPlaybackRate — скорость, выбранная пользователем
     * @param context.onWarpStart / onWarpEnd — warp-эффект для forward (×16)
     * @param context.onActionStart / onActionEnd — начало и конец удержания
     *   (плеер показывает по ним индикатор перемотки; boost он игнорирует)
     */
    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private seekQueue: SeekQueue,
        private context: {
            getPlaybackRate: () => number;
            onWarpStart?: () => void;
            onWarpEnd?: () => void;
            onActionStart?: (action: HoldAction) => void;
            onActionEnd?: (action: HoldAction) => void;
        }
    ) { }

    /** Идёт ли сейчас какое-нибудь удержание? */
    isActive() {
        return this.action !== null;
    }

    /** Какое именно действие удерживается (null — никакое). */
    getAction() {
        return this.action;
    }

    /**
     * Запускает действие. Если что-то уже удерживалось (например, зажали пробел,
     * а потом стрелку) — сначала аккуратно сворачиваем предыдущее.
     */
    start(action: HoldAction) {
        if (this.action) this.stop();
        this.action = action;

        const videoElement = this.getVideo();
        if (!videoElement) return;

        this.context.onActionStart?.(action);

        if (action === "rewind") {
            // Считаем от цели очереди, а не от currentTime: тот отстаёт, пока
            // предыдущий прыжок не завершился, и шаги терялись бы
            const doRewind = () => {
                this.seekQueue.request(
                    Math.max(0, this.seekQueue.getTargetTime() - REWIND_STEP_SECONDS),
                );
            };
            doRewind();       // Первый прыжок — сразу
            this.rewindInterval = setInterval(doRewind, REWIND_INTERVAL_MS);
            return;
        }

        if (action === "boost") {
            videoElement.playbackRate = 2.0;
            if (videoElement.paused) {
                safePlay(videoElement);
            }
            return;
        }

        // forward — ×16
        videoElement.playbackRate = 16.0;
        if (videoElement.paused) {
            this.temporarilyPlayed = true;
            safePlay(videoElement);
        }
        this.context.onWarpStart?.();
    }

    /**
     * Останавливает текущее действие: гасим интервал, возвращаем пользовательскую
     * скорость и, если видео играло только ради ×16, снова ставим его на паузу.
     * Вызывать безопасно в любой момент — без активного действия ничего не делает.
     */
    stop() {
        if (!this.action) return;

        const action = this.action;
        this.action = null;

        clearInterval(this.rewindInterval);
        this.rewindInterval = undefined;

        const videoElement = this.getVideo();
        if (videoElement) {
            videoElement.playbackRate = this.context.getPlaybackRate();
            if (this.temporarilyPlayed) {
                videoElement.pause();
            }
        }
        this.temporarilyPlayed = false;

        if (action === "forward") {
            this.context.onWarpEnd?.();
        }

        this.context.onActionEnd?.(action);
    }
}
