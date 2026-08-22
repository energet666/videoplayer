// ============================================================================
// pointer-router.ts — Арбитраж левой кнопки мыши между жестами
// ============================================================================
// Левая кнопка обслуживает три разных жеста, и различить их в момент нажатия
// невозможно — только по тому, что случится дальше:
//
//   отпустили раньше HOLD_DELAY_MS, не сдвинувшись → клик (пауза, ±10 с)
//   сдвинулись дальше порога раньше таймера       → перемотка перетаскиванием
//   продержали HOLD_DELAY_MS на месте             → удержание по зоне кадра
//
// Поэтому pointerdown уходит обоим обработчикам сразу, и каждый ждёт своего
// условия. Разводит их этот класс — единственное место, где записано, кто
// кого перебивает:
//
//   - как только удержание стало живым, pointermove больше не доходит до
//     перемотки перетаскиванием: иначе сдвиг руки во время ×16 начал бы
//     второй жест поверх первого;
//   - порог сдвига у обоих один (GESTURE_MOVE_THRESHOLD_PX): на разных
//     значениях получилась бы либо мёртвая зона, либо двойное срабатывание;
//   - подавление ближайшего click спрашивается у обоих, и оба вызова
//     обязательны — флаг у каждого свой и одноразовый.
//
// Клик здесь не обрабатывается: он приходит отдельным событием уже после
// pointerup (см. click-seek.ts).
// ============================================================================

import type { DragSeekHandler } from "./drag-seek.svelte";
import type { HoldZoneHandler } from "./hold-zones.svelte";

export class PointerRouter {
    /**
     * @param holdZones — удержание левой кнопки по трём зонам кадра
     * @param dragSeek — перемотка перетаскиванием
     */
    constructor(
        private holdZones: HoldZoneHandler,
        private dragSeek: DragSeekHandler,
    ) { }

    /** Нажатие на видео — жест ещё не определён, ждут оба. */
    handlePointerDown(e: PointerEvent) {
        this.holdZones.handlePointerDown(e);
        this.dragSeek.handlePointerDown(e);
    }

    handlePointerMove(e: PointerEvent) {
        this.holdZones.handlePointerMove(e);
        // Удержание уже началось — движение мыши не должно превращаться
        // ещё и в перемотку перетаскиванием
        if (this.holdZones.isActive()) return;
        this.dragSeek.handlePointerMove(e);
    }

    handlePointerUp(e: PointerEvent) {
        this.holdZones.handlePointerUp(e);
        this.dragSeek.handlePointerUp(e);
    }

    handlePointerCancel(e: PointerEvent) {
        this.holdZones.handlePointerCancel(e);
        this.dragSeek.handlePointerCancel(e);
    }

    /** Escape отменяет перемотку перетаскиванием и возвращает позицию. */
    handleKeyDown(e: KeyboardEvent) {
        this.dragSeek.handleKeyDown(e);
    }

    /**
     * Жест оборван снаружи: окно потеряло фокус, система забрала указатель
     * (lostpointercapture). Без этого удержание залипло бы — скорость осталась
     * бы ×2/×16, а перемотка продолжалась бы до следующего нажатия.
     */
    handleInterrupt() {
        this.holdZones.handleInterrupt();
        this.dragSeek.handleInterrupt();
    }

    /**
     * Нужно ли проглотить ближайший click.
     * Спрашиваем оба обработчика без короткого замыкания: каждый хранит
     * собственный одноразовый флаг, и невыполненный вызов оставил бы его
     * взведённым до следующего клика.
     */
    shouldSuppressClick() {
        const suppressedByHold = this.holdZones.shouldSuppressClick();
        const suppressedByDrag = this.dragSeek.shouldSuppressClick();
        return suppressedByHold || suppressedByDrag;
    }

    /** Снятие таймеров при уничтожении компонента. */
    cleanup() {
        this.holdZones.cleanup();
        this.dragSeek.cleanup();
    }
}
