// ============================================================================
// recovery.ts — Восстановление плеера после сбоя декодера
// ============================================================================
// Зачем это нужно. При быстрой перемотке (особенно свайпом по тачпаду) на
// macOS иногда падает аппаратный декодер VideoToolbox:
//
//   error.code = 3 (MEDIA_ERR_DECODE)
//   PipelineStatus::PIPELINE_ERROR_DECODE: ... Code=-12909 VTDecompressionOutputCallback
//
// После этого элемент <video> мёртв: readyState падает с HAVE_ENOUGH_DATA до
// HAVE_METADATA, а начатая перемотка так и остаётся незавершённой — seeking
// навсегда true, событие 'seeked' не приходит уже никогда. Для плеера это
// полное зависание: очередь перемоток (seek-queue.ts) ждёт 'seeked', чтобы
// отдать следующую позицию, и вместе с ней умирают ВСЕ жесты сразу —
// клавиатура, мышь, тачпад, прогресс-бар.
//
// Само по себе это не лечится: элемент из состояния ошибки не выходит, пока
// его не перезагрузить. Поэтому здесь мы:
//   1) ловим 'error' и перезагружаем источник (load()), возвращая позицию,
//      скорость и состояние play/pause — для пользователя это выглядит как
//      подтормаживание, а не как смерть плеера;
//   2) сторожевым таймером ловим «залипший seek» без события 'error' —
//      seeking дольше STUCK_SEEK_MS без 'seeked' лечится тем же способом.
//
// Защита от петли: если декодер падает снова и снова на одном и том же месте,
// перезагружать бесконечно нельзя — после MAX_RECOVERIES_IN_WINDOW попыток
// подряд восстановление отключается до следующей «спокойной» минуты.
// ============================================================================

import { safePlay } from "./video-actions";
import { debugLog } from "./debug-log";
import type { SeekQueue } from "./seek-queue";

// Сколько ждать завершения перемотки, прежде чем считать элемент залипшим.
// Обычный seek по локальному файлу укладывается в десятки миллисекунд, так что
// несколько секунд — это заведомо аварийная ситуация, а не медленный диск.
const STUCK_SEEK_MS = 4000;

// Как часто сторож проверяет состояние элемента
const WATCHDOG_INTERVAL_MS = 1000;

// Сколько ждать метаданные после load(), прежде чем сдаться
const RELOAD_TIMEOUT_MS = 5000;

// Окно и лимит попыток: больше MAX_RECOVERIES_IN_WINDOW перезагрузок за
// RECOVERY_WINDOW_MS — значит, лечение не помогает, и мы только мешаем
const RECOVERY_WINDOW_MS = 60000;
const MAX_RECOVERIES_IN_WINDOW = 3;

export type RecoveryReason = "decode-error" | "stuck-seek";

export class PlaybackRecovery {
    // Идёт ли сейчас перезагрузка (защита от повторного входа)
    private isRestoring = false;

    // Момент начала текущей перемотки (0 — перемотки нет)
    private seekStartedAt = 0;

    // Таймеры: сторож и страховка на случай, если load() не доедет
    private watchdog: ReturnType<typeof setInterval> | undefined;
    private reloadTimeout: ReturnType<typeof setTimeout> | undefined;

    // Отметки времени последних восстановлений (для защиты от петли)
    private recoveryTimestamps: number[] = [];

    /**
     * @param getVideo — getter для HTMLVideoElement (может быть undefined)
     * @param seekQueue — общая очередь перемоток: её нужно сбросить, иначе
     *   после перезагрузки она продолжит ждать 'seeked' от умершего seek-а
     * @param context.getPlaybackRate — скорость, выбранная пользователем
     * @param context.onRecoveryStart / onRecoveryEnd — сообщить UI (индикатор
     *   и подавление ресайза окна на повторном loadedmetadata)
     */
    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private seekQueue: SeekQueue,
        private context: {
            getPlaybackRate: () => number;
            onRecoveryStart?: (reason: RecoveryReason) => void;
            onRecoveryEnd?: (restored: boolean) => void;
        }
    ) { }

    /** Идёт ли сейчас восстановление? */
    isActive() {
        return this.isRestoring;
    }

    /** Запускает сторожевой таймер (вызывать после монтирования плеера). */
    start() {
        clearInterval(this.watchdog);
        this.watchdog = setInterval(() => this.checkStuckSeek(), WATCHDOG_INTERVAL_MS);
    }

    /** Элемент начал перемотку — засекаем время. */
    handleSeeking() {
        this.seekStartedAt = Date.now();
    }

    /** Перемотка завершилась штатно — сторожу больше не за чем следить. */
    handleSeeked() {
        this.seekStartedAt = 0;
    }

    /** Элемент сообщил об ошибке — лечим немедленно, ждать сторожа незачем. */
    handleError() {
        const videoElement = this.getVideo();
        const error = videoElement?.error;

        debugLog.event("video-error", {
            code: error?.code,
            message: error?.message,
        });

        this.recover("decode-error");
    }

    /** Остановка таймеров при уничтожении компонента. */
    cleanup() {
        clearInterval(this.watchdog);
        clearTimeout(this.reloadTimeout);
        this.watchdog = undefined;
        this.reloadTimeout = undefined;
        this.seekStartedAt = 0;
    }

    /**
     * Проверка сторожа: перемотка идёт слишком долго и событие 'seeked' явно
     * уже не придёт. Бывает и без события 'error' — элемент просто зависает.
     */
    private checkStuckSeek() {
        if (this.isRestoring || this.seekStartedAt === 0) return;

        const videoElement = this.getVideo();
        if (!videoElement) return;

        // Перемотка успела закончиться — просто подчищаем отметку
        if (!videoElement.seeking) {
            this.seekStartedAt = 0;
            return;
        }

        if (Date.now() - this.seekStartedAt < STUCK_SEEK_MS) return;

        debugLog.event("stuck-seek-detected", {
            stuckForMs: Date.now() - this.seekStartedAt,
        });

        this.recover("stuck-seek");
    }

    /**
     * Перезагружает источник и возвращает плеер в то же состояние: позиция,
     * скорость, play/pause.
     */
    private recover(reason: RecoveryReason) {
        if (this.isRestoring) return;

        const videoElement = this.getVideo();
        if (!videoElement) return;

        if (!this.allowRecovery()) {
            debugLog.event("recovery-gave-up", { reason });
            console.warn(
                "[player] Декодер падает повторно — автовосстановление отключено. Откройте файл заново.",
            );
            return;
        }

        this.isRestoring = true;
        this.seekStartedAt = 0;
        this.context.onRecoveryStart?.(reason);

        // Позицию берём с самого элемента, а не из очереди: цель очереди — это
        // как раз то место, на котором декодер и умер, и возвращаться туда
        // повторно означало бы напрашиваться на второй такой же сбой.
        const position = Number.isFinite(videoElement.currentTime)
            ? videoElement.currentTime
            : 0;
        const wasPlaying = !videoElement.paused;
        const rate = this.context.getPlaybackRate();

        debugLog.event("recovery-start", { reason, position, wasPlaying });
        // В dev-сборке сразу сбрасываем историю событий в файл: именно она
        // показывает, какая последовательность довела декодер до сбоя.
        // В production это пустышка (см. debug-log.ts).
        void debugLog.dump(reason);

        // Очередь ждала 'seeked' от перемотки, которой больше не существует
        this.seekQueue.reset();

        // autoplay в разметке стоит для первого открытия файла; при
        // перезагрузке он бы сам запустил видео, даже если оно стояло на паузе
        videoElement.autoplay = wasPlaying;

        const finish = (restored: boolean) => {
            clearTimeout(this.reloadTimeout);
            this.reloadTimeout = undefined;
            videoElement.removeEventListener("loadedmetadata", onReady);
            videoElement.autoplay = true;
            this.isRestoring = false;
            this.context.onRecoveryEnd?.(restored);
            debugLog.event("recovery-end", { reason, restored });
        };

        const onReady = () => {
            // Возвращаем позицию через общую очередь: присваивать currentTime
            // мимо неё нельзя (см. seek-queue.ts)
            this.seekQueue.request(Math.max(0, position));
            videoElement.playbackRate = rate;

            if (wasPlaying) {
                safePlay(videoElement);
            } else {
                videoElement.pause();
            }

            finish(true);
        };

        videoElement.addEventListener("loadedmetadata", onReady, { once: true });

        // Страховка: если метаданные так и не пришли, снимаем флаг, иначе
        // плеер останется «в процессе восстановления» навсегда
        this.reloadTimeout = setTimeout(() => finish(false), RELOAD_TIMEOUT_MS);

        videoElement.load();
    }

    /**
     * Не слишком ли часто мы лечим? Повторяющееся падение на одном и том же
     * месте перезагрузкой не чинится, и крутить её бесконечно вредно.
     */
    private allowRecovery() {
        const now = Date.now();
        this.recoveryTimestamps = this.recoveryTimestamps.filter(
            (at) => now - at < RECOVERY_WINDOW_MS,
        );

        if (this.recoveryTimestamps.length >= MAX_RECOVERIES_IN_WINDOW) {
            return false;
        }

        this.recoveryTimestamps.push(now);
        return true;
    }
}
