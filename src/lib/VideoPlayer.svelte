<!--
  ============================================================================
  VideoPlayer.svelte — Основной компонент видеоплеера
  ============================================================================
  Отвечает за:
  1. Отображение HTML5 <video> элемента
  2. Управление состоянием воспроизведения (пауза, громкость, время, скорость)
  3. Показ/скрытие контролов (с автоскрытием через 1 секунду)
  4. Обработку клавиатурных сочетаний (через KeyboardHandler)
  5. Обработку жестов тачпада (через TouchpadHandler) и перемотку
     перетаскиванием мыши (через DragSeekHandler)
  6. Авто-ресайз окна Electron под размер видео
  7. Режим PiP (Picture-in-Picture)
  ============================================================================
-->

<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import PlayOverlay from "./components/PlayOverlay.svelte";
  import SpeedIndicator from "./components/SpeedIndicator.svelte";
  import VideoControls from "./components/VideoControls.svelte";
  import WarpEffect from "./components/WarpEffect.svelte";
  import DragSeekIndicator from "./components/DragSeekIndicator.svelte";
  import {
    togglePlay,
    togglePip,
  } from "./logic/video-actions";
  import { KeyboardHandler } from "./logic/keyboard.svelte";
  import { TouchpadHandler } from "./logic/touchpad.svelte";
  import { DragSeekHandler } from "./logic/drag-seek.svelte";

  // Пропсы: URL видеофайла, передаётся из App.svelte
  let { videoSrc }: { videoSrc: string | null } = $props();

  // Ссылки на DOM-элементы (bind:this в шаблоне)
  let videoElement: HTMLVideoElement = $state() as any; // Элемент <video>
  let videoContainer: HTMLDivElement | undefined = $state(); // Контейнер плеера

  // ========================
  // Состояние видео
  // ========================
  let paused = $state(true); // Видео на паузе?
  let duration = $state(0); // Общая длительность видео (секунды)
  let currentTime = $state(0); // Текущая позиция воспроизведения (секунды)
  let volume = $state(1); // Громкость (0.0 — 1.0)

  // ========================
  // Скорость воспроизведения
  // ========================
  // userPlaybackRate — скорость, выбранная пользователем (стрелками ↑↓).
  // Отличается от videoElement.playbackRate, которая может временно меняться
  // при зажатии пробела (×2) или стрелки вправо (×16).
  let userPlaybackRate = $state(1.0);

  // ========================
  // Состояние UI
  // ========================
  let showControls = $state(false); // Показывать ли панель управления?
  let isDragging = $state(false); // Пользователь перетаскивает прогресс-бар?
  let isMouseOverControls = $state(false); // Курсор над контролами? (предотвращает автоскрытие)
  let controlsTimeout: ReturnType<typeof setTimeout>; // Таймер автоскрытия контролов

  // ========================
  // Индикатор скорости
  // ========================
  let showSpeedIndicator = $state(false); // Показывать ли индикатор "1.5x" / "2x"?
  let speedIndicatorTimeout: ReturnType<typeof setTimeout>; // Таймер автоскрытия индикатора

  // ========================
  // PiP (Picture-in-Picture)
  // ========================
  let isPip = $state(false); // Видео в режиме PiP?

  // ========================
  // Полноэкранный режим окна
  // ========================
  // Состояние приходит из main-процесса, а не хранится тут: в fullscreen
  // можно войти и выйти мимо нашей кнопки (Ctrl+Cmd+F на macOS, F11).
  let isFullscreen = $state(false);

  // ========================
  // Warp-эффект (ускорение ×2)
  // ========================
  let isWarpActive = $state(false); // Показывать ли warp-эффект?
  let clickTimeout: ReturnType<typeof setTimeout> | undefined; // Таймер различения single/double click
  let seekFeedbackSide = $state<"left" | "right" | null>(null); // Сторона последней перемотки
  let seekFeedbackAmount = $state(10); // Накопленный шаг для отображения (10, 20, 30...)
  let seekFeedbackTick = $state(0); // Ключ для перезапуска анимации
  let seekFeedbackTimeout: ReturnType<typeof setTimeout> | undefined; // Таймер скрытия индикатора
  let lastSeekFeedbackAt = 0; // Время последнего шага перемотки для накопления
  const SEEK_FEEDBACK_ACCUMULATION_WINDOW_MS = 600;

  // ========================
  // Перемотка перетаскиванием мыши
  // ========================
  let isDragSeeking = $state(false); // Идёт ли перемотка перетаскиванием?
  let dragSeekDelta = $state(0); // Смещение от точки начала жеста (секунды)
  let dragSeekTarget = $state(0); // Время, к которому перематываем

  /**
   * Показывает контролы и запускает таймер автоскрытия.
   * Вызывается при движении мыши, нажатии клавиш и скролле тачпада.
   * Если пользователь перетаскивает прогресс-бар или курсор над контролами —
   * автоскрытие отключается.
   */
  function handleMouseMove() {
    showControls = true;
    clearTimeout(controlsTimeout);
    if (!isDragging && !isMouseOverControls) {
      controlsTimeout = setTimeout(() => {
        showControls = false;
      }, 1000); // Прятать контролы через 1 секунду бездействия
    }
  }

  // ========================
  // Инициализация обработчика клавиатуры
  // ========================
  // KeyboardHandler управляет всеми клавиатурными сочетаниями.
  // Передаём getter для videoElement (может быть undefined при инициализации)
  // и набор колбэков для управления состоянием UI.
  const keyboardHandler = new KeyboardHandler(() => videoElement, {
    getPlaybackRate: () => userPlaybackRate,
    setPlaybackRate: (rate: number) => {
      userPlaybackRate = rate;
    },
    getDuration: () => duration,
    onShowControls: handleMouseMove,
    // При изменении скорости показываем индикатор "1.5x" на 500мс
    onShowSpeedIndicator: () => {
      showSpeedIndicator = true;
      clearTimeout(speedIndicatorTimeout);
      speedIndicatorTimeout = setTimeout(() => {
        showSpeedIndicator = false;
      }, 500);
    },
    // Warp-эффект при ускорении ×2 (зажатый пробел)
    onWarpStart: () => {
      isWarpActive = true;
    },
    onWarpEnd: () => {
      isWarpActive = false;
    },
  });

  // ========================
  // Инициализация обработчика тачпада
  // ========================
  // TouchpadHandler обрабатывает горизонтальный scroll тачпада для перемотки видео.
  const touchpadHandler = new TouchpadHandler(() => videoElement, {
    onShowControls: handleMouseMove,
  });

  // ========================
  // Инициализация обработчика перемотки мышью
  // ========================
  // DragSeekHandler перематывает видео перетаскиванием мыши в любом месте кадра.
  const dragSeekHandler = new DragSeekHandler(() => videoElement, {
    getDuration: () => duration,
    onShowControls: handleMouseMove,
    onSeekStart: () => {
      // Отменяем отложенный play/pause: жест оказался перемоткой, а не кликом
      clearTimeout(clickTimeout);
      isDragSeeking = true;
      isDragging = true; // Держим контролы на экране, пока идёт жест
      showControls = true;
      clearTimeout(controlsTimeout);
    },
    onSeekUpdate: (deltaSeconds: number, targetTime: number) => {
      dragSeekDelta = deltaSeconds;
      dragSeekTarget = targetTime;
    },
    onSeekEnd: () => {
      isDragSeeking = false;
      isDragging = false;
      handleMouseMove(); // Запускаем автоскрытие контролов заново
    },
  });

  /**
   * Обработчик события loadedmetadata.
   * Срабатывает, когда браузер загрузил метаданные видео (разрешение, длительность).
   * Просит Electron изменить размер окна под размер видео.
   */
  function handleLoadedMetadata() {
    if (videoElement) {
      const width = videoElement.videoWidth;
      const height = videoElement.videoHeight;

      // Если запущено в Electron — ресайзим окно под размер видео
      if (window.electronAPI) {
        window.electronAPI.resizeWindow(width, height);
      }
    }
  }

  /**
   * Обработчик окончания видео.
   * Ставит видео на паузу и показывает контролы.
   */
  function onEnd() {
    paused = true;
    showControls = true;
  }

  /**
   * Перемотка по двойному клику:
   * левая половина — назад на 10 секунд, правая — вперед на 10 секунд.
   */
  function handleSeekBySide(event: MouseEvent) {
    if (!videoElement || !videoContainer) return;

    const now = Date.now();
    const rect = videoContainer.getBoundingClientRect();
    const isLeftHalf = event.clientX < rect.left + rect.width / 2;
    const side: "left" | "right" = isLeftHalf ? "left" : "right";
    const seekDelta = isLeftHalf ? -10 : 10;
    const nextTime = Math.min(
      duration || videoElement.duration || 0,
      Math.max(0, videoElement.currentTime + seekDelta),
    );

    videoElement.currentTime = nextTime;
    const shouldAccumulate =
      seekFeedbackSide === side &&
      now - lastSeekFeedbackAt <= SEEK_FEEDBACK_ACCUMULATION_WINDOW_MS;

    seekFeedbackAmount = shouldAccumulate ? seekFeedbackAmount + 10 : 10;
    seekFeedbackSide = side;
    lastSeekFeedbackAt = now;
    seekFeedbackTick += 1;
    clearTimeout(seekFeedbackTimeout);
    seekFeedbackTimeout = setTimeout(() => {
      seekFeedbackSide = null;
      seekFeedbackAmount = 10;
    }, 420);
    handleMouseMove();
  }

  /**
   * YouTube-подобная схема кликов:
   * - single click => play/pause (с задержкой, чтобы не конфликтовал с double click)
   * - 2/4/6... click в серии => перемотка ±10 секунд
   */
  function handleVideoClick(event: MouseEvent) {
    if (!videoElement) return;

    // Click после перемотки перетаскиванием игнорируем, иначе каждый жест
    // заканчивался бы паузой
    if (dragSeekHandler.shouldSuppressClick()) return;

    const clickCountInSeries = event.detail;
    clearTimeout(clickTimeout);

    if (clickCountInSeries === 1) {
      clickTimeout = setTimeout(() => {
        togglePlay(videoElement);
      }, 220);
      return;
    }

    if (clickCountInSeries % 2 === 0) {
      handleSeekBySide(event);
    }
  }

  // ========================
  // Отслеживание PiP-режима
  // ========================
  // При входе в PiP — скрываем основное окно Electron.
  // При выходе из PiP — показываем окно обратно.
  $effect(() => {
    if (!videoElement) return;

    const onEnterPiP = () => {
      isPip = true;
      window.electronAPI?.hideWindow(); // Прячем окно, т.к. видео в PiP
    };
    const onLeavePiP = () => {
      isPip = false;
      window.electronAPI?.showWindow(); // Показываем окно обратно
    };

    videoElement.addEventListener("enterpictureinpicture", onEnterPiP);
    videoElement.addEventListener("leavepictureinpicture", onLeavePiP);

    // Очистка: убираем слушатели при уничтожении компонента
    return () => {
      videoElement.removeEventListener("enterpictureinpicture", onEnterPiP);
      videoElement.removeEventListener("leavepictureinpicture", onLeavePiP);
    };
  });

  // ========================
  // Синхронизация состояния fullscreen с main-процессом
  // ========================
  // Спрашиваем текущее состояние при монтировании и подписываемся на события
  // окна, чтобы иконка кнопки всегда соответствовала реальности.
  $effect(() => {
    const api = window.electronAPI;
    if (!api?.onFullscreenChange) return;

    api.isFullscreen?.().then((value) => {
      isFullscreen = value;
    });

    return api.onFullscreenChange((value) => {
      isFullscreen = value;
    });
  });

  // ========================
  // Обработка перемотки перетаскиванием мыши
  // ========================
  // pointerdown вешаем на само видео (панель контролов и её прогресс-бар
  // обрабатывают перетаскивание сами), а move/up — на window, чтобы жест
  // продолжался, даже если курсор ушёл за пределы окна.
  $effect(() => {
    if (!videoElement) return;

    const onPointerDown = (e: PointerEvent) =>
      dragSeekHandler.handlePointerDown(e);
    const onPointerMove = (e: PointerEvent) =>
      dragSeekHandler.handlePointerMove(e);
    const onPointerUp = (e: PointerEvent) => dragSeekHandler.handlePointerUp(e);
    const onPointerCancel = (e: PointerEvent) =>
      dragSeekHandler.handlePointerCancel(e);
    const onKeyDown = (e: KeyboardEvent) => dragSeekHandler.handleKeyDown(e);
    // Захват указателя потерян (окно ушло из фокуса, система забрала жест) —
    // завершаем перемотку, иначе она "залипнет" до следующего pointerdown
    const onInterrupt = () => dragSeekHandler.handleInterrupt();

    // Очередь перемотки: следующая позиция применяется, когда видео отработало
    // предыдущую (см. requestSeek в drag-seek.svelte.ts)
    const onSeeked = () => dragSeekHandler.handleSeeked();

    videoElement.addEventListener("pointerdown", onPointerDown);
    videoElement.addEventListener("lostpointercapture", onInterrupt);
    videoElement.addEventListener("seeked", onSeeked);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      videoElement.removeEventListener("pointerdown", onPointerDown);
      videoElement.removeEventListener("lostpointercapture", onInterrupt);
      videoElement.removeEventListener("seeked", onSeeked);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  });

  // ========================
  // Обработка wheel-событий (тачпад)
  // ========================
  // Подключаем обработчик wheel с passive: false, чтобы иметь возможность
  // вызвать preventDefault() и предотвратить навигацию браузера (назад/вперёд).
  $effect(() => {
    if (!videoContainer) return;

    const handler = (e: WheelEvent) => touchpadHandler.handleWheel(e);
    videoContainer.addEventListener("wheel", handler, { passive: false });

    return () => {
      videoContainer?.removeEventListener("wheel", handler);
    };
  });

  // Очистка таймеров и обработчиков при уничтожении компонента
  onDestroy(() => {
    clearTimeout(controlsTimeout);
    clearTimeout(speedIndicatorTimeout);
    clearTimeout(clickTimeout);
    clearTimeout(seekFeedbackTimeout);
    keyboardHandler.cleanup();
    dragSeekHandler.cleanup();
  });
</script>

<!-- Привязка глобальных клавиатурных событий к KeyboardHandler -->
<svelte:window
  onkeydown={(e) => keyboardHandler.handleKeyDown(e)}
  onkeyup={(e) => keyboardHandler.handleKeyUp(e)}
  onblur={() => {
    // Окно ушло из фокуса: keyup и pointerup до нас не дойдут — сбрасываем
    // зажатые клавиши и текущий жест перемотки вручную
    keyboardHandler.handleWindowBlur();
    dragSeekHandler.handleInterrupt();
  }}
/>

<!--
  Контейнер видеоплеера.
  - cursor-none: скрывает курсор, когда контролы не видны (для кинематографичности)
  - onclick на видео: single click => play/pause, double click => seek ±10s
  - onmousemove: показывает контролы при движении мыши
  - onmouseleave: прячет контролы при уходе мыши
-->
<div
  bind:this={videoContainer}
  class="relative w-full h-full bg-black group overflow-hidden"
  class:cursor-none={!showControls}
  class:cursor-ew-resize={isDragSeeking}
  role="application"
  onmousemove={handleMouseMove}
  onmouseleave={() => {
    showControls = false;
  }}
>
  <!-- HTML5 Video элемент -->
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoElement}
    src={videoSrc}
    class="w-full h-full object-contain"
    bind:paused
    bind:duration
    bind:currentTime
    bind:volume
    onloadedmetadata={handleLoadedMetadata}
    onended={onEnd}
    onclick={handleVideoClick}
    autoplay
  ></video>

  {#if seekFeedbackSide}
    {#key `${seekFeedbackSide}-${seekFeedbackTick}`}
      <div
        class="absolute inset-y-0 w-1/2 flex items-center pointer-events-none z-20"
        class:justify-start={seekFeedbackSide === "left"}
        class:justify-end={seekFeedbackSide === "right"}
        class:left-0={seekFeedbackSide === "left"}
        class:right-0={seekFeedbackSide === "right"}
      >
        <div class="seek-feedback-badge">
          {seekFeedbackSide === "left"
            ? `-${seekFeedbackAmount}s`
            : `+${seekFeedbackAmount}s`}
        </div>
      </div>
    {/key}
  {/if}

  <!-- Большая кнопка Play по центру экрана (показывается только на паузе).
       Во время перемотки перетаскиванием прячем: пауза там техническая,
       и кнопка перекрывала бы индикатор перемотки. -->
  {#if paused && !isDragSeeking}
    <PlayOverlay {showControls} />
  {/if}

  <!-- Индикатор перемотки перетаскиванием мыши -->
  <DragSeekIndicator
    isActive={isDragSeeking}
    deltaSeconds={dragSeekDelta}
    targetTime={dragSeekTarget}
  />

  <!-- Warp-эффект при ускорении ×2 (зажатый пробел) -->
  <WarpEffect isActive={isWarpActive} />

  <!-- Индикатор скорости воспроизведения (верхний правый угол, например "1.5x") -->
  <SpeedIndicator {showSpeedIndicator} {userPlaybackRate} />

  <!-- Нижняя панель управления (прогресс-бар, громкость, PiP-кнопка) -->
  <VideoControls
    {showControls}
    bind:currentTime
    {duration}
    bind:volume
    bind:isDragging
    {paused}
    onPipToggle={() => togglePip(videoElement)}
    onFullscreenToggle={() => window.electronAPI?.toggleFullscreen()}
    onClose={() => window.electronAPI?.closeWindow()}
    {isFullscreen}
    onHoverStart={() => {
      isMouseOverControls = true;
      clearTimeout(controlsTimeout); // Не прячем контролы, пока курсор над ними
    }}
    onHoverEnd={() => {
      isMouseOverControls = false;
      handleMouseMove(); // Запускаем таймер автоскрытия заново
    }}
  />
</div>

<style>
  .seek-feedback-badge {
    margin: 0 2.25rem;
    padding: 0.7rem 1rem;
    border-radius: 9999px;
    color: rgba(255, 255, 255, 0.92);
    background: rgba(15, 15, 15, 0.42);
    backdrop-filter: blur(8px);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    animation: seek-feedback-pop 420ms ease-out both;
  }

  @keyframes seek-feedback-pop {
    0% {
      opacity: 0;
      transform: scale(0.9);
    }
    20% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1.02);
    }
  }
</style>
