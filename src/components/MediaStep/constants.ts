export interface ParsedMessage {
  beatLabel: string;
  segment: string;
  action: string;
}

export const MEDIA_STATUS_MESSAGES = [
  'Scanning Wikipedia for entity images...',
  'Querying Openverse for Creative Commons media...',
  'Scoring visual relevance...',
  'Analyzing image composition...',
  'Matching visuals to narrative beats...',
  'Optimizing media diversity...',
  'Evaluating source quality...',
  'Curating final selections...',
];

/**
 * Parse a dynamic media sourcing message like "[HOOK] Tesla stock chart — harvesting…"
 * into its beat label, segment description, and action components.
 * Returns null if the message doesn't match the expected format.
 */
export function parseMediaMessage(msg: string): ParsedMessage | null {
  if (!msg) return null;
  const match = msg.match(/^\[(\w+)\]\s*(.+?)\s*—\s*(.+)$/);
  if (!match) return null;
  return { beatLabel: match[1], segment: match[2], action: match[3] };
}
