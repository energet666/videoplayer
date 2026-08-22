// ============================================================================
// Коллекция SVG-иконок для UI
// ============================================================================
// Иконки хранятся как строки SVG и вставляются через {@html icons.xxx}.
// Это позволяет окрашивать их через CSS (currentColor) и не загружать
// отдельные файлы. Все иконки взяты из набора Lucide (https://lucide.dev).
// ============================================================================

export const icons = {
    // Иконка Play (▶) — большой треугольник для PlayOverlay (48×48)
    play: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7 3 21 12 7 21 7 3"></polygon></svg>`,

    // Иконка Mute (🔇) — динамик с крестиком (18×18)
    mute: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>`,

    // Иконка Volume (🔊) — динамик с волнами (18×18)
    volume: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`,

    // Иконка PiP (Picture-in-Picture) — экран с мини-окном (18×18)
    pip: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/><rect width="10" height="7" x="12" y="13" rx="2"/></svg>`,

    // Иконка «развернуть на весь экран» — 4 угла наружу (18×18)
    fullscreen: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,

    // Иконка «выйти из полного экрана» — 4 угла внутрь (18×18)
    fullscreenExit: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`,

    // Иконка «закрыть» (✕) — заменяет системную кнопку закрытия окна (18×18)
    close: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
};
