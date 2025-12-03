/**
 * useMaxHeight Hook
 * 
 * Returns maximum height (in pixels) available for widget rendering.
 * Useful for constraining scrollable content within ChatGPT viewport.
 * 
 * Usage:
 *   const maxHeight = useMaxHeight();
 *   <div style={{ maxHeight }}> ... scrollable content ... </div>
 */

import { useOpenAiGlobal } from "./use-openai-global";

export const useMaxHeight = (): number | null => {
  return useOpenAiGlobal("maxHeight");
};
