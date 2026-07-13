import { useEffect } from "react";

export interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * Registers global keyboard shortcuts. Supports:
 * - Single keys: "/", "n"
 * - Modifier combos: "ctrl+enter", "meta+enter"
 * - Sequence shortcuts: "g b", "g n"
 *
 * Does NOT fire when focus is inside an input, textarea, or select element.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const sequenceBuffer: string[] = [];
    let sequenceTimer: ReturnType<typeof setTimeout> | null = null;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();

      // Don't intercept when user is typing in a form field
      if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
        return;
      }

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      // Modifier shortcuts
      if (ctrl && key === "enter") {
        e.preventDefault();
        shortcuts["ctrl+enter"]?.();
        return;
      }

      // Single-key shortcuts (only when no modifier is held)
      if (!ctrl && !e.altKey && !e.shiftKey) {
        // Check sequence shortcuts (g followed by another key)
        sequenceBuffer.push(key);
        if (sequenceTimer) clearTimeout(sequenceTimer);
        sequenceTimer = setTimeout(() => {
          sequenceBuffer.length = 0;
        }, 500);

        if (sequenceBuffer.length >= 2) {
          const seq = sequenceBuffer.join(" ");
          if (shortcuts[seq]) {
            e.preventDefault();
            shortcuts[seq]();
            sequenceBuffer.length = 0;
            return;
          }
        }

        if (shortcuts[key]) {
          e.preventDefault();
          shortcuts[key]();
        }
      }

      // Alt shortcuts
      if (e.altKey) {
        const altCombo = `alt+${key}`;
        if (shortcuts[altCombo]) {
          e.preventDefault();
          shortcuts[altCombo]();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (sequenceTimer) clearTimeout(sequenceTimer);
    };
  }, [shortcuts]);
}
