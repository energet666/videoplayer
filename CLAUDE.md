# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

X-Stas-Player — a minimal desktop video player: **Svelte 5 (runes) + Tailwind CSS 4 + Electron**, built with Vite and packaged by electron-builder.

## Commands

```bash
npm run dev        # Vite dev server (5173) + Electron, run concurrently via `concurrently -k`
npm run check      # svelte-check — the only automated verification in this repo
npm run build      # vite build + electron-builder for the current platform
npm run build:mac  # DMG
npm run build:win  # NSIS installer (x64)
./generate_icons.sh # regenerate build/icon.{icns,ico,png} from build/icon.png (needs sips/iconutil/ffmpeg)
```

There is no test framework and no linter. `npm run check` is the verification step — run it after changes. (`npm run quality` is an alias for it.)

`dev:electron` waits on `tcp:5173` before launching Electron, so the Vite server must come up first; that ordering is already handled by `npm run dev`.

## Architecture

Two processes, bridged only by a narrow IPC surface:

- **Main** (`electron/main.js`, ESM, Node) — window lifecycle, command-line/file-association handling, IPC handlers.
- **Preload** (`electron/preload.cjs`, CJS — must stay CJS) — `contextBridge` exposes one flat `window.electronAPI` object: file intake (`getInitialFile`, `onOpenFile`), window sizing and visibility (`resizeWindow`, `hideWindow`, `showWindow`), window controls (`closeWindow`, `toggleFullscreen`, `isFullscreen`, `onFullscreenChange`), and `getPlatform`. Adding an IPC channel means touching three files: `main.js` (handler), `preload.cjs` (bridge method), and `src/vite-env.d.ts` (the `Window.electronAPI` type declaration).
- **Renderer** (`src/`) — Svelte 5 app. `window.electronAPI` is typed optional (`?`) on purpose: the UI must degrade gracefully when run in a plain browser, so always guard with `if (window.electronAPI)` / `?.`.

### Renderer layout

`App.svelte` owns file intake (drag & drop, `getInitialFile`, `onOpenFile`) and the welcome screen; it hands a `videoSrc` URL to `VideoPlayer.svelte`, which owns all playback state (`paused`, `duration`, `currentTime`, `volume`, `userPlaybackRate`) via `bind:` on the `<video>` element. `VideoControls.svelte` does not bind `currentTime` back — it renders `displayTime` and reports seeks through an `onSeek(time)` callback, so the progress bar goes through the same queue as every other gesture.

Input logic lives in `src/lib/logic/` as **plain classes constructed with a `() => videoElement` getter plus a callback context object** — not stores, not components. `KeyboardHandler`, `TouchpadHandler`, `DragSeekHandler` and `HoldZoneHandler` never touch Svelte state directly; they call back into `VideoPlayer.svelte`. The getter indirection exists because `videoElement` is undefined when the handlers are constructed. Presentational components in `src/lib/components/` are pure props-in.

`VideoPlayer.svelte` must call `keyboardHandler.cleanup()` in `onDestroy` — the handlers own timers/intervals.

### Behaviors that are easy to break

- **Short vs. long press**: keydown starts a 200 ms timer; release before it fires = short action, after = long action. Both Space and ←/→ use this, each with its own `isXDown` / `isXLongPress` / timer trio, plus a re-entrancy guard against key auto-repeat. Window `blur` must reset that state via `handleWindowBlur()`: the `keyup` never arrives after Cmd+Tab, and the rewind interval would keep jumping −3 s forever with `playbackRate` stuck at ×2/×16.
- **The long actions themselves live in `HoldActionRunner`** (`src/lib/logic/hold-actions.ts`), not in the keyboard handler: `rewind` / `boost` (×2 + warp) / `forward` (×16). `VideoPlayer.svelte` owns exactly one runner and injects it into both `KeyboardHandler` and `HoldZoneHandler`, so a second hold folds the first one down (`start()` calls `stop()`) and there is a single place that restores `userPlaybackRate`, clears the rewind interval, and re-pauses a video that was only playing for ×16.
- **Hold-by-zone with the mouse** (`src/lib/logic/hold-zones.svelte.ts`): the frame splits into three vertical thirds, and holding the left button for 200 ms in one of them runs the same action as holding ←, Space, or → respectively. The left button now serves three gestures, and the arbitration between them is the fragile part: under 200 ms it is still a click (play/pause, double-click ±10 s); moving past 6 px before the timer fires hands the gesture to drag-seek (`cancelPending()`, same threshold as `DragSeekHandler`); once a hold is live, `VideoPlayer.svelte` stops forwarding `pointermove` to `DragSeekHandler` so a drag can no longer start. Both handlers get their own one-shot `shouldSuppressClick()`, and `handleVideoClick` must ask *both* (each call consumes its own flag) or a hold would end in a pause. The self-heal paths are the same as drag-seek's: `buttons === 0` on move, `pointercancel`, `lostpointercapture`, window `blur`.
- **`userPlaybackRate` vs `videoElement.playbackRate`** are deliberately separate. The element's rate is temporarily overridden (×2 on held Space, ×16 on held →) and restored from `userPlaybackRate` on keyup. Never read the user's chosen speed off the element.
- **Rewind uses `setInterval`** (−1 s every 300 ms, `REWIND_STEP_SECONDS` / `REWIND_INTERVAL_MS` in `hold-actions.ts`), because HTML5 video has no negative `playbackRate`. The step is deliberately smaller than the short-press jump: a tap on ←/→ moves ±3 s (`SHORT_SEEK_SECONDS`), while holding ← or the left zone creeps back in 1 s steps.
- **Window auto-resize**: on `loadedmetadata` the renderer sends `resize-window`; main sets the aspect ratio, scales to fit the work area, centers, and *then* shows the window. The window starts with `show: false` and there is a 1 s fallback `setTimeout` in `ready-to-show` — this is what prevents the start-screen flash when opening via file association. Don't make the window visible earlier.
- **Every seek goes through the one shared `SeekQueue`** (`src/lib/logic/seek-queue.ts`) that `VideoPlayer.svelte` owns and injects into all four paths — keyboard, touchpad, drag, and the progress bar (`onSeek`), plus double-click seeking. Nothing outside that module may assign `videoElement.currentTime`; a `grep -rn '\.currentTime = ' src/` should only ever hit `seek-queue.ts`. The queue hands the element one seek at a time, coalescing whatever arrives while a seek is in flight and flushing it on `seeked`. Assigning per event is what made a fast gesture freeze on a `file://` source: each assignment cancelled the in-flight seek, so almost nothing completed (measured: 3 of 40 seeks and 3 painted frames, against 30 of 30 through the queue), and an element that starts out already `seeking` can stay wedged for good. Two rules keep it correct: relative steps must accumulate from `getTargetTime()`, never from `currentTime` (the element lags behind the queue, so steps get dropped), and `handleSeeked()` must clear the target once the element arrives (a stale target would show through on the next seek and make the progress marker flip between two positions).
- **`displayTime` vs `currentTime`**: the progress bar renders `displayTime`, sampled per `requestAnimationFrame` from `seekQueue.getTargetTime()` while playing or seeking — `timeupdate`, which drives `currentTime`, only fires ~4×/s and made the marker step. The rAF loop is gated to playing/gesture states; when idle-paused, `displayTime` just mirrors `currentTime`.
- **Drag-to-seek** (`src/lib/logic/drag-seek.svelte.ts`): left button held anywhere on the video and moved, 0.05 s per pixel of horizontal movement — the same sensitivity as `TouchpadHandler`. A 6 px threshold separates it from a click; below it the gesture is still a click. It pauses the video for the duration of the drag and resumes on release if it was playing, and Escape/`pointercancel` restore the starting position. `click` always fires after `pointerup`, so `shouldSuppressClick()` eats exactly one click per completed drag — without it every drag would end in a pause. `pointerdown` is bound to the `<video>` element, `pointermove`/`pointerup` to `window` (plus `setPointerCapture`), so the gesture survives the cursor leaving the window. A lost `pointerup` would wedge the player — the video stays paused and every mouse move keeps dragging `currentTime` — so the gesture self-heals: `handlePointerMove` ends it when `e.buttons === 0`, and `lostpointercapture`/window `blur` call `handleInterrupt()`.
- **Click handling** is YouTube-style: `event.detail === 1` schedules play/pause after 220 ms; even counts in the series seek ±10 s by screen half and cancel the pending toggle.

### Platform-conditional window settings (`electron/main.js`)

`transparent` is `true` everywhere *except* win32, where it would break `backgroundMaterial: 'acrylic'`. `App.svelte` mirrors this with a heavier welcome-screen background on non-darwin platforms.

`webSecurity: process.env.NODE_ENV !== 'development'` — disabled in **development** only, enabled in production.

### Window controls (no native chrome)

`frame: false` with **no `titleBarStyle`** — the app draws its own window buttons. Do not add `titleBarStyle: 'hidden'` back: it is macOS-only and deliberately keeps the traffic lights, which then sit on top of the video, while Windows gets no controls at all. That platform split is exactly what the custom buttons replaced.

Fullscreen is the window's native fullscreen (`setFullScreen`), not the HTML5 Fullscreen API, so macOS hides the menu bar the way the green traffic light did. The renderer does not own the state: `main.js` forwards `enter-full-screen` / `leave-full-screen` over the `fullscreen-changed` channel and `VideoPlayer.svelte` subscribes to it, which keeps the icon correct when fullscreen is toggled outside the button (Ctrl+Cmd+F, F11).

The close button exists twice on purpose — in `VideoControls.svelte` and again in `App.svelte` for the welcome screen. Before a video loads there is no control panel, so without the second one the window could only be closed with Cmd+Q / Alt+F4. Any button overlapping a drag region needs `-webkit-app-region: no-drag`.

### File associations

Three entry paths must all keep working: macOS `open-file` event (can fire before or after window creation — hence the `fileToOpen` module variable), Windows/Linux `process.argv` at startup, and `second-instance` for a re-open while running. `extractFileFromArgs` scans argv by extension rather than by index, since dev/production/portable launches differ. In `package.json`, `fileAssociations` entries must be **one object per extension** (array form broke the Linux build), and `build/beforeBuild.cjs` returning `false` disables electron-builder's native-dep rebuild.

## Conventions

- Code comments and user-facing UI strings are in **Russian**; match that when editing existing files. `README.md` and `implementation_plan.md` are also Russian — `implementation_plan.md` documents the architecture and the rationale table for key technical decisions.
- Svelte 5 runes only (`$state`, `$props`, `$effect`, `$derived`) — no legacy stores or `export let`.
- Tailwind 4 via `@tailwindcss/vite`; `@import "tailwindcss"` in `src/app.css`, no `tailwind.config.js`.
- `-webkit-app-region: no-drag` is the global default in `app.css`; drag handles opt in individually via inline style.
- `vite.config.js` sets `base: './'` — required for `file://` loading in production. Don't change it.
