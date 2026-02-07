<script lang="ts">
    import { icons } from "../icons";

    let { showControls }: { showControls: boolean } = $props();
</script>

<!-- Big Center Play Button (only when paused - controlled by parent visibility, but this component handles the overlay structure) -->
<div
    class="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300"
    class:opacity-0={!showControls}
>
    <div
        class="bg-black/30 p-6 rounded-full text-white/90 shadow-2xl transition-transform scale-100"
    >
        {@html icons.play}
    </div>
</div>
