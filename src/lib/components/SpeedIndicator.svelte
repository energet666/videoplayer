<script lang="ts">
    let {
        showSpeedIndicator,
        userPlaybackRate,
    }: { showSpeedIndicator: boolean; userPlaybackRate: number } = $props();
</script>

<div
    class="absolute top-8 right-8 bg-black/50 backdrop-blur-md text-white/90 px-4 py-2 rounded-lg text-lg font-medium transition-opacity duration-200 pointer-events-none"
    class:opacity-0={!showSpeedIndicator}
    class:opacity-100={showSpeedIndicator}
>
    {userPlaybackRate}x
</div>
