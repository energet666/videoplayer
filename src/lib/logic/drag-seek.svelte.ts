// ============================================================================
// drag-seek.svelte.ts — Перемотка перетаскиванием мыши по видео
// ============================================================================
// Зажать левую кнопку в любом месте видео и вести влево/вправо → перемотка.
//
// Принцип работы:
// - pointerdown запоминает точку старта и текущее время видео
// - пока смещение меньше DRAG_THRESHOLD_PX, это ещё обычный клик (play/pause),
//   перемотка не начинается — иначе дрожание руки ломало бы клик
// - после порога: видео ставится на паузу (кадры обновляются чисто, звук не
//   дробится), currentTime меняется вживую — но не чаще, чем видео успевает
//   отработать предыдущий seek, — а на отпускании воспроизведение
//   возобновляется, если оно шло
// - Escape / pointercancel отменяют перемотку и возвращают исходную позицию
//
// Чувствительность совпадает с TouchpadHandler: 0.05 с на пиксель.
//
// Важно: click прилетает браузером после pointerup всегда, поэтому после
// перемотки он подавляется флагом (иначе каждый драг заканчивался бы паузой).
// ============================================================================

import { safePlay } from "./video-actions";

export class DragSeekHandler {
    // Сколько секунд перемотки даёт 1 пиксель движения мыши.
    // 0.05 → 100px = 5 секунд (тот же коэффициент, что у тачпада).
    private readonly sensitivity = 0.05;

    // Порог в пикселях: до него жест считается кликом, а не перемоткой.
    private readonly threshold = 6;

    // ========================
    // Состояние жеста
    // ========================
    private pointerId: number | null = null;  // Id зажатого указателя (null — кнопка не нажата)
    private startX = 0;                       // Координата X в момент нажатия
    private startTime = 0;                    // currentTime видео в момент нажатия
    private targetTime = 0;                   // Время, к которому ведём сейчас
    private isSeeking = false;                // Порог пройден, идёт перемотка?
    private wasPlaying = false;               // Видео играло до начала перемотки?
    private pendingSeek: number | null = null; // Время, которое ждёт своей очереди на применение
    private clickSuppressed = false;          // Погасить ближайший click после перемотки?

    /**
     * @param getVideo — getter для HTMLVideoElement (может быть undefined)
     * @param context.getDuration — длительность видео из состояния плеера
     * @param context.onShowControls — показать контролы (виден прогресс-бар)
     * @param context.onSeekStart — перемотка началась (порог пройден)
     * @param context.onSeekUpdate — новое смещение и целевое время (для индикатора)
     * @param context.onSeekEnd — перемотка закончилась или отменена
     */
    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private context: {
            getDuration: () => number;
            onShowControls: () => void;
            onSeekStart: () => void;
            onSeekUpdate: (deltaSeconds: number, targetTime: number) => void;
            onSeekEnd: () => void;
        }
    ) { }

    /**
     * Нажатие левой кнопки на видео — запоминаем точку отсчёта.
     * Сама перемотка ещё не начинается: ждём, пока курсор пройдёт порог.
     */
    handlePointerDown(e: PointerEvent) {
        if (e.button !== 0 || !e.isPrimary) return;

        const videoElement = this.getVideo();
        if (!videoElement) return;

        // Новый жест — снимаем подавление от предыдущего (свой click он уже погасил
        // либо click так и не пришёл, и держать флаг дальше нельзя).
        this.clickSuppressed = false;

        this.pointerId = e.pointerId;
        this.startX = e.clientX;
        this.startTime = videoElement.currentTime;
        this.targetTime = videoElement.currentTime;
        this.isSeeking = false;

        // Захват указателя: жест не потеряется, если курсор уйдёт за пределы окна.
        // Захват необязателен: move/up слушаются на window, поэтому отказ браузера
        // (например, указатель уже отпущен) не должен ломать жест.
        try {
            (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId);
        } catch {
            // Игнорируем: жест продолжит работать через window-слушатели
        }
    }

    /**
     * Движение с зажатой кнопкой: считаем целевое время и перематываем вживую.
     */
    handlePointerMove(e: PointerEvent) {
        if (this.pointerId === null || e.pointerId !== this.pointerId) return;

        // Кнопку отпустили мимо нас: pointerup потерялся (отпустили за пределами
        // окна, окно потеряло фокус, захват указателя не сработал). Без этой
        // проверки жест "залипает": видео остаётся на паузе, а каждое движение
        // мыши продолжает утаскивать currentTime — со стороны выглядит так,
        // будто плеер перестал играть и перематываться.
        if (e.buttons === 0) {
            this.finish(false);
            return;
        }

        const videoElement = this.getVideo();
        if (!videoElement) return;

        const deltaX = e.clientX - this.startX;

        // Порог ещё не пройден — это пока клик, ничего не делаем
        if (!this.isSeeking) {
            if (Math.abs(deltaX) < this.threshold) return;

            this.isSeeking = true;
            this.wasPlaying = !videoElement.paused;
            if (this.wasPlaying) videoElement.pause();

            // Точка отсчёта — момент, когда перемотка реально началась, а не
            // pointerdown: между ними видео продолжало играть, и currentTime уже
            // ушёл вперёд. Иначе задержка перед первым движением "съедалась" бы
            // из перемотки.
            this.startX = e.clientX;
            this.startTime = videoElement.currentTime;

            this.context.onSeekStart();
        }

        const duration = this.context.getDuration() || videoElement.duration || 0;
        this.targetTime = Math.max(
            0,
            Math.min(duration, this.startTime + (e.clientX - this.startX) * this.sensitivity)
        );

        this.requestSeek(this.targetTime);
        this.context.onSeekUpdate(this.targetTime - this.startTime, this.targetTime);
        this.context.onShowControls();
    }

    /**
     * Отпускание кнопки — фиксируем позицию и возвращаем воспроизведение.
     */
    handlePointerUp(e: PointerEvent) {
        if (this.pointerId === null || e.pointerId !== this.pointerId) return;
        this.finish(false);
    }

    /**
     * Системная отмена жеста (pointercancel) — откатываем на исходную позицию.
     */
    handlePointerCancel(e: PointerEvent) {
        if (this.pointerId === null || e.pointerId !== this.pointerId) return;
        this.finish(true);
    }

    /**
     * Видео закончило предыдущий seek — применяем накопленную позицию.
     * Вызывается из VideoPlayer по событию 'seeked'.
     */
    handleSeeked() {
        this.flushSeek();
    }

    /**
     * Принудительное завершение жеста извне: окно потеряло фокус или браузер
     * отобрал захват указателя. Позицию оставляем ту, до которой довели.
     */
    handleInterrupt() {
        if (this.pointerId === null) return;
        this.finish(false);
    }

    /**
     * Escape во время перемотки — отмена с возвратом к исходному времени.
     */
    handleKeyDown(e: KeyboardEvent) {
        if (e.key !== "Escape" || !this.isSeeking) return;
        e.preventDefault();
        this.finish(true);
    }

    /**
     * Нужно ли погасить текущий click? Флаг одноразовый: возвращаем true один раз
     * на каждую завершённую перемотку.
     */
    shouldSuppressClick() {
        if (!this.clickSuppressed) return false;
        this.clickSuppressed = false;
        return true;
    }

    /** Сброс очереди перемотки при уничтожении компонента. */
    cleanup() {
        this.pendingSeek = null;
    }

    /**
     * Ставит время в очередь и применяет его, если видео не занято.
     *
     * Перемотка идёт по одной за раз: пока элемент в состоянии seeking, новые
     * позиции только копятся, а применяется последняя — по событию 'seeked'.
     * Присваивать currentTime чаще (например, каждый кадр) нельзя: на источнике
     * с реальной задержкой чтения — file:// вместо буфера в памяти — seek'и
     * начинают отменять друг друга, и элемент залипает в seeking насовсем:
     * картинка стоит, timeupdate не приходит, прогресс-бар не двигается.
     */
    private requestSeek(time: number) {
        if (!Number.isFinite(time)) return;

        this.pendingSeek = time;

        const videoElement = this.getVideo();
        if (!videoElement || videoElement.seeking) return;

        this.flushSeek();
    }

    /** Применяет накопленную позицию, если она есть. */
    private flushSeek() {
        if (this.pendingSeek === null) return;

        const videoElement = this.getVideo();
        if (!videoElement) {
            this.pendingSeek = null;
            return;
        }

        const time = this.pendingSeek;
        this.pendingSeek = null;
        videoElement.currentTime = time;
    }

    /**
     * Завершение жеста.
     * @param cancelled — true: вернуть исходное время (Escape / pointercancel)
     */
    private finish(cancelled: boolean) {
        const wasSeeking = this.isSeeking;
        const videoElement = this.getVideo();

        this.pointerId = null;
        this.isSeeking = false;

        // Порог не пройден — это был обычный клик, отдаём его play/pause
        if (!wasSeeking) {
            this.pendingSeek = null;
            return;
        }

        if (videoElement) {
            // Финальная позиция идёт через ту же очередь: если предыдущий seek
            // ещё не закончился, она применится по событию 'seeked'
            this.requestSeek(cancelled ? this.startTime : this.targetTime);
            if (this.wasPlaying) safePlay(videoElement);
        }

        // Гасим click, который браузер пришлёт следом за pointerup
        this.clickSuppressed = true;
        this.context.onSeekEnd();
    }
}
