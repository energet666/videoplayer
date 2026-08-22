// ============================================================================
// hold-zones.svelte.ts — Удержание левой кнопки мыши в трёх зонах кадра
// ============================================================================
// Кадр делится по горизонтали на три равные зоны, и зажатие левой кнопки в
// каждой из них повторяет соответствующее удержание клавиши:
//
//   левая треть   → как зажатая ←      (прыжки назад по 1 секунде)
//   центр         → как зажатый пробел (ускорение ×2)
//   правая треть  → как зажатая →      (ускорение ×16 + warp-эффект)
//
// Сами действия живут в hold-actions.ts — они общие с клавиатурой.
//
// Разграничение с другими жестами мыши (порядок важен, левая кнопка одна на
// всех):
//   - до 200мс удержания это ещё обычный клик → play/pause и двойной клик
//     (±10с) работают как раньше;
//   - если курсор ушёл дальше 6px раньше, чем сработал таймер, жест забирает
//     перемотка перетаскиванием (drag-seek.svelte.ts) — порог тот же, что у
//     неё, поэтому дрожание руки не превращает драг в удержание и наоборот;
//   - после сработавшего удержания перемотка перетаскиванием уже не начнётся
//     (VideoPlayer не пускает в неё move-события, пока isActive()).
//
// click браузер присылает после pointerup всегда, поэтому после удержания его
// нужно погасить — иначе каждое удержание заканчивалось бы паузой.
// ============================================================================

import type { HoldAction, HoldActionRunner } from "./hold-actions";

export type HoldZone = "left" | "center" | "right";

// Какая зона какое действие удерживает
const ZONE_ACTIONS: Record<HoldZone, HoldAction> = {
    left: "rewind",
    center: "boost",
    right: "forward",
};

export class HoldZoneHandler {
    // Сколько держать кнопку, чтобы это перестало быть кликом.
    // Столько же ждёт клавиатура (см. keyboard.svelte.ts).
    private readonly holdDelay = 200;

    // Порог в пикселях, после которого жест уходит перемотке перетаскиванием.
    // Совпадает с порогом в drag-seek.svelte.ts.
    private readonly moveThreshold = 6;

    // ========================
    // Состояние жеста
    // ========================
    private pointerId: number | null = null;  // Id зажатого указателя (null — жест не наш)
    private startX = 0;                       // Координата X в момент нажатия
    private timer: ReturnType<typeof setTimeout> | undefined; // Таймер длинного нажатия
    private zone: HoldZone | null = null;     // Зона активного удержания
    private clickSuppressed = false;          // Погасить ближайший click?

    /**
     * @param getVideo — getter для HTMLVideoElement (может быть undefined)
     * @param holdActions — общий исполнитель длинных действий
     * @param context.getBounds — прямоугольник кадра (для деления на зоны)
     * @param context.onHoldStart — удержание началось (зона)
     * @param context.onHoldEnd — удержание закончилось
     */
    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private holdActions: HoldActionRunner,
        private context: {
            getBounds: () => DOMRect | undefined;
            onHoldStart: (zone: HoldZone) => void;
            onHoldEnd: () => void;
        }
    ) { }

    /** Идёт ли сейчас удержание? */
    isActive() {
        return this.zone !== null;
    }

    /**
     * Нажатие левой кнопки на видео — запоминаем зону и ждём 200мс.
     * Раньше срока ничего не делаем: это может оказаться клик или драг.
     */
    handlePointerDown(e: PointerEvent) {
        if (e.button !== 0 || !e.isPrimary) return;
        if (!this.getVideo()) return;

        // Новый жест — снимаем подавление от предыдущего (свой click он уже
        // погасил либо click так и не пришёл)
        this.clickSuppressed = false;

        this.pointerId = e.pointerId;
        this.startX = e.clientX;

        const zone = this.zoneAt(e.clientX);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.zone = zone;
            this.holdActions.start(ZONE_ACTIONS[zone]);
            this.context.onHoldStart(zone);
        }, this.holdDelay);
    }

    /**
     * Движение с зажатой кнопкой.
     * До срабатывания таймера уход дальше порога означает, что пользователь
     * перематывает перетаскиванием — отдаём жест ей.
     */
    handlePointerMove(e: PointerEvent) {
        if (this.pointerId === null || e.pointerId !== this.pointerId) return;

        // Кнопку отпустили мимо нас (за пределами окна, потерян захват) —
        // иначе удержание залипнет: скорость останется ×2/×16, а перемотка
        // назад продолжит прыгать бесконечно
        if (e.buttons === 0) {
            this.finish();
            return;
        }

        // Удержание уже идёт — движение на него не влияет
        if (this.zone !== null) return;

        if (Math.abs(e.clientX - this.startX) >= this.moveThreshold) {
            this.cancelPending();
        }
    }

    /** Отпускание кнопки — завершаем удержание (если оно успело начаться). */
    handlePointerUp(e: PointerEvent) {
        if (this.pointerId === null || e.pointerId !== this.pointerId) return;
        this.finish();
    }

    /** Системная отмена жеста (pointercancel). */
    handlePointerCancel(e: PointerEvent) {
        if (this.pointerId === null || e.pointerId !== this.pointerId) return;
        this.finish();
    }

    /**
     * Принудительное завершение извне: окно потеряло фокус или браузер отобрал
     * захват указателя — pointerup до нас уже не дойдёт.
     */
    handleInterrupt() {
        if (this.pointerId === null && this.zone === null) return;
        this.finish();
    }

    /**
     * Нужно ли погасить текущий click? Флаг одноразовый: возвращаем true один
     * раз на каждое состоявшееся удержание.
     */
    shouldSuppressClick() {
        if (!this.clickSuppressed) return false;
        this.clickSuppressed = false;
        return true;
    }

    /** Очистка таймера и остановка действия при уничтожении компонента. */
    cleanup() {
        clearTimeout(this.timer);
        this.holdActions.stop();
        this.pointerId = null;
        this.zone = null;
    }

    /** Жест ушёл перемотке перетаскиванием — удержание уже не начнётся. */
    private cancelPending() {
        clearTimeout(this.timer);
        this.pointerId = null;
    }

    /** Завершение жеста: гасим таймер и сворачиваем действие. */
    private finish() {
        clearTimeout(this.timer);
        this.pointerId = null;

        if (this.zone === null) return; // Удержание не начиналось — это был клик

        this.zone = null;
        this.holdActions.stop();
        // Гасим click, который браузер пришлёт следом за pointerup
        this.clickSuppressed = true;
        this.context.onHoldEnd();
    }

    /** В какую из трёх зон кадра попадает координата X. */
    private zoneAt(clientX: number): HoldZone {
        const rect = this.context.getBounds();
        if (!rect || rect.width === 0) return "center";

        const position = (clientX - rect.left) / rect.width;
        if (position < 1 / 3) return "left";
        if (position > 2 / 3) return "right";
        return "center";
    }
}
