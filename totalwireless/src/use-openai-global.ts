/**
 * useOpenAiGlobal Hook
 * 
 * Low-level hook to access ChatGPT widget environment globals.
 * Provides access to theme, layout, tool data, and widget state.
 * 
 * Available Keys:
 * - 'theme': 'light' | 'dark'
 * - 'displayMode': 'inline' | 'fullscreen' | 'panel'
 * - 'maxHeight': number (pixels)
 * - 'toolOutput': Structured data from MCP server
 * - 'toolInput': Original parameters sent to MCP tool
 * - 'widgetState': Persistent widget state
 * - 'setWidgetState': Function to update widget state
 * 
 * This is the foundation for other hooks (useWidgetProps, useDisplayMode, etc.)
 * Most widgets should use higher-level hooks instead of this directly.
 */

import { useSyncExternalStore } from "react";
import {
  SET_GLOBALS_EVENT_TYPE,
  SetGlobalsEvent,
  type OpenAiGlobals,
} from "./types";

export function useOpenAiGlobal<K extends keyof OpenAiGlobals>(
  key: K
): OpenAiGlobals[K] | null {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") {
        return () => {};
      }

      const handleSetGlobal = (event: SetGlobalsEvent) => {
        const value = event.detail.globals[key];
        if (value === undefined) {
          return;
        }

        onChange();
      };

      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal, {
        passive: true,
      });

      return () => {
        window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
      };
    },
    () => window.openai?.[key] ?? null,
    () => window.openai?.[key] ?? null
  );
}
