/**
 * useDisplayMode Hook
 * 
 * Returns current widget display mode from ChatGPT.
 * Possible values: 'inline', 'fullscreen', 'panel'
 * 
 * Usage: Adjust widget layout based on available space
 *   const displayMode = useDisplayMode();
 *   if (displayMode === 'fullscreen') { ... }
 */

import { useOpenAiGlobal } from "./use-openai-global";
import { type DisplayMode } from "./types";

export const useDisplayMode = (): DisplayMode | null => {
  return useOpenAiGlobal("displayMode");
};
