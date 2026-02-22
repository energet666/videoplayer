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
//   - Короткое нажатие → перемотка на ±1 секунду
//   - Зажатие (>200мс):
//       → Вправо: ускорение ×16 (быстрая перемотка вперёд)
//       → Влево: прыжки назад на 3 секунды каждые 300мс (имитация перемотки назад)
//
// СТРЕЛКИ ВВЕРХ/ВНИЗ (ArrowUp / ArrowDown):
//   - Изменение скорости воспроизведения (из массива availableSpeeds)
//
// Принцип "короткое vs длинное нажатие":
// При keydown запускается таймер на 200мс. Если клавиша отпущена раньше —
// выполняется "короткое" действие. Если таймер сработал — "длинное" действие.
// ============================================================================

import { safePlay, togglePlay } from "./video-actions";

// Доступные скорости воспроизведения (переключаются стрелками ↑↓)
export const availableSpeeds = [1.0, 1.25, 1.5, 2.0];

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
    private seekInterval: ReturnType<typeof setInterval> | undefined; // Интервал для перемотки назад
    private isArrowLongPress = false;        // Длинное нажатие?
    private arrowRightTemporarilyPlayed = false; // Длинное удержание → временно запустили playback?

    /**
     * @param getVideo — функция-getter для получения HTMLVideoElement.
     *   Используем getter, потому что элемент может быть ещё не создан на момент
     *   инициализации handler'а.
     * @param context — набор колбэков для взаимодействия с UI-компонентом:
     *   - getPlaybackRate: получить скорость, установленную пользователем
     *   - setPlaybackRate: установить новую скорость
     *   - getDuration: получить длительность видео
     *   - onShowControls: показать контролы
     *   - onShowSpeedIndicator: показать индикатор скорости
     *   - onWarpStart: начать warp-эффект (ускорение ×2)
     *   - onWarpEnd: закончить warp-эффект
     */
    constructor(
        private getVideo: () => HTMLVideoElement | undefined,
        private context: {
            getPlaybackRate: () => number;
            setPlaybackRate: (rate: number) => void;
            getDuration: () => number;
            onShowControls: () => void;
            onShowSpeedIndicator: () => void;
            onWarpStart?: () => void;
            onWarpEnd?: () => void;
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

            // Через 200мс считаем это длинным нажатием → ускоряем до ×2
            this.spaceTimer = setTimeout(() => {
                if (!videoElement) return;
                videoElement.playbackRate = 2.0;
                this.isSpaceLongPress = true;
                // Если видео на паузе — начинаем воспроизведение
                if (videoElement.paused) {
                    safePlay(videoElement);
                }
                // Запускаем warp-эффект
                this.context.onWarpStart?.();
            }, 200);
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
                this.arrowRightTemporarilyPlayed = false;

                const isRight = e.code === "ArrowRight";

                // Через 200мс считаем длинным нажатием → быстрая перемотка
                this.arrowTimer = setTimeout(() => {
                    this.isArrowLongPress = true;
                    this.context.onShowControls(); // Показываем контролы при перемотке

                    if (!videoElement) return;

                    if (isRight) {
                        // При зажатии → : ускоряем до ×16 (быстрая перемотка вперёд)
                        videoElement.playbackRate = 16.0;
                        if (videoElement.paused) {
                            this.arrowRightTemporarilyPlayed = true;
                            safePlay(videoElement);
                        }
                    } else {
                        // При зажатии ← : прыгаем назад на 3 секунды каждые 300мс.
                        // HTML5 video не поддерживает отрицательную playbackRate,
                        // поэтому используем setInterval для имитации перемотки назад.
                        const doRewind = () => {
                            videoElement.currentTime = Math.max(
                                0,
                                videoElement.currentTime - 3,
                            );
                        };
                        doRewind();       // Первый прыжок — сразу
                        this.seekInterval = setInterval(doRewind, 300); // Далее каждые 300мс
                    }
                }, 200);
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
                // Было длинное нажатие — возвращаем скорость к пользовательской
                if (videoElement) {
                    videoElement.playbackRate = this.context.getPlaybackRate();
                }
                // Останавливаем warp-эффект
                this.context.onWarpEnd?.();
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
            clearInterval(this.seekInterval);

            if (!this.isArrowLongPress) {
                // Короткое нажатие → перемотка на ±1 секунду
                if (videoElement) {
                    const isRight = e.code === "ArrowRight";
                    const direction = isRight ? 1 : -1;
                    const duration = this.context.getDuration();

                    videoElement.currentTime = Math.max(
                        0,
                        Math.min(duration, videoElement.currentTime + direction),
                    );
                }
            } else {
                // Длинное нажатие закончилось — возвращаем нормальную скорость
                if (videoElement) {
                    videoElement.playbackRate = this.context.getPlaybackRate();
                    if (this.arrowRightTemporarilyPlayed) {
                        videoElement.pause();
                    }
                }
                this.arrowRightTemporarilyPlayed = false;
                this.context.onShowControls();
            }
        }
    }

    /**
     * Очистка всех таймеров и интервалов.
     * Вызывается при уничтожении компонента VideoPlayer.
     */
    cleanup() {
        clearTimeout(this.spaceTimer);
        clearTimeout(this.arrowTimer);
        clearInterval(this.seekInterval);
        this.arrowRightTemporarilyPlayed = false;
    }
}
