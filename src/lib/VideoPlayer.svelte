<!--
  ============================================================================
  VideoPlayer.svelte — Основной компонент видеоплеера
  ============================================================================
  Отвечает за:
  1. Отображение HTML5 <video> элемента
  2. Управление состоянием воспроизведения (пауза, громкость, время, скорость)
  3. Показ/скрытие контролов (с автоскрытием через 1 секунду)
  4. Обработку клавиатурных сочетаний (через KeyboardHandler)
  5. Обработку жестов тачпада (через TouchpadHandler)
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
  import {
    safePlay,
    togglePlay,
    toggleFullscreen,
    togglePip,
  } from "./logic/video-actions";
  import { KeyboardHandler } from "./logic/keyboard.svelte";
  import { TouchpadHandler } from "./logic/touchpad.svelte";

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
  // Warp-эффект (ускорение ×2)
  // ========================
  let isWarpActive = $state(false); // Показывать ли warp-эффект?

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
    keyboardHandler.cleanup();
  });
</script>

<!-- Привязка глобальных клавиатурных событий к KeyboardHandler -->
<svelte:window
  onkeydown={(e) => keyboardHandler.handleKeyDown(e)}
  onkeyup={(e) => keyboardHandler.handleKeyUp(e)}
/>

<!--
  Контейнер видеоплеера.
  - cursor-none: скрывает курсор, когда контролы не видны (для кинематографичности)
  - ondblclick: двойной клик — переключение полноэкранного режима
  - onmousemove: показывает контролы при движении мыши
  - onmouseleave: прячет контролы при уходе мыши
-->
<div
  bind:this={videoContainer}
  class="relative w-full h-full bg-black group overflow-hidden"
  class:cursor-none={!showControls}
  role="application"
  ondblclick={() => toggleFullscreen(videoElement)}
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
    onclick={() => togglePlay(videoElement)}
    autoplay
  ></video>

  <!-- Большая кнопка Play по центру экрана (показывается только на паузе) -->
  {#if paused}
    <PlayOverlay {showControls} />
  {/if}

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
