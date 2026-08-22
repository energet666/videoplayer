<!--
  ============================================================================
  VideoControls.svelte — Нижняя панель управления видеоплеером
  ============================================================================
  Компонент отображает:
  - Текущее время / общую длительность
  - Прогресс-бар (перемотка мышью)
  - Регулятор громкости + кнопку mute
  - Скорость воспроизведения (меню по наведению)
  - Кнопки управления окном: PiP, полноэкранный режим, закрыть
  
  Панель плавно выезжает снизу при showControls=true и прячется обратно.
  Дизайн: «Liquid Glass» — полупрозрачный размытый фон (backdrop-blur).
  ============================================================================
-->

<script lang="ts">
    import { icons } from "../icons";
    import { formatTime } from "../utils";

    // ========================
    // Пропсы компонента
    // ========================
    let {
        showControls, // Показывать ли панель?
        displayTime, // Время для отрисовки — обновляется каждый кадр, а не по timeupdate
        onSeek, // Колбэк перемотки: плеер отправит позицию в общую очередь seek-ов
        duration, // Общая длительность видео
        playbackRate, // Текущая скорость, выбранная пользователем
        speeds, // Доступные значения скорости (общие с клавишами ↑↓)
        onRateChange, // Колбэк: пользователь выбрал скорость в меню
        volume = $bindable(), // Громкость (двусторонняя привязка к видео)
        isDragging = $bindable(), // Флаг перетаскивания прогресс-бара
        paused, // Видео на паузе?
        onPipToggle, // Колбэк: переключить PiP-режим
        onFullscreenToggle, // Колбэк: переключить полноэкранный режим окна
        onClose, // Колбэк: закрыть окно приложения
        isFullscreen, // Окно сейчас в полноэкранном режиме?
        onHoverStart, // Колбэк: курсор вошёл на панель (отменяет автоскрытие)
        onHoverEnd, // Колбэк: курсор покинул панель (запускает автоскрытие)
    }: {
        showControls: boolean;
        displayTime: number;
        onSeek: (time: number) => void;
        duration: number;
        playbackRate: number;
        speeds: number[];
        onRateChange: (rate: number) => void;
        volume: number;
        isDragging: boolean;
        paused: boolean;
        onPipToggle: () => void;
        onFullscreenToggle: () => void;
        onClose: () => void;
        isFullscreen: boolean;
        onHoverStart: () => void;
        onHoverEnd: () => void;
    } = $props();

    // Скорость в меню — от быстрой к медленной, как в выпадающих списках плееров
    const speedOptions = $derived([...speeds].sort((a, b) => b - a));

    /** "1", "1.25" — без хвостовых нулей, чтобы подпись на кнопке была короткой */
    function formatRate(rate: number) {
        return String(rate);
    }

    // Состояние mute: видео замьючено?
    let isMuted = $state(false);
    // Запоминаем громкость перед mute, чтобы восстановить при unmute
    let lastVolume = $state(1);

    /**
     * Обработчик перемотки: пользователь двигает прогресс-бар.
     * Позицию не пишем в видео напрямую — отдаём плееру, а он ставит её в общую
     * очередь seek-ов (см. seek-queue.ts). Событие input прилетает на каждое
     * движение мыши, и прямая запись отменяла бы предыдущий seek.
     */
    function handleSeek(e: Event) {
        const target = e.target as HTMLInputElement;
        onSeek(parseFloat(target.value));
    }

    /**
     * Обработчик изменения громкости через слайдер.
     * Если громкость стала 0, считаем звук замьюченным.
     */
    function handleVolumeChange(e: Event) {
        const target = e.target as HTMLInputElement;
        volume = parseFloat(target.value);
        isMuted = volume === 0;
    }

    /**
     * Переключение mute/unmute при клике на иконку громкости.
     * При mute запоминаем текущую громкость, при unmute — восстанавливаем.
     */
    function toggleMute() {
        if (isMuted) {
            volume = lastVolume || 1; // Восстанавливаем предыдущую громкость
            isMuted = false;
        } else {
            lastVolume = volume; // Запоминаем текущую громкость
            volume = 0;
            isMuted = true;
        }
    }
</script>

<!--
  Контейнер панели управления.
  - translate-y-48: скрыт за нижним краем экрана
  - translate-y-0: видим (при showControls=true)
  - pointer-events-none: когда скрыт, не перехватывает клики
  Анимация: ease-[cubic-bezier(0.32,0.72,0,1)] — плавный «пружинный» выезд
-->
<div
    class="absolute bottom-8 left-0 right-0 flex justify-center items-end px-4 pb-4 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
    class:translate-y-48={!showControls}
    class:translate-y-0={showControls}
    class:pointer-events-none={!showControls}
>
    <!--
      "Liquid Glass" панель.
      Полупрозрачный чёрный фон + backdrop-blur + насыщенность.
      transform-gpu — для аппаратного ускорения blur-эффекта.
    -->
    <div
        class="bg-black/40 backdrop-blur-2xl backdrop-saturate-150 rounded-3xl py-3 px-6 flex flex-nowrap items-center justify-start gap-3 border border-white/10 shadow-2xl w-full max-w-2xl transform-gpu transition-all duration-300"
        onmouseenter={onHoverStart}
        onmouseleave={onHoverEnd}
        role="toolbar"
        tabindex="-1"
    >
        <!-- Текущее время воспроизведения (например "1:23") -->
        <span class="text-xs font-medium text-white/70 w-8 shrink-0"
            >{formatTime(displayTime)}</span
        >

        <!-- ===== Прогресс-бар ===== -->
        <div class="relative flex-1 h-8 flex items-center group/slider">
            <!--
              Скрытый <input type="range"> поверх визуального бара.
              Полностью прозрачный (opacity-0), но перехватывает все события мыши.
              При mousedown/mouseup — переключаем isDragging.
            -->
            <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.1"
                value={displayTime}
                oninput={handleSeek}
                onmousedown={() => (isDragging = true)}
                onmouseup={() => (isDragging = false)}
                class="absolute w-full h-full opacity-0 cursor-pointer z-10"
            />
            <!-- Фон трека (серая полоска) -->
            <div class="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                <!-- Заполненная часть трека (белая полоска — прогресс).
                     Без CSS-перехода: ширина и так пересчитывается каждый кадр,
                     а transition добавлял бы отставание поверх этого. -->
                <div
                    class="h-full bg-white/90 rounded-full"
                    style="width: {(displayTime / duration) * 100}%"
                ></div>
            </div>
            <!--
              Визуальный ползунок (Thumb).
              pointer-events-none — не перехватывает клики (всё идёт через input выше).
              Масштабируется до 0 при воспроизведении и скрытых контролах.
            -->
            <div
                class="absolute w-3 h-3 bg-white rounded-full shadow-md transition-opacity duration-200 pointer-events-none"
                style="left: {(displayTime / duration) *
                    100}%; transform: translateX(-50%) scale({paused ||
                showControls
                    ? 1
                    : 0});"
            ></div>
        </div>

        <!-- Общая длительность видео (например "5:30") -->
        <span class="text-xs font-medium text-white/50 w-8 text-right shrink-0"
            >{formatTime(duration)}</span
        >

        <!-- ===== Громкость и скорость =====
             Обе — кнопки со всплывашкой, поэтому стоят одной группой на gap-1,
             как и кнопки окна: панельный gap-3 между ними складывался с их
             внутренними padding'ами и оптически расползался вдвое.
             h-7 + flex items-center — общая мера для всех кнопок панели:
             иконка внутри кнопки это inline-svg, он садится на базовую линию и
             тянет за собой место под нижние выносные элементы, из-за чего
             высота коробки зависела от содержимого (иконка / текст «1×») и
             глифы стояли на разной высоте. -->
        <div class="flex items-center gap-1 shrink-0">
            <!-- Громкость: слайдер убран во всплывашку, в панели остаётся иконка -->
            <div class="relative group/vol">
                <!-- Кнопка Mute/Unmute (иконка динамика) -->
                <button
                    onclick={toggleMute}
                    class="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 flex items-center justify-center h-7"
                    title="Громкость"
                    aria-label={isMuted || volume === 0 ? "Включить звук" : "Выключить звук"}
                >
                    {#if isMuted || volume === 0}
                        {@html icons.mute}
                    {:else}
                        {@html icons.volume}
                    {/if}
                </button>

                <!-- Всплывающий вертикальный слайдер (0 — 1).
                     pb-6 — тот же прозрачный «мостик», что и у меню скорости:
                     держит hover и поднимает стекло над панелью. -->
                <div
                    class="absolute bottom-full left-1/2 -translate-x-1/2 pb-6 opacity-0 pointer-events-none transition-opacity duration-150 group-hover/vol:opacity-100 group-hover/vol:pointer-events-auto"
                >
                    <div
                        class="bg-black/40 backdrop-blur-2xl backdrop-saturate-150 rounded-2xl border border-white/10 shadow-xl px-3 py-4 flex flex-col items-center"
                    >
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={volume}
                            oninput={handleVolumeChange}
                            class="volume-slider"
                            style="background: linear-gradient(to top, rgba(255,255,255,0.9) {volume *
                                100}%, rgba(255,255,255,0.2) {volume * 100}%)"
                            aria-label="Громкость"
                        />
                    </div>
                </div>
            </div>

            <!-- ===== Скорость воспроизведения =====
                 Единственное действие, у которого раньше не было мышиного пути
                 (только клавиши ↑↓). Меню всплывает по наведению: оно лежит внутри
                 панели в DOM, поэтому mouseleave панели при переходе к нему не
                 срабатывает и контролы не прячутся из-под курсора. -->
            <div class="relative group/speed">
                <button
                    class="text-white/80 hover:text-white transition-colors text-xs font-semibold tabular-nums p-1 rounded-lg hover:bg-white/10 flex items-center justify-center h-7 min-w-7"
                    title="Скорость воспроизведения (↑ / ↓)"
                    aria-label="Скорость воспроизведения"
                >
                    {formatRate(playbackRate)}&times;
                </button>

                <!--
                  Всплывающее меню вариантов.
                  pb-6 — прозрачный «мостик» до кнопки: он и не даёт меню закрыться,
                  пока курсор идёт вверх, и одновременно поднимает меню целиком над
                  панелью (её padding + рамка — это ~16px над кнопкой), чтобы стёкла
                  не накладывались друг на друга.
                -->
                <div
                    class="absolute bottom-full left-1/2 -translate-x-1/2 pb-6 opacity-0 pointer-events-none transition-opacity duration-150 group-hover/speed:opacity-100 group-hover/speed:pointer-events-auto"
                >
                    <!-- Стекло то же, что у панели: более плотный фон читался как
                         чужеродная плашка поверх неё -->
                    <div
                        class="bg-black/40 backdrop-blur-2xl backdrop-saturate-150 rounded-2xl border border-white/10 shadow-xl p-1 flex flex-col gap-0.5"
                    >
                        {#each speedOptions as rate (rate)}
                            <button
                                onclick={() => onRateChange(rate)}
                                class="px-3 py-1 rounded-xl text-xs font-medium tabular-nums whitespace-nowrap transition-colors {rate ===
                                playbackRate
                                    ? 'bg-white/15 text-white'
                                    : 'text-white/70 hover:bg-white/10 hover:text-white'}"
                            >
                                {formatRate(rate)}&times;
                            </button>
                        {/each}
                    </div>
                </div>
            </div>
        </div>

        <!-- ===== Кнопки управления окном ===== -->
        <!--
          Заменяют системные кнопки окна (в electron/main.js стоит frame: false).
          Раньше поведение расходилось по платформам: на macOS «светофор»
          лежал поверх видео, на Windows кнопок не было совсем.
          Отделены вертикальной чертой, чтобы не путались с контролами видео.
          PiP стоит в этой же группе: он меняет способ показа окна, а не воспроизведение.
        -->
        <div
            class="flex items-center gap-1 shrink-0 pl-3 border-l border-white/15"
        >
            <!-- PiP (Picture-in-Picture) — тоже режим показа окна, поэтому живёт здесь -->
            <button
                onclick={onPipToggle}
                class="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 flex items-center justify-center h-7"
                title="Picture in Picture"
                aria-label="Picture in Picture"
            >
                {@html icons.pip}
            </button>

            <!-- Полноэкранный режим (нативный fullscreen окна Electron) -->
            <button
                onclick={onFullscreenToggle}
                class="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 flex items-center justify-center h-7"
                title={isFullscreen
                    ? "Выйти из полноэкранного режима"
                    : "Полноэкранный режим"}
                aria-label={isFullscreen
                    ? "Выйти из полноэкранного режима"
                    : "Полноэкранный режим"}
            >
                {#if isFullscreen}
                    {@html icons.fullscreenExit}
                {:else}
                    {@html icons.fullscreen}
                {/if}
            </button>

            <!-- Закрыть окно -->
            <button
                onclick={onClose}
                class="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-red-500/80 flex items-center justify-center h-7"
                title="Закрыть"
                aria-label="Закрыть"
            >
                {@html icons.close}
            </button>
        </div>
    </div>
</div>

<style>
    /* Сброс стандартного стиля ползунка в webkit-браузерах */
    input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
    }

    /* Вертикальный слайдер громкости во всплывашке.
       writing-mode: vertical-lr + direction: rtl — штатный способ развернуть
       <input type="range"> в Chromium (Electron 40); минимум внизу, максимум
       вверху. Заливку трека рисует inline-градиент в разметке. */
    .volume-slider {
        writing-mode: vertical-lr;
        direction: rtl;
        appearance: none;
        -webkit-appearance: none;
        width: 5px;
        height: 4.55rem;
        border-radius: 9999px;
        cursor: pointer;
    }

    .volume-slider::-webkit-slider-thumb {
        width: 12px;
        height: 12px;
        background: #fff;
        border-radius: 9999px;
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.4);
    }

    .volume-slider:hover::-webkit-slider-thumb {
        transform: scale(1.15);
    }
</style>
