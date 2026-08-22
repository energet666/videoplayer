// ============================================================================
// keyboard.svelte.ts — Обработчик клавиатурных сочетаний
// ============================================================================
// Управляет всей логикой клавиатуры для видеоплеера:
//
// ПРОБЕЛ (Space):
//   - Короткое нажатие → пауза / воспроизведение
//   - Зажатие (>200мс) → ускорение ×2 (отпускание — возврат к userPlaybackRate)
//
// СТРЕЛКИ ВЛЕВО/ВПРАВО (ArrowLeft / ArrowRight):
//   - Короткое нажатие → перемотка на ±3 секунды
//   - Зажатие (>200мс):
//       → Вправо: ускорение ×16 (быстрая перемотка вперёд)
//       → Влево: прыжки назад на 1 секунду каждые 300мс (имитация перемотки назад)
//
// СТРЕЛКИ ВВЕРХ/ВНИЗ (ArrowUp / ArrowDown):
//   - Изменение скорости воспроизведения (из массива availableSpeeds)
//
// Принцип "короткое vs длинное нажатие":
// При keydown запускается таймер на 200мс. Если клавиша отпущена раньше —
// выполняется "короткое" действие. Если таймер сработал — "длинное" действие.
//
// Сами длинные действия (×2, ×16, прыжки назад) живут в hold-actions.ts:
// их же повторяет удержание левой кнопки мыши по зонам кадра
// (hold-zones.svelte.ts), и исполнитель у них общий — два удержания сразу
// невозможны, а скорость всегда возвращается к пользовательской.
// ============================================================================

import { togglePlay } from "./video-actions";
import type { SeekQueue } from "./seek-queue.svelte";
import type { HoldActionRunner } from "./hold-actions";
import { HOLD_DELAY_MS } from "./constants";
import { clampTime } from "../utils";

// Доступные скорости воспроизведения (переключаются стрелками ↑↓)
export const availableSpeeds = [1.0, 1.25, 1.5, 2.0];

// Шаг короткого нажатия стрелки. Он крупнее шага удержания (1 секунда,
// см. hold-actions.ts): нажатием делают точный прыжок через пропущенное место,
// а удержание подводит к нему плавно.
const SHORT_SEEK_SECONDS = 3;

export class KeyboardHandler {
    // ========================
    // Состояние клавиши Space
    // ========================
    private isSpaceDown = false;             // Клавиша зажата?
    private spaceTimer: ReturnType<typeof setTimeout> | undefined; // Таймер для определения длинного нажатия
    private isSpaceLongPress = false;        // Сработал ли таймер (длинное нажатие)?

    // ========================
    // Состояние стрелок ←→
    // ========================
    private isArrowDown = false;             // Стрелка зажата?
    private arrowTimer: ReturnType<typeof setTimeout> | undefined; // Таймер длинного нажатия
    private isArrowLongPress = false;        // Длинное нажатие?

    /**
     * @param getVideo — функция-getter для получения HTMLVideoElement.
     *   Используем getter, потому что элемент может быть ещё не создан на момент
     *   инициализации handler'а.
     * @param seekQueue — общая очередь перемоток: все жесты ходят через неё,
     *   иначе позиции считаются от разных источников и метка на баре скачет.
     * @param holdActions — общий исполнитель длинных действий (×2, ×16, прыжки
     *   назад). Общий с удержанием мыши по зонам кадра.
     * @param context — набор колбэков для взаимодействия с UI-компонентом:
     *   - getPlaybackRate: получить скорость, установленную пользователем
     *   - setPlaybackRate: установить новую скорость
     *   - getDuration: получить длительность видео
     *   - onShowControls: показать контролы
     *   - onShowSpeedIndicator: показать индикатор скорости
     */
    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private seekQueue: SeekQueue,
        private holdActions: HoldActionRunner,
        private context: {
            getPlaybackRate: () => number;
            setPlaybackRate: (rate: number) => void;
            getDuration: () => number;
            onShowControls: () => void;
            onShowSpeedIndicator: () => void;
        }
    ) { }

    /**
     * Обработчик нажатия клавиши (keydown).
     * Для каждой клавиши: запоминаем состояние + запускаем таймер длинного нажатия.
     */
    handleKeyDown(e: KeyboardEvent) {
        const videoElement = this.getVideo();

        // ========================
        // ПРОБЕЛ (Space)
        // ========================
        if (e.code === "Space") {
            e.preventDefault();
            // Защита от повторных keydown (зажатая клавиша генерирует их непрерывно)
            if (this.isSpaceDown) return;
            this.isSpaceDown = true;
            this.isSpaceLongPress = false;

            // Продержали HOLD_DELAY_MS — это длинное нажатие → ускоряем до ×2
            this.spaceTimer = setTimeout(() => {
                this.isSpaceLongPress = true;
                this.holdActions.start("boost");
            }, HOLD_DELAY_MS);
            return;
        }

        // ========================
        // СТРЕЛКИ
        // ========================
        if (e.code.startsWith("Arrow")) {
            e.preventDefault();

            // --- Стрелки ↑↓: изменение скорости воспроизведения ---
            if (e.code === "ArrowUp" || e.code === "ArrowDown") {
                if (!videoElement) return;
                const currentRate = this.context.getPlaybackRate();
                const currentIndex = availableSpeeds.indexOf(currentRate);
                let newIndex = currentIndex;

                // ↑ — увеличиваем скорость (следующий элемент массива)
                if (e.code === "ArrowUp") {
                    newIndex = Math.min(availableSpeeds.length - 1, currentIndex + 1);
                }
                // ↓ — уменьшаем скорость (предыдущий элемент массива)
                else {
                    newIndex = Math.max(0, currentIndex - 1);
                }

                // Обновляем скорость, если она изменилась
                if (newIndex !== currentIndex) {
                    const newRate = availableSpeeds[newIndex];
                    this.context.setPlaybackRate(newRate);     // Обновляем в UI-состоянии
                    videoElement.playbackRate = newRate;       // Применяем к <video>
                    this.context.onShowSpeedIndicator();       // Показываем индикатор "1.5x"
                }
                return;
            }

            // --- Стрелки ←→: перемотка ---
            if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
                // Защита от повторных keydown
                if (this.isArrowDown) return;
                this.isArrowDown = true;
                this.isArrowLongPress = false;

                const isRight = e.code === "ArrowRight";

                // Продержали HOLD_DELAY_MS — длинное нажатие → быстрая перемотка
                this.arrowTimer = setTimeout(() => {
                    this.isArrowLongPress = true;
                    this.context.onShowControls(); // Показываем контролы при перемотке
                    // → : ускорение ×16, ← : прыжки назад по 1 секунде
                    this.holdActions.start(isRight ? "forward" : "rewind");
                }, HOLD_DELAY_MS);
            }
        }
    }

    /**
     * Обработчик отпускания клавиши (keyup).
     * Определяет, было ли нажатие коротким или длинным, и выполняет
     * соответствующее действие.
     */
    handleKeyUp(e: KeyboardEvent) {
        const videoElement = this.getVideo();

        // ========================
        // ПРОБЕЛ (Space) — отпускание
        // ========================
        if (e.code === "Space") {
            e.preventDefault();
            this.isSpaceDown = false;
            clearTimeout(this.spaceTimer);

            if (this.isSpaceLongPress) {
                // Было длинное нажатие — возвращаем скорость
                this.holdActions.stop();
            } else {
                // Было короткое нажатие — переключаем паузу
                togglePlay(videoElement);
            }
            return;
        }

        // ========================
        // СТРЕЛКИ ←→ — отпускание
        // ========================
        if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
            e.preventDefault();
            if (!this.isArrowDown) return;  // Не наша стрелка (например, ↑↓)

            this.isArrowDown = false;
            clearTimeout(this.arrowTimer);

            if (!this.isArrowLongPress) {
                // Короткое нажатие → перемотка на ±3 секунды
                if (videoElement) {
                    const isRight = e.code === "ArrowRight";
                    const step = isRight ? SHORT_SEEK_SECONDS : -SHORT_SEEK_SECONDS;
                    const duration = this.context.getDuration();

                    this.seekQueue.request(
                        clampTime(this.seekQueue.getTargetTime() + step, duration),
                    );
                }
            } else {
                // Длинное нажатие закончилось — возвращаем нормальную скорость
                // и гасим warp-эффект (если это была →)
                this.holdActions.stop();
                this.context.onShowControls();
            }
        }
    }

    /**
     * Окно потеряло фокус (Cmd+Tab, переход в другое приложение).
     * keyup до нас уже не дойдёт, поэтому сбрасываем состояние зажатых клавиш
     * сами. Без этого интервал перемотки назад продолжает прыгать на −3с
     * бесконечно, а скорость остаётся ×2/×16 — плеер выглядит зависшим.
     */
    handleWindowBlur() {
        if (!this.isSpaceDown && !this.isArrowDown) return;

        clearTimeout(this.spaceTimer);
        clearTimeout(this.arrowTimer);

        // Возвращает пользовательскую скорость, гасит интервал перемотки и
        // warp-эффект (могло быть ×2 / ×16)
        this.holdActions.stop();

        // Короткие действия (пауза по пробелу, перемотка на ±1с) при потере
        // фокуса не выполняем — пользователь ушёл в другое окно, а не нажал клавишу.
        this.isSpaceDown = false;
        this.isSpaceLongPress = false;
        this.isArrowDown = false;
        this.isArrowLongPress = false;
    }

    /**
     * Очистка всех таймеров и интервалов.
     * Вызывается при уничтожении компонента VideoPlayer.
     */
    cleanup() {
        clearTimeout(this.spaceTimer);
        clearTimeout(this.arrowTimer);
        this.holdActions.stop();
    }
}
