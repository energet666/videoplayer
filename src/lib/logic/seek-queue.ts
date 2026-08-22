// ============================================================================
// seek-queue.ts — Очередь перемоток для <video>
// ============================================================================
// Общая для всех жестов перемотки (мышь, тачпад): элемент получает не больше
// одной перемотки за раз.
//
// Зачем: присваивать currentTime на каждое движение нельзя. На источнике с
// реальной задержкой чтения (file:// вместо буфера в памяти) каждый seek
// отменяет предыдущий — элемент постоянно занят и не отдаёт ни кадра, ни
// timeupdate: превью не обновляется, прогресс-бар стоит, а в худшем случае
// видео зависает совсем.
//
// Промежуточные позиции схлопываются — важна только последняя.
// ============================================================================

import { debugLog } from "./debug-log";

export class SeekQueue {
    // Позиция, которая ждёт своей очереди (null — очередь пуста)
    private pending: number | null = null;

    // Последняя запрошенная позиция. Живёт дольше pending: элемент получил её,
    // но currentTime догонит только когда seek завершится.
    private target: number | null = null;

    /**
     * @param getVideo — getter для HTMLVideoElement (может быть undefined)
     */
    constructor(private getVideo: () => HTMLVideoElement | undefined) { }

    /**
     * Текущая цель перемотки: последняя запрошенная позиция, а если очередь
     * пуста — реальная позиция видео.
     *
     * Жестам с относительным шагом (свайп по тачпаду) нужно прибавлять именно
     * к ней: currentTime ещё не догнал очередь, и накопление шагов потерялось бы.
     */
    getTargetTime(): number {
        if (this.pending !== null) return this.pending;

        const videoElement = this.getVideo();
        if (!videoElement) return 0;

        // Seek ещё идёт — currentTime отстаёт от того, что мы уже запросили
        if (videoElement.seeking && this.target !== null) return this.target;

        return videoElement.currentTime;
    }

    /**
     * Ставит позицию в очередь и применяет её, если элемент не занят.
     */
    request(time: number) {
        if (!Number.isFinite(time)) return;

        this.pending = time;
        this.target = time;

        const videoElement = this.getVideo();
        if (!videoElement || videoElement.seeking) {
            debugLog.event("seek-queued", { time });
            return;
        }

        this.flush();
    }

    /**
     * Видео закончило предыдущую перемотку — отдаём накопленную позицию.
     * Вызывается по событию 'seeked'.
     */
    handleSeeked() {
        // Очередь пуста и элемент доехал — цель больше не нужна. Иначе она
        // «залипает» и подменяет собой позицию при следующей перемотке мимо
        // очереди: пока идёт seek, getTargetTime() отдавал бы старую цель,
        // а после завершения — реальную позицию, и метка скакала бы между ними.
        if (this.pending === null) {
            this.target = null;
            return;
        }

        this.flush();
    }

    /** Сброс очереди (например, при уничтожении компонента). */
    reset() {
        debugLog.event("seek-queue-reset", { pending: this.pending, target: this.target });
        this.pending = null;
        this.target = null;
    }

    /**
     * Состояние очереди для отладочного лога (см. debug-log.ts).
     * Больше ни для чего не нужно: снаружи очередь управляется только
     * через request()/handleSeeked().
     */
    getDebugState() {
        return { pending: this.pending, target: this.target };
    }

    /** Применяет накопленную позицию, если она есть. */
    private flush() {
        if (this.pending === null) return;

        const videoElement = this.getVideo();
        if (!videoElement) {
            this.pending = null;
            return;
        }

        const time = this.pending;
        this.pending = null;
        debugLog.event("seek-apply", { time });
        videoElement.currentTime = time;
    }
}
