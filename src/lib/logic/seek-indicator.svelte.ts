// ============================================================================
// seek-indicator.svelte.ts — Состояние индикатора перемотки
// ============================================================================
// Индикатор («−20 с · 3:41» поверх кадра) один на все жесты перемотки:
// перетаскивание мышью, свайп по тачпаду, двойной клик, удержание ←/→ и
// крайних зон кадра. Каждый источник сообщает сюда свои цифры, а компонент
// только отдаёт их в DragSeekIndicator.
//
// Два правила, которые легко нарушить, разобрав это обратно по компоненту:
//
// 1. Цифры НЕ сбрасываются на конце жеста. Индикатор гаснет плавно (150мс), и
//    подстановка нулей или чужих значений была бы видна как мигание другого
//    числа перед исчезновением. Гасится только признак активности, значения
//    замирают на последнем показанном.
//
// 2. Источник, который сам считает смещение (драг, свайп, клик), пишет цифры
//    ДО того, как индикатор станет активным — иначе на кадре появления
//    мелькнут значения от прошлого жеста.
//
// У удержания собственного «шага» нет: смещение считается от позиции на старте
// по displayTime, который каждый кадр ведётся за целью очереди перемоток
// (см. trackHold и цикл requestAnimationFrame в VideoPlayer.svelte).
// ============================================================================

import { TOUCHPAD_GESTURE_GAP_MS } from "./touchpad.svelte";
import { CLICK_SEEK_SECONDS } from "./constants";

// Сколько индикатор висит после перемотки кликом. У клика нет «отпускания»,
// поэтому конец жеста задаётся таймером.
const CLICK_VISIBLE_MS = 700;

// Пауза между кликами, внутри которой серия считается продолжающейся и
// показанный шаг растёт (−10, −20, −30…).
const CLICK_ACCUMULATION_WINDOW_MS = 600;

export class SeekIndicator {
    // ========================
    // Что показываем
    // ========================
    // $state — цифры уходят прямо в разметку компонента
    private deltaSeconds = $state(0); // Смещение от точки начала жеста
    private targetSeconds = $state(0); // Время, к которому перематываем

    // ========================
    // Кто сейчас перематывает
    // ========================
    // Флаги раздельные, а не одно «активен»: жесты могут накладываться
    // (свайп затухает по таймеру, пока пользователь уже тянет мышью), и общая
    // видимость — это ИЛИ по всем источникам.
    private dragging = $state(false);
    private touchpadSeeking = $state(false);
    private clickSeeking = $state(false);
    private holding = $state(false);

    // Позиция видео в момент начала удержания — точка отсчёта для смещения
    private holdStart = 0;

    // ========================
    // Состояние серии двойных кликов
    // ========================
    // Обычные поля, не $state: на экран они попадают через deltaSeconds
    private clickSide: "left" | "right" | null = null; // Сторона последнего клика
    private clickAmount = CLICK_SEEK_SECONDS; // Накопленный шаг серии
    private lastClickAt = 0; // Время последнего клика серии

    private touchpadTimeout: ReturnType<typeof setTimeout> | undefined;
    private clickTimeout: ReturnType<typeof setTimeout> | undefined;

    /** Показывать ли индикатор сейчас. */
    get isActive() {
        return (
            this.dragging ||
            this.touchpadSeeking ||
            this.clickSeeking ||
            this.holding
        );
    }

    /** Смещение от точки начала текущего жеста (секунды, со знаком). */
    get delta() {
        return this.deltaSeconds;
    }

    /** Время, к которому ведёт текущий жест. */
    get target() {
        return this.targetSeconds;
    }

    /** Идёт ли удержание — компоненту, чтобы не гонять trackHold вхолостую. */
    get isHolding() {
        return this.holding;
    }

    /**
     * Идёт ли перемотка перетаскиванием мыши.
     * Нужно не только индикатору: под этот жест плеер меняет курсор, прячет
     * большую кнопку Play (пауза там техническая) и ведёт метку на баре по
     * кадрам, а не по timeupdate.
     */
    get isDragSeeking() {
        return this.dragging;
    }

    /** Идёт ли перемотка свайпом по тачпаду (то же, что isDragSeeking). */
    get isTouchpadSeeking() {
        return this.touchpadSeeking;
    }

    // ========================
    // Перемотка перетаскиванием мыши
    // ========================

    /**
     * Порог пройден, драг стал перемоткой.
     * Цифры здесь не трогаем: DragSeekHandler вызывает dragMoved() сразу
     * следом, в том же событии, так что показать старые значения не успеет.
     */
    dragStarted() {
        this.dragging = true;
    }

    dragMoved(deltaSeconds: number, targetTime: number) {
        this.deltaSeconds = deltaSeconds;
        this.targetSeconds = targetTime;
    }

    dragEnded() {
        this.dragging = false;
    }

    // ========================
    // Свайп по тачпаду
    // ========================

    /**
     * Свайп сдвинул позицию. Явного конца у жеста нет — считаем его
     * законченным, когда wheel-события перестали приходить.
     */
    touchpadMoved(deltaSeconds: number, targetTime: number) {
        this.deltaSeconds = deltaSeconds;
        this.targetSeconds = targetTime;
        this.touchpadSeeking = true;

        clearTimeout(this.touchpadTimeout);
        this.touchpadTimeout = setTimeout(() => {
            this.touchpadSeeking = false;
        }, TOUCHPAD_GESTURE_GAP_MS);
    }

    // ========================
    // Перемотка двойным кликом
    // ========================

    /**
     * Клик перемотал видео на ±CLICK_SEEK_SECONDS.
     * Серия кликов в одну сторону накапливает показанный шаг: −10, −20, −30…
     * Сама перемотка при этом каждый раз ровно на один шаг — накопление
     * существует только на экране.
     *
     * @param side — половина кадра, по которой кликнули
     * @param targetTime — позиция, к которой ведём после этого клика
     */
    clickSeeked(side: "left" | "right", targetTime: number) {
        const now = Date.now();
        const continuesSeries =
            this.clickSide === side &&
            now - this.lastClickAt <= CLICK_ACCUMULATION_WINDOW_MS;

        this.clickAmount = continuesSeries
            ? this.clickAmount + CLICK_SEEK_SECONDS
            : CLICK_SEEK_SECONDS;
        this.clickSide = side;
        this.lastClickAt = now;

        this.deltaSeconds = side === "left" ? -this.clickAmount : this.clickAmount;
        this.targetSeconds = targetTime;
        this.clickSeeking = true;

        clearTimeout(this.clickTimeout);
        this.clickTimeout = setTimeout(() => {
            this.clickSeeking = false;
            this.clickSide = null;
            this.clickAmount = CLICK_SEEK_SECONDS;
        }, CLICK_VISIBLE_MS);
    }

    // ========================
    // Удержание ←/→ и крайних зон кадра
    // ========================

    /**
     * Началось удержание, которое перематывает (rewind / forward).
     * Ускорение ×2 (boost) сюда не попадает — это не перемотка.
     *
     * @param startTime — позиция видео на старте удержания (цель очереди,
     *   а не currentTime: элемент за ней отстаёт)
     */
    holdStarted(startTime: number) {
        this.holdStart = startTime;
        // Выставляем цифры до показа — эффект в компоненте отработает только
        // после отрисовки, и на кадре появления всплыли бы прошлые значения
        this.deltaSeconds = 0;
        this.targetSeconds = startTime;
        this.holding = true;
    }

    /** Позиция уехала — пересчитываем смещение от старта удержания. */
    trackHold(displayTime: number) {
        if (!this.holding) return;
        this.deltaSeconds = displayTime - this.holdStart;
        this.targetSeconds = displayTime;
    }

    holdEnded() {
        this.holding = false;
    }

    // ========================
    // Служебное
    // ========================

    /**
     * Гасим индикатор целиком. Нужно при восстановлении после сбоя декодера:
     * жесты сворачиваются принудительно, и ни один из них уже не сообщит,
     * что закончился.
     */
    reset() {
        clearTimeout(this.touchpadTimeout);
        clearTimeout(this.clickTimeout);
        this.dragging = false;
        this.touchpadSeeking = false;
        this.clickSeeking = false;
        this.holding = false;
        this.clickSide = null;
        this.clickAmount = CLICK_SEEK_SECONDS;
    }

    /** Снятие таймеров при уничтожении компонента. */
    cleanup() {
        clearTimeout(this.touchpadTimeout);
        clearTimeout(this.clickTimeout);
    }
}
