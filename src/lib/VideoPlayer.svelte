<!--
  ============================================================================
  VideoPlayer.svelte — Основной компонент видеоплеера
  ============================================================================
  Сам по себе ничего не решает: держит <video>, состояние воспроизведения и
  собирает вместе обработчики из logic/, связывая их с UI.

  Что здесь живёт:
  1. Элемент <video> и его состояние (пауза, громкость, время, скорость)
  2. displayTime — позиция для отрисовки, снимается по кадрам, а не по
     редкому timeupdate
  3. Сборка обработчиков ввода и колбэки от них в состояние UI
  4. Авто-ресайз окна Electron, PiP и синхронизация fullscreen с main

  Что вынесено (каждый файл — со своими инвариантами в шапке):
    seek-queue        — единственное место, которое двигает currentTime
    keyboard          — клавиатура, короткие и длинные нажатия
    touchpad          — свайп по тачпаду
    drag-seek         — перемотка перетаскиванием
    hold-zones        — удержание левой кнопки по трём зонам кадра
    click-seek        — клики: пауза и перемотка по половинам кадра
    pointer-router    — арбитраж левой кнопки между этими тремя жестами
    hold-actions      — сами длинные действия (×2, ×16, прыжки назад)
    seek-indicator    — цифры индикатора перемотки, общего для всех жестов
    controls-visibility — показ и автоскрытие панели
    recovery          — восстановление после сбоя декодера
  ============================================================================
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import PlayOverlay from "./components/PlayOverlay.svelte";
  import SpeedIndicator from "./components/SpeedIndicator.svelte";
  import VideoControls from "./components/VideoControls.svelte";
  import WarpEffect from "./components/WarpEffect.svelte";
  import DragSeekIndicator from "./components/DragSeekIndicator.svelte";
  import { togglePip } from "./logic/video-actions";
  import { KeyboardHandler, availableSpeeds } from "./logic/keyboard.svelte";
  import { TouchpadHandler } from "./logic/touchpad.svelte";
  import { DragSeekHandler } from "./logic/drag-seek.svelte";
  import { HoldActionRunner } from "./logic/hold-actions";
  import { HoldZoneHandler, type HoldZone } from "./logic/hold-zones.svelte";
  import { SeekQueue } from "./logic/seek-queue.svelte";
  import { SeekIndicator } from "./logic/seek-indicator.svelte";
  import { ClickSeekHandler } from "./logic/click-seek";
  import { PointerRouter } from "./logic/pointer-router";
  import { ControlsVisibility } from "./logic/controls-visibility.svelte";
  import { PlaybackRecovery } from "./logic/recovery";
  import { debugLog } from "./logic/debug-log";

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
  // Позиция для отрисовки прогресс-бара. Отдельно от currentTime, потому что
  // тот обновляется по событию timeupdate — а оно приходит всего ~4 раза в
  // секунду, и метка на баре двигалась рывками. Во время перемотки ведётся за
  // целью очереди seek-ов, чтобы не ждать, пока видео доедет.
  let displayTime = $state(0);
  let volume = $state(1); // Громкость (0.0 — 1.0)

  // ========================
  // Скорость воспроизведения
  // ========================
  // userPlaybackRate — скорость, выбранная пользователем (стрелками ↑↓).
  // Отличается от videoElement.playbackRate, которая может временно меняться
  // при зажатии пробела (×2) или стрелки вправо (×16).
  let userPlaybackRate = $state(1.0);

  // ========================
  // Панель управления
  // ========================
  // Показ, автоскрытие через секунду и закрепление на время жеста —
  // см. controls-visibility.svelte.ts.
  const controls = new ControlsVisibility();

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
  // Warp-эффект (ускорение ×16)
  // ========================
  let isWarpActive = $state(false); // Показывать ли warp-эффект?

  // ========================
  // Индикатор перемотки
  // ========================
  // Один на все жесты: драг мышью, свайп, двойной клик и удержание ←/→.
  // Кто и какие цифры туда пишет — см. seek-indicator.svelte.ts.
  const seekIndicator = new SeekIndicator();

  // ========================
  // Удержание левой кнопки по зонам кадра
  // ========================
  let holdZone = $state<HoldZone | null>(null); // Активная зона удержания (null — нет)

  // ========================
  // Восстановление после сбоя декодера
  // ========================
  let isRecovering = $state(false); // Идёт перезагрузка источника после ошибки

  // ========================
  // Очередь перемоток
  // ========================
  // Одна на элемент, общая для всех жестов (клавиатура, тачпад, мышь): видео
  // получает не больше одной перемотки за раз, промежуточные позиции
  // схлопываются, а метка на баре ведётся за целью (см. seek-queue.ts).
  const seekQueue = new SeekQueue(() => videoElement);

  // ========================
  // Восстановление после сбоя декодера
  // ========================
  // Аппаратный декодер (VideoToolbox на macOS) иногда падает при быстрой
  // перемотке: элемент отдаёт error.code = 3 и навсегда застревает в
  // seeking = true. Событие 'seeked' после этого не приходит никогда, очередь
  // перемоток остаётся заблокированной, и вместе с ней умирают все жесты
  // разом. Лечится только перезагрузкой источника — см. recovery.ts.
  const recovery = new PlaybackRecovery(() => videoElement, seekQueue, {
    getPlaybackRate: () => userPlaybackRate,
    onRecoveryStart: () => {
      // Жесты и длинные действия могли остаться «зажатыми» на умершем
      // элементе — сворачиваем их, чтобы после перезагрузки не всплыла
      // чужая скорость или бесконечный интервал перемотки назад
      holdActions.stop();
      isWarpActive = false;
      holdZone = null;
      seekIndicator.reset();
      isRecovering = true;
      controls.show();
    },
    onRecoveryEnd: () => {
      isRecovering = false;
      controls.keepAlive();
    },
  });

  // ========================
  // Длинные действия (×2, ×16, прыжки назад)
  // ========================
  // Один исполнитель на плеер: и клавиатура, и удержание мыши по зонам кадра
  // ходят через него, поэтому два удержания одновременно невозможны, а скорость
  // всегда возвращается к пользовательской (см. hold-actions.ts).
  const holdActions = new HoldActionRunner(() => videoElement, seekQueue, {
    getPlaybackRate: () => userPlaybackRate,
    // Warp-эффект при ускорении ×16 (зажатая → / правая треть кадра)
    onWarpStart: () => {
      isWarpActive = true;
    },
    onWarpEnd: () => {
      isWarpActive = false;
    },
    // Удержание ←/→ (и крайних зон кадра) — тоже перемотка, показываем тот же
    // индикатор, что у драга и свайпа. Смещение считаем от позиции на старте
    // удержания: displayTime уже ведётся за целью очереди каждый кадр.
    onActionStart: (action) => {
      if (action === "boost") return;
      seekIndicator.holdStarted(seekQueue.getTargetTime());
      // Держим контролы на экране: при удержании клавиши мышь не двигается,
      // и панель (а под ней и прогресс-бар) спряталась бы посреди перемотки.
      // Зоны кадра делают то же самое в onHoldStart.
      controls.pin();
    },
    onActionEnd: (action) => {
      seekIndicator.holdEnded();
      if (action === "boost") return;
      controls.unpin(); // Панель снова прячется сама
    },
  });

  // ========================
  // Инициализация обработчика клавиатуры
  // ========================
  // KeyboardHandler управляет всеми клавиатурными сочетаниями.
  // Передаём getter для videoElement (может быть undefined при инициализации)
  // и набор колбэков для управления состоянием UI.
  const keyboardHandler = new KeyboardHandler(
    () => videoElement,
    seekQueue,
    holdActions,
    {
      getPlaybackRate: () => userPlaybackRate,
      setPlaybackRate: (rate: number) => {
        userPlaybackRate = rate;
      },
      getDuration: () => duration,
      onShowControls: () => controls.keepAlive(),
      onShowSpeedIndicator: flashSpeedIndicator,
    },
  );

  /** Показываем индикатор "1.5x" на 500мс (клавиши ↑↓ и меню скорости в панели). */
  function flashSpeedIndicator() {
    showSpeedIndicator = true;
    clearTimeout(speedIndicatorTimeout);
    speedIndicatorTimeout = setTimeout(() => {
      showSpeedIndicator = false;
    }, 500);
  }

  /**
   * Смена скорости из панели управления (то же, что стрелки ↑↓).
   * Если сейчас идёт длинное действие (×2 на пробеле, ×16 на →), скорость
   * элемента не трогаем: её перебивает HoldActionRunner и он же вернёт
   * userPlaybackRate при отпускании.
   */
  function handleRateChange(rate: number) {
    userPlaybackRate = rate;
    if (videoElement && !holdActions.isActive()) {
      videoElement.playbackRate = rate;
    }
    flashSpeedIndicator();
  }

  // ========================
  // Инициализация обработчика тачпада
  // ========================
  // TouchpadHandler обрабатывает горизонтальный scroll тачпада для перемотки видео.
  const touchpadHandler = new TouchpadHandler(() => videoElement, seekQueue, {
    getDuration: () => duration,
    onShowControls: () => controls.keepAlive(),
    // У свайпа нет явного конца — считаем жест законченным, если события
    // wheel перестали приходить (инерция затухает сама)
    onSeekUpdate: (deltaSeconds: number, targetTime: number) => {
      seekIndicator.touchpadMoved(deltaSeconds, targetTime);
    },
  });

  // ========================
  // Инициализация обработчика перемотки мышью
  // ========================
  // DragSeekHandler перематывает видео перетаскиванием мыши в любом месте кадра.
  const dragSeekHandler = new DragSeekHandler(() => videoElement, seekQueue, {
    getDuration: () => duration,
    onShowControls: () => controls.keepAlive(),
    onSeekStart: () => {
      // Отменяем отложенный play/pause: жест оказался перемоткой, а не кликом
      clickSeekHandler.cancelPendingToggle();
      seekIndicator.dragStarted();
      controls.pin(); // Держим контролы на экране, пока идёт жест
    },
    onSeekUpdate: (deltaSeconds: number, targetTime: number) => {
      seekIndicator.dragMoved(deltaSeconds, targetTime);
    },
    onSeekEnd: () => {
      // Забираем актуальное состояние прямо у элемента: play() снимает паузу
      // синхронно, а связанное `paused` обновится только по событию 'play'.
      // Без этого между концом жеста и событием успевала мигнуть большая
      // кнопка Play в центре кадра.
      if (videoElement) paused = videoElement.paused;
      seekIndicator.dragEnded();
      controls.unpin(); // Панель снова прячется сама
    },
  });

  // ========================
  // Инициализация удержания по зонам кадра
  // ========================
  // HoldZoneHandler делит кадр на три вертикальные полосы и повторяет зажатием
  // левой кнопки то же, что делают зажатые ← / пробел / → (см. hold-zones.svelte.ts).
  const holdZoneHandler = new HoldZoneHandler(() => videoElement, holdActions, {
    getBounds: () => videoContainer?.getBoundingClientRect(),
    onHoldStart: (zone) => {
      // Отменяем отложенный play/pause от предыдущего клика: серия
      // "клик + удержание" не должна закончиться паузой
      clickSeekHandler.cancelPendingToggle();
      holdZone = zone;
      // При перемотке (крайние зоны) держим контролы на экране: мышь не
      // двигается, и без этого прогресс-бар спрятался бы через секунду.
      // В центре — ускорение ×2, там контролы не нужны (как с пробелом).
      if (zone !== "center") controls.pin();
    },
    onHoldEnd: () => {
      holdZone = null;
      controls.unpin(); // Панель снова прячется сама
    },
  });

  /**
   * Обработчик события loadedmetadata.
   * Срабатывает, когда браузер загрузил метаданные видео (разрешение, длительность).
   * Просит Electron изменить размер окна под размер видео.
   */
  function handleLoadedMetadata() {
    // Во время восстановления после сбоя декодера метаданные приходят повторно,
    // на том же самом файле. Ресайзить и центрировать окно ещё раз не нужно —
    // размер уже подобран, а окно прыгнуло бы на середину экрана.
    if (recovery.isActive()) return;

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
    controls.show();
  }

  // ========================
  // Арбитраж левой кнопки мыши
  // ========================
  // Удержание по зонам и перемотка перетаскиванием слушают одно и то же
  // нажатие и расходятся по времени и расстоянию. Кто кого перебивает —
  // записано в pointer-router.ts, здесь только подписка на события.
  const pointerRouter = new PointerRouter(holdZoneHandler, dragSeekHandler);

  // ========================
  // Инициализация обработчика кликов по кадру
  // ========================
  // ClickSeekHandler различает одиночный клик (пауза) и чётные клики серии
  // (перемотка ±10 с по половине кадра) — см. click-seek.ts.
  const clickSeekHandler = new ClickSeekHandler(() => videoElement, seekQueue, {
    getBounds: () => videoContainer?.getBoundingClientRect(),
    getDuration: () => duration,
    // Click после перемотки перетаскиванием или удержания зоны нужно
    // проглотить, иначе каждый жест заканчивался бы паузой
    shouldSuppressClick: () => pointerRouter.shouldSuppressClick(),
    onShowControls: () => controls.keepAlive(),
    onSeek: (side, targetTime) => seekIndicator.clickSeeked(side, targetTime),
  });

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
  // Индикатор перемотки: цифры удержания
  // ========================
  // Драг, свайп и клик сообщают смещение сами. У удержания (←/→ и крайние
  // зоны) своего «шага» нет — ведём цифры по displayTime, пока действие живо:
  // он идёт за целью очереди и на прыжках назад, и на ×16, где время двигает
  // само воспроизведение. Как только удержание закончилось, эффект перестаёт
  // писать, и на экране замирает последнее значение до конца затухания.
  $effect(() => {
    if (!seekIndicator.isHolding) return;
    seekIndicator.trackHold(displayTime);
  });

  // ========================
  // Плавное движение метки на прогресс-баре
  // ========================
  // Пока видео играет (или идёт перемотка мышью), позицию для отрисовки
  // опрашиваем каждый кадр: currentTime у элемента идёт непрерывно, это
  // событие timeupdate редкое. На паузе кадровый опрос не нужен — просто
  // повторяем реальную позицию.
  $effect(() => {
    if (
      paused &&
      !seekIndicator.isDragSeeking &&
      !seekIndicator.isTouchpadSeeking &&
      !controls.isPinned &&
      !holdZone
    ) {
      // На паузе позицию двигает только timeupdate, а он приходит уже после
      // того, как seek завершится. Поэтому пока в очереди есть неотработанная
      // перемотка, ведём метку за её целью: клик по таймлайну на паузе иначе
      // кидал метку вперёд (пока держим кнопку — жест ведёт за целью), назад
      // (отпустили: currentTime ещё старый) и снова вперёд, когда видео
      // доезжало. currentTime читаем всегда — он же зависимость эффекта.
      const realTime = currentTime;
      displayTime = seekQueue.isSeekPending()
        ? seekQueue.getTargetTime()
        : realTime;
      return;
    }

    let frame: number;
    const tick = () => {
      // Всегда берём цель очереди перемоток: вне жеста это и есть currentTime,
      // а во время жеста — позиция, к которой ведёт пользователь. Видео догоняет
      // её через очередь, и метка не должна ждать, пока доедет seek.
      displayTime = seekQueue.getTargetTime();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  });

  // ========================
  // Обработка перемотки перетаскиванием мыши
  // ========================
  // pointerdown вешаем на само видео (панель контролов и её прогресс-бар
  // обрабатывают перетаскивание сами), а move/up — на window, чтобы жест
  // продолжался, даже если курсор ушёл за пределы окна.
  $effect(() => {
    if (!videoElement) return;

    const onPointerDown = (e: PointerEvent) => pointerRouter.handlePointerDown(e);
    const onPointerMove = (e: PointerEvent) => pointerRouter.handlePointerMove(e);
    const onPointerUp = (e: PointerEvent) => pointerRouter.handlePointerUp(e);
    const onPointerCancel = (e: PointerEvent) =>
      pointerRouter.handlePointerCancel(e);
    const onKeyDown = (e: KeyboardEvent) => pointerRouter.handleKeyDown(e);
    // Захват указателя потерян (окно ушло из фокуса, система забрала жест) —
    // завершаем жест, иначе он "залипнет" до следующего pointerdown
    const onInterrupt = () => pointerRouter.handleInterrupt();

    // Очередь перемоток: следующая позиция применяется, когда видео отработало
    // предыдущую (см. seek-queue.ts)
    const onSeeked = () => {
      seekQueue.handleSeeked();
      recovery.handleSeeked();
    };

    // Сбой декодера и «залипший» seek: и то, и другое лечится перезагрузкой
    // источника, иначе плеер стоит намертво (см. recovery.ts)
    const onSeeking = () => recovery.handleSeeking();
    const onError = () => recovery.handleError();

    videoElement.addEventListener("pointerdown", onPointerDown);
    videoElement.addEventListener("lostpointercapture", onInterrupt);
    videoElement.addEventListener("seeked", onSeeked);
    videoElement.addEventListener("seeking", onSeeking);
    videoElement.addEventListener("error", onError);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      videoElement.removeEventListener("pointerdown", onPointerDown);
      videoElement.removeEventListener("lostpointercapture", onInterrupt);
      videoElement.removeEventListener("seeked", onSeeked);
      videoElement.removeEventListener("seeking", onSeeking);
      videoElement.removeEventListener("error", onError);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  });

  // ========================
  // Сторож зависаний и отладочный лог
  // ========================
  // Сторож ловит перемотку, которая не завершилась (событие 'error' приходит
  // не всегда — элемент может просто застрять в seeking).
  // Лог событий пишется только в dev-сборке: в production debugLog выключен
  // целиком и все вызовы ниже — пустышки (см. debug-log.ts).
  $effect(() => {
    if (!videoElement) return;

    recovery.start();

    // Снимок состояния, который лог прикладывает к каждому событию
    debugLog.setProbe(() => ({
      currentTime: Math.round(videoElement.currentTime * 1000) / 1000,
      seeking: videoElement.seeking,
      paused: videoElement.paused,
      readyState: videoElement.readyState,
      networkState: videoElement.networkState,
      playbackRate: videoElement.playbackRate,
      userPlaybackRate,
      queue: seekQueue.getDebugState(),
      recovering: recovery.isActive(),
    }));

    const stopWatchingVideo = debugLog.watchVideo(videoElement);
    const uninstallDebugLog = debugLog.install();

    return () => {
      recovery.cleanup();
      stopWatchingVideo();
      uninstallDebugLog();
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
  // ========================
  // Правый клик: пауза + сворачивание окна
  // ========================
  // Контекстное меню в плеере не нужно, поэтому правая кнопка занята под
  // «быстро убрать с глаз»: ставим на паузу и сворачиваем окно.
  // Отложенное переключение паузы от одиночного левого клика снимаем — иначе
  // связка «клик, затем правый клик» разбудила бы видео уже после сворачивания.
  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    clickSeekHandler.cancelPendingToggle();
    videoElement?.pause();
    window.electronAPI?.minimizeWindow();
  }

  onDestroy(() => {
    clearTimeout(speedIndicatorTimeout);
    controls.cleanup();
    keyboardHandler.cleanup();
    pointerRouter.cleanup();
    clickSeekHandler.cleanup();
    seekIndicator.cleanup();
    recovery.cleanup();
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
    pointerRouter.handleInterrupt();
  }}
/>

<!--
  Контейнер видеоплеера.
  - cursor-none: скрывает курсор, когда контролы не видны (для кинематографичности)
  - onclick на видео: single click => play/pause, double click => seek ±10s
  - oncontextmenu: правый клик => пауза и сворачивание окна
  - onmousemove: показывает контролы при движении мыши
  - onmouseleave: прячет контролы при уходе мыши
-->
<div
  bind:this={videoContainer}
  class="relative w-full h-full bg-black group overflow-hidden"
  class:cursor-none={!controls.isVisible}
  class:cursor-ew-resize={seekIndicator.isDragSeeking}
  role="application"
  onmousemove={() => controls.keepAlive()}
  onmouseleave={() => controls.hide()}
  oncontextmenu={handleContextMenu}
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
    onclick={(e) => clickSeekHandler.handleClick(e)}
    autoplay
  ></video>

  <!-- Большая кнопка Play по центру экрана (показывается только на паузе).
       Во время перемотки (мышью или свайпом) прячем: пауза там техническая,
       и кнопка перекрывала бы индикатор перемотки. -->
  {#if paused && !seekIndicator.isDragSeeking && !seekIndicator.isTouchpadSeeking}
    <PlayOverlay showControls={controls.isVisible} />
  {/if}

  <!-- Восстановление после сбоя декодера: источник перезагружается, позиция
       возвращается. Обычно занимает доли секунды, но без подписи выглядело бы
       как случайный рывок видео. -->
  {#if isRecovering}
    <div
      class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
    >
      <div
        class="px-3 py-1.5 rounded-lg bg-black/60 text-white text-sm backdrop-blur-sm"
      >
        Восстановление…
      </div>
    </div>
  {/if}

  <!-- Индикатор перемотки: драг мышью, свайп по тачпаду, удержание ←/→ и
       перемотка двойным кликом -->
  <DragSeekIndicator
    isActive={seekIndicator.isActive}
    deltaSeconds={seekIndicator.delta}
    targetTime={seekIndicator.target}
  />

  <!-- Warp-эффект при ускорении ×16 (зажатая стрелка вправо) -->
  <WarpEffect isActive={isWarpActive} />

  <!-- Индикатор скорости воспроизведения (верхний правый угол, например "1.5x") -->
  <SpeedIndicator {showSpeedIndicator} {userPlaybackRate} />

  <!-- Нижняя панель управления (прогресс-бар, громкость, PiP-кнопка) -->
  <VideoControls
    showControls={controls.isVisible}
    {displayTime}
    onSeek={(time) => seekQueue.request(time)}
    {duration}
    playbackRate={userPlaybackRate}
    speeds={availableSpeeds}
    onRateChange={handleRateChange}
    bind:volume
    onScrubStart={() => controls.pin()}
    onScrubEnd={() => controls.unpin()}
    {paused}
    onPipToggle={() => togglePip(videoElement)}
    onFullscreenToggle={() => window.electronAPI?.toggleFullscreen()}
    onClose={() => window.electronAPI?.closeWindow()}
    {isFullscreen}
    onHoverStart={() => controls.hoverStart()}
    onHoverEnd={() => controls.hoverEnd()}
  />
</div>
