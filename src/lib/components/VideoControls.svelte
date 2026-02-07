<script lang="ts">
    import { icons } from "../icons";
    import { formatTime } from "../utils";

    let {
        showControls,
        currentTime = $bindable(),
        duration,
        volume = $bindable(),
        isDragging = $bindable(),
        paused,
        onPipToggle,
        onHoverStart,
        onHoverEnd,
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

    let isMuted = $state(false);
    let lastVolume = $state(1);

    function handleSeek(e: Event) {
        const target = e.target as HTMLInputElement;
        currentTime = parseFloat(target.value);
    }

    function handleVolumeChange(e: Event) {
        const target = e.target as HTMLInputElement;
        volume = parseFloat(target.value);
        isMuted = volume === 0;
    }

    function toggleMute() {
        if (isMuted) {
            volume = lastVolume || 1;
            isMuted = false;
        } else {
            lastVolume = volume;
            volume = 0;
            isMuted = true;
        }
    }
</script>

<div
    class="absolute bottom-8 left-0 right-0 flex justify-center items-end px-4 pb-4 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
    class:translate-y-48={!showControls}
    class:translate-y-0={showControls}
    class:pointer-events-none={!showControls}
>
    <!-- Liquid Glass Panel -->
    <div
        class="bg-black/40 backdrop-blur-2xl backdrop-saturate-150 rounded-3xl py-3 px-6 flex flex-nowrap items-center justify-start gap-3 border border-white/10 shadow-2xl w-full max-w-2xl transform-gpu transition-all duration-300"
        onmouseenter={onHoverStart}
        onmouseleave={onHoverEnd}
        role="toolbar"
        tabindex="-1"
    >
        <!-- Current Time -->
        <span class="text-xs font-medium text-white/70 w-8 shrink-0"
            >{formatTime(currentTime)}</span
        >

        <!-- Progress Bar -->
        <div class="relative flex-1 h-8 flex items-center group/slider">
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
            <!-- Track Background -->
            <div class="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                <!-- Progress Fill -->
                <div
                    class="h-full bg-white/90 rounded-full transition-all duration-75"
                    style="width: {(currentTime / duration) * 100}%"
                ></div>
            </div>
            <!-- Thumb (Visual Only) -->
            <div
                class="absolute w-3 h-3 bg-white rounded-full shadow-md transition-opacity duration-200 pointer-events-none"
                style="left: {(currentTime / duration) *
                    100}%; transform: translateX(-50%) scale({paused ||
                showControls
                    ? 1
                    : 0});"
            ></div>
        </div>

        <!-- Duration -->
        <span class="text-xs font-medium text-white/50 w-8 text-right shrink-0"
            >{formatTime(duration)}</span
        >

        <button
            onclick={onPipToggle}
            class="text-white/80 hover:text-white transition-colors ml-2"
            title="Picture in Picture"
        >
            {@html icons.pip}
        </button>

        <!-- Volume -->
        <div class="flex items-center gap-2 group/vol shrink-0">
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
    /* Custom slider styles for webkit */
    input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
    }
</style>
