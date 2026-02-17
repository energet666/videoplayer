<!--
  ============================================================================
  VideoControls.svelte — Нижняя панель управления видеоплеером
  ============================================================================
  Компонент отображает:
  - Текущее время / общую длительность
  - Прогресс-бар (перемотка мышью)
  - Кнопку PiP (Picture-in-Picture)
  - Регулятор громкости + кнопку mute
  
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
        currentTime = $bindable(), // Текущее время (двусторонняя привязка к видео)
        duration, // Общая длительность видео
        volume = $bindable(), // Громкость (двусторонняя привязка к видео)
        isDragging = $bindable(), // Флаг перетаскивания прогресс-бара
        paused, // Видео на паузе?
        onPipToggle, // Колбэк: переключить PiP-режим
        onHoverStart, // Колбэк: курсор вошёл на панель (отменяет автоскрытие)
        onHoverEnd, // Колбэк: курсор покинул панель (запускает автоскрытие)
    }: {
        showControls: boolean;
        currentTime: number;
        duration: number;
        volume: number;
        isDragging: boolean;
        paused: boolean;
        onPipToggle: () => void;
        onHoverStart: () => void;
        onHoverEnd: () => void;
    } = $props();

    // Состояние mute: видео замьючено?
    let isMuted = $state(false);
    // Запоминаем громкость перед mute, чтобы восстановить при unmute
    let lastVolume = $state(1);

    /**
     * Обработчик перемотки: пользователь двигает прогресс-бар.
     * Обновляет currentTime (привязан к <video>).
     */
    function handleSeek(e: Event) {
        const target = e.target as HTMLInputElement;
        currentTime = parseFloat(target.value);
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
            >{formatTime(currentTime)}</span
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
                value={currentTime}
                oninput={handleSeek}
                onmousedown={() => (isDragging = true)}
                onmouseup={() => (isDragging = false)}
                class="absolute w-full h-full opacity-0 cursor-pointer z-10"
            />
            <!-- Фон трека (серая полоска) -->
            <div class="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                <!-- Заполненная часть трека (белая полоска — прогресс) -->
                <div
                    class="h-full bg-white/90 rounded-full transition-all duration-75"
                    style="width: {(currentTime / duration) * 100}%"
                ></div>
            </div>
            <!--
              Визуальный ползунок (Thumb).
              pointer-events-none — не перехватывает клики (всё идёт через input выше).
              Масштабируется до 0 при воспроизведении и скрытых контролах.
            -->
            <div
                class="absolute w-3 h-3 bg-white rounded-full shadow-md transition-opacity duration-200 pointer-events-none"
                style="left: {(currentTime / duration) *
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

        <!-- Кнопка PiP (Picture-in-Picture) -->
        <button
            onclick={onPipToggle}
            class="text-white/80 hover:text-white transition-colors ml-2"
            title="Picture in Picture"
        >
            {@html icons.pip}
        </button>

        <!-- ===== Блок громкости ===== -->
        <div class="flex items-center gap-2 group/vol shrink-0">
            <!-- Кнопка Mute/Unmute (иконка динамика) -->
            <button
                onclick={toggleMute}
                class="text-white/80 hover:text-white transition-colors"
            >
                {#if isMuted || volume === 0}
                    {@html icons.mute}
                {:else}
                    {@html icons.volume}
                {/if}
            </button>
            <!-- Слайдер громкости (0 — 1) -->
            <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                oninput={handleVolumeChange}
                class="w-12 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 android-slider"
            />
        </div>
    </div>
</div>

<style>
    /* Сброс стандартного стиля ползунка в webkit-браузерах */
    input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
    }
</style>
