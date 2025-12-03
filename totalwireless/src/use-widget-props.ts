/**
 * useWidgetProps Hook
 * 
 * Retrieves structured data passed from MCP server to widget.
 * This is the main data flow mechanism from server to UI.
 * 
 * The MCP server sends data via structuredContent field in tool response,
 * which becomes available as 'toolOutput' in OpenAI globals.
 * 
 * Usage:
 *   const data = useWidgetProps<{ items: Device[], filters: object }>();
 *   // data.items contains filtered devices from server
 *   // data.filters contains applied filter values
 * 
 * @param defaultState - Optional fallback if no data from server
 * @returns Structured data from server or fallback
 */

import { useOpenAiGlobal } from "./use-openai-global";

export function useWidgetProps<T extends Record<string, unknown>>(
  defaultState?: T | (() => T)
): T {
  const props = useOpenAiGlobal("toolOutput") as T;

  const fallback =
    typeof defaultState === "function"
      ? (defaultState as () => T | null)()
      : defaultState ?? null;

  return props ?? fallback;
}
