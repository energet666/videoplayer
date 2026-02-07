/// <reference types="svelte" />
/// <reference types="vite/client" />

interface Window {
    electronAPI?: {
        getInitialFile: () => Promise<string | null>;
        onOpenFile: (callback: (path: string) => void) => void;
        resizeWindow: (width: number, height: number) => void;
    };
}
