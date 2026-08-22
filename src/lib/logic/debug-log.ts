// ============================================================================
// debug-log.ts — Кольцевой лог событий плеера (только в dev-режиме)
// ============================================================================
// Зависания плеера воспроизводятся не с первого раза, а к моменту, когда его
// заметили, вся последовательность событий уже прокручена в никуда. Поэтому в
// dev-сборке мы постоянно пишем последние MAX_ENTRIES событий в память (жесты,
// перемотки, состояния <video>) вместе со снимком состояния элемента на момент
// каждого события — и сбрасываем всё в файл, когда нужно.
//
// Сброс в файл происходит:
//   - по Ctrl/Cmd + Shift + D — «поймал зависание, сохрани лог»;
//   - автоматически при восстановлении после сбоя декодера (recovery.ts).
//
// В production модуль выключен целиком (import.meta.env.DEV): event() выходит
// первой же строкой, слушатели не вешаются, канал записи файла в main-процессе
// в проде не регистрируется вовсе.
//
// Формат файла — JSON Lines: одна строка на событие, удобно и грепать, и
// разбирать целиком.
// ============================================================================

// Сколько событий держим в памяти. Хватает на несколько минут активной
// возни с плеером, включая шквал wheel-событий от инерционного свайпа.
const MAX_ENTRIES = 5000;

// Состояние <video>, которое снимается при каждом событии
type VideoSnapshot = Record<string, unknown>;

type DebugEntry = {
    t: number;                       // Миллисекунды от старта плеера
    type: string;                    // Что произошло
    data?: Record<string, unknown>;  // Подробности события
    state?: VideoSnapshot;           // Снимок состояния на этот момент
};

// События <video>, за которыми следим. timeupdate и progress намеренно НЕ
// пишем: они сыплются постоянно и вытеснят из буфера всё полезное.
const VIDEO_EVENTS = [
    "loadstart",
    "loadedmetadata",
    "loadeddata",
    "canplay",
    "canplaythrough",
    "play",
    "playing",
    "pause",
    "seeking",
    "seeked",
    "waiting",
    "stalled",
    "suspend",
    "abort",
    "emptied",
    "ratechange",
    "ended",
    "error",
] as const;

class DebugLog {
    /** Включён ли лог. В production — никогда. */
    readonly enabled = import.meta.env.DEV;

    /** Дублировать ли события в консоль (по умолчанию нет — слишком шумно). */
    mirrorToConsole = false;

    private entries: DebugEntry[] = [];
    private startedAt = performance.now();
    private probe: (() => VideoSnapshot) | null = null;

    /**
     * Источник снимка состояния. Ставится один раз из VideoPlayer.svelte —
     * так каждому событию достаётся контекст (seeking, readyState, позиция
     * очереди перемоток и т.д.) без протаскивания элемента по всем модулям.
     */
    setProbe(probe: () => VideoSnapshot) {
        if (!this.enabled) return;
        this.probe = probe;
    }

    /** Записывает событие в кольцевой буфер. */
    event(type: string, data?: Record<string, unknown>) {
        if (!this.enabled) return;

        const entry: DebugEntry = {
            t: Math.round(performance.now() - this.startedAt),
            type,
        };
        if (data) entry.data = data;

        try {
            entry.state = this.probe?.();
        } catch {
            // Снимок — вспомогательная информация: если элемент уже уничтожен,
            // событие всё равно должно попасть в лог
        }

        this.entries.push(entry);
        if (this.entries.length > MAX_ENTRIES) {
            this.entries.splice(0, this.entries.length - MAX_ENTRIES);
        }

        if (this.mirrorToConsole) {
            console.debug(`[player] ${entry.t}ms ${type}`, data ?? "", entry.state ?? "");
        }
    }

    /** Подписывается на события <video>. Возвращает функцию отписки. */
    watchVideo(videoElement: HTMLVideoElement) {
        if (!this.enabled) return () => { };

        const handlers = VIDEO_EVENTS.map((name) => {
            const handler = () => {
                const error = videoElement.error;
                this.event(
                    `video:${name}`,
                    error ? { errorCode: error.code, errorMessage: error.message } : undefined,
                );
            };
            videoElement.addEventListener(name, handler);
            return [name, handler] as const;
        });

        return () => {
            for (const [name, handler] of handlers) {
                videoElement.removeEventListener(name, handler);
            }
        };
    }

    /**
     * Вешает горячую клавишу сброса лога (Ctrl/Cmd + Shift + D) и кладёт
     * window.playerDebug для ручной работы из DevTools.
     * Возвращает функцию отписки.
     */
    install() {
        if (!this.enabled) return () => { };

        const onKeyDown = (e: KeyboardEvent) => {
            if (!e.shiftKey || e.code !== "KeyD") return;
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            this.dump("hotkey");
        };
        window.addEventListener("keydown", onKeyDown);

        (window as any).playerDebug = {
            dump: (reason = "manual") => this.dump(reason),
            entries: () => this.entries.slice(),
            clear: () => this.clear(),
            mirror: (on = true) => {
                this.mirrorToConsole = on;
                return `console mirror: ${on ? "on" : "off"}`;
            },
        };

        this.event("debug-log-installed");
        console.info(
            "[player] Лог событий включён. Ctrl/Cmd+Shift+D — сохранить в файл, window.playerDebug — из консоли.",
        );

        return () => {
            window.removeEventListener("keydown", onKeyDown);
            delete (window as any).playerDebug;
        };
    }

    /** Очищает буфер. */
    clear() {
        this.entries = [];
        this.startedAt = performance.now();
    }

    /**
     * Сохраняет буфер в файл через main-процесс и показывает всплывающую
     * подсказку с путём. Без Electron (обычный браузер) просто печатает в
     * консоль — там файл писать некуда.
     */
    async dump(reason: string) {
        if (!this.enabled) return null;

        this.event("dump", { reason });

        const header = {
            reason,
            at: new Date().toISOString(),
            userAgent: navigator.userAgent,
            entries: this.entries.length,
        };
        const content = [header, ...this.entries]
            .map((line) => JSON.stringify(line))
            .join("\n");

        const write = window.electronAPI?.writeDebugLog;
        if (!write) {
            console.log("[player] Лог событий (файл писать некуда):", this.entries);
            return null;
        }

        try {
            const filePath = await write(content);
            console.log(`[player] Лог событий сохранён: ${filePath}`);
            this.showToast(filePath ? `Лог сохранён:\n${filePath}` : "Лог сохранить не удалось");
            return filePath;
        } catch (error) {
            console.error("[player] Не удалось сохранить лог:", error);
            return null;
        }
    }

    /**
     * Всплывающая подсказка поверх видео: DevTools открыты отдельным окном, и
     * без неё непонятно, сработала горячая клавиша или нет.
     */
    private showToast(text: string) {
        const toast = document.createElement("div");
        toast.textContent = text;
        toast.style.cssText = [
            "position:fixed",
            "left:50%",
            "bottom:24px",
            "transform:translateX(-50%)",
            "z-index:9999",
            "max-width:80vw",
            "padding:10px 14px",
            "border-radius:8px",
            "background:rgba(24,24,27,0.92)",
            "color:#fafafa",
            "font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace",
            "white-space:pre-wrap",
            "pointer-events:none",
        ].join(";");

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }
}

export const debugLog = new DebugLog();
