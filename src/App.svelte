<!--
  ============================================================================
  App.svelte — Корневой компонент приложения
  ============================================================================
  Отвечает за:
  1. Отображение экрана приветствия (если видео не загружено)
  2. Отображение видеоплеера (если видео загружено)
  3. Drag & Drop — перетаскивание видеофайлов в окно
  4. Получение файла из Electron (через "Открыть с помощью...")
  5. Определение платформы для платформо-зависимых стилей
  ============================================================================
-->

<script lang="ts">
  import { onMount } from "svelte";
  import VideoPlayer from "./lib/VideoPlayer.svelte";
  import DropVideoIcon from "./lib/icons/DropVideoIcon.svelte";

  // Контейнеры, которые стабильно воспроизводятся HTML5 video в Chromium/Electron.
  const WEB_PLAYABLE_VIDEO_TYPES = [
    { ext: "mp4", mime: "video/mp4", label: "MP4" },
    { ext: "m4v", mime: "video/mp4", label: "M4V" },
    { ext: "webm", mime: "video/webm", label: "WebM" },
    { ext: "ogv", mime: "video/ogg", label: "OGV" },
  ] as const;

  function canBrowserPlayVideoType(mime: string): boolean {
    const probe = document.createElement("video");
    return probe.canPlayType(mime) !== "";
  }

  function isPlayableVideoFile(file: File): boolean {
    const normalizedType = file.type.trim().toLowerCase();
    if (normalizedType) {
      return canBrowserPlayVideoType(normalizedType);
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension) return false;

    const byExtension = WEB_PLAYABLE_VIDEO_TYPES.find((type) => type.ext === extension);
    if (!byExtension) return false;

    return canBrowserPlayVideoType(byExtension.mime);
  }

  // URL текущего видеофайла (null = видео не загружено, показываем welcome-экран)
  let videoSrc = $state<string | null>(null);

  // Флаг: пользователь перетаскивает файл над окном (для визуальной индикации)
  let isDragging = $state(false);

  // Текущая платформа ОС. По умолчанию 'darwin' (macOS).
  // Используется для выбора стилей фона (на Windows другая прозрачность)
  let platform = $state("darwin");

  /**
   * Загружает видео по указанному URL.
   * Если ранее было загружено blob-видео (через drag & drop), освобождаем память,
   * отзывая предыдущий Object URL.
   */
  function loadVideo(url: string) {
    if (videoSrc && videoSrc.startsWith("blob:")) {
      URL.revokeObjectURL(videoSrc);
    }
    videoSrc = url;
  }

  /**
   * При монтировании компонента:
   * 1. Проверяем, есть ли Electron API (приложение запущено через Electron?)
   * 2. Определяем платформу (macOS / Windows / Linux)
   * 3. Проверяем, был ли передан файл при запуске ("Открыть с помощью...")
   * 4. Подписываемся на будущие открытия файлов (через second-instance/open-file)
   */
  onMount(() => {
    if (!window.electronAPI) return;

    let isUnmounted = false;

    // Определяем платформу для платформо-зависимых стилей
    if (window.electronAPI.getPlatform) {
      platform = window.electronAPI.getPlatform();
    }

    // Проверяем, был ли передан файл при запуске приложения
    window.electronAPI.getInitialFile().then((initialFile) => {
      if (initialFile && !isUnmounted) {
        loadVideo(initialFile);
      }
    });

    // Слушаем событие открытия файла (когда приложение уже запущено,
    // а пользователь повторно использует "Открыть с помощью...")
    const unsubscribe = window.electronAPI.onOpenFile((fileURL) => {
      if (!isUnmounted) {
        loadVideo(fileURL);
      }
    });

    return () => {
      isUnmounted = true;
      unsubscribe();
    };
  });

  /**
   * Обработчик события drop — пользователь бросил файл на окно.
   * Проверяет, что файл — видео (по MIME-типу или расширению),
   * создаёт Object URL и загружает видео.
   */
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;

    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      const file = dt.files[0];
      // Проверяем, что контейнер реально поддерживается HTML5 video в Chromium.
      if (isPlayableVideoFile(file)) {
        // Освобождаем память от предыдущего blob URL
        if (videoSrc && videoSrc.startsWith("blob:")) {
          URL.revokeObjectURL(videoSrc);
        }
        // Создаём Object URL для доступа к файлу из <video>
        videoSrc = URL.createObjectURL(file);
      }
    }
  }

  /**
   * Обработчик dragover — файл перетаскивается над окном.
   * preventDefault() необходим, чтобы браузер разрешил drop.
   */
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  /**
   * Обработчик dragleave — файл покинул окно.
   * Проверяем relatedTarget === null, чтобы отличить реальный выход из окна
   * от перехода на дочерний элемент (иначе индикатор будет мигать).
   */
  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    if (e.relatedTarget === null) {
      isDragging = false;
    }
  }
</script>

<!-- Главный контейнер приложения. Занимает весь экран, имеет прозрачный фон. -->
<main
  class="w-screen h-screen bg-transparent overflow-hidden relative flex items-center justify-center text-zinc-900 dark:text-zinc-100 select-none
  "
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  role="application"
>
  <!-- ===== РЕЖИМ ВИДЕО: отображается, когда videoSrc не null ===== -->
  {#if videoSrc}
    <div class="video-container w-full h-full relative group">
      <!--
        Область перетаскивания окна (Drag Handle).
        Располагается вверху экрана. При наведении мыши плавно появляется
        полупрозрачный градиент, чтобы пользователь мог «схватить» окно.
        -webkit-app-region: drag — говорит Electron, что эта область перетаскивает окно.
      -->
      <div
        class="absolute top-0 left-0 w-full h-16 z-50 transition-opacity opacity-0 group-hover:opacity-100 bg-gradient-to-b from-black/50 to-transparent"
        style="-webkit-app-region: drag;"
      ></div>

      <!-- Компонент видеоплеера (управление, прогресс-бар, клавиатурные сочетания) -->
      <VideoPlayer {videoSrc} />
    </div>

    <!-- ===== РЕЖИМ ПРИВЕТСТВИЯ: отображается, когда видео не загружено ===== -->
  {:else}
    <!--
      Title Bar / Drag Handle для экрана приветствия.
      Позволяет перетаскивать окно за верхнюю часть.
    -->
    <div
      class="absolute top-0 left-0 w-full h-12 z-20"
      style="-webkit-app-region: drag;"
    ></div>

    <!-- ===== Welcome Screen: иконка + клавиатурные подсказки ===== -->
    <div
      class="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none"
    >
      <div
        class="flex flex-col items-center gap-6 max-w-sm w-full px-6 transition-transform duration-300"
        class:scale-105={isDragging}
      >
        <!-- Иконка «бросьте видео» + поддерживаемые форматы -->
        <div class="flex flex-col items-center gap-2">
          <DropVideoIcon {isDragging} />
          <p
            class="text-xs text-zinc-500 dark:text-zinc-400 font-medium tracking-wide"
          >
            {WEB_PLAYABLE_VIDEO_TYPES.map((type) => type.label).join(" • ")}
          </p>
        </div>

        <!-- Разделительная линия -->
        <div class="w-full border-t border-zinc-200 dark:border-zinc-800"></div>

        <!-- Подсказки по клавиатурным сочетаниям -->
        <div class="w-full text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
          <div class="grid grid-cols-[90px_1fr] gap-x-5 gap-y-2.5 items-center">
            <!-- Пробел: пауза / воспроизведение -->
            <div class="flex gap-1"><kbd class="flex-1">Space</kbd></div>
            <span>Пауза / Воспроизведение</span>

            <!-- Пробел (зажать): ускорение ×2 -->
            <div class="flex gap-1"><kbd class="flex-1">Space</kbd></div>
            <span>Зажать — ускорение ×2</span>

            <!-- Стрелки влево/вправо: перемотка ±1 сек -->
            <div class="flex gap-1">
              <kbd class="flex-1">←</kbd><kbd class="flex-1">→</kbd>
            </div>
            <span>Перемотка ±1 сек</span>

            <!-- Стрелки (зажать): быстрая перемотка -->
            <div class="flex gap-1">
              <kbd class="flex-1">←</kbd><kbd class="flex-1">→</kbd>
            </div>
            <span>Зажать — быстрая перемотка</span>

            <!-- Стрелки вверх/вниз: скорость воспроизведения -->
            <div class="flex gap-1">
              <kbd class="flex-1">↑</kbd><kbd class="flex-1">↓</kbd>
            </div>
            <span>Скорость воспроизведения</span>

            <!-- Двойной клик: полноэкранный режим -->
            <div
              class="flex justify-center items-center h-[28px] text-zinc-400 dark:text-zinc-500 font-mono text-sm"
            >
              2×клик
            </div>
            <span>Полноэкранный режим</span>
          </div>
        </div>
      </div>
    </div>

    <!--
      Фон экрана приветствия. Прозрачность зависит от платформы:
      - macOS: vibrancy blur работает хорошо - можно более прозрачный (50%/40%)
      - Windows/Linux: blur может не работать или работать плохо - более плотный фон (85%/70%)
    -->
    <div
      class="absolute inset-0 z-0 transition-opacity duration-300 {platform ===
      'darwin'
        ? 'bg-white/50 dark:bg-black/40'
        : 'bg-white/85 dark:bg-black/70'}"
    ></div>

    <!-- Визуальная индикация при drag & drop (синяя подсветка + рамка) -->
    {#if isDragging}
      <div
        class="absolute inset-0 bg-blue-500/10 border-4 border-blue-500/30 z-50 pointer-events-none backdrop-blur-sm transition-all duration-300"
      ></div>
    {/if}
  {/if}
</main>

<!-- ===== Стили для клавиатурных подсказок (kbd-элементы) ===== -->
<style>
  /* Стилизация клавиш клавиатуры на welcome-экране */
  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 28px;
    padding: 0 10px;
    font-size: 14px;
    text-align: center;

    /* Светлая тема: градиент, имитирующий реальную клавишу */
    background: linear-gradient(180deg, #f4f4f5 0%, #e4e4e7 100%);
    border: 1px solid #d4d4d8;
    border-bottom-width: 2px; /* Утолщённая нижняя граница — эффект 3D-клавиши */
    color: #52525b;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    white-space: nowrap;
  }

  /* Тёмная тема: тёмный градиент для клавиш */
  @media (prefers-color-scheme: dark) {
    kbd {
      background: linear-gradient(180deg, #2a2a2e 0%, #1e1e22 100%);
      border: 1px solid #3a3a40;
      border-bottom-width: 2px;
      color: #d4d4d8;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    }
  }
</style>
