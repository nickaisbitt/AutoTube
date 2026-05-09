export interface RenderErrorContext {
  width: number;
  height: number;
  duration: number;
  hasServer: boolean;
}

export function formatRenderError(error: Error, context: RenderErrorContext): string {
  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (
    msg.includes('canvas') ||
    msg.includes('2d context') ||
    msg.includes('gpu') ||
    msg.includes('offscreen') ||
    name.includes('security')
  ) {
    return 'Browser ran out of GPU memory. Close other tabs, reduce resolution to 720p, or try a different browser.';
  }

  if (
    msg.includes('text-to-speech') ||
    msg.includes('tts') ||
    msg.includes('narration') ||
    msg.includes('no text-to-speech provider')
  ) {
    return 'No text-to-speech provider available. Add XAI_API_KEY to your .env file, or install edge-tts.';
  }

  if (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('render server') ||
    msg.includes('connection') ||
    msg.includes('unavailable')
  ) {
    if (!context.hasServer) {
      return 'Cannot reach render server. Make sure `npm run dev` is running on port 5173.';
    }
    return `Network error during render: ${error.message}. Check your connection and try again.`;
  }

  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('deadline')
  ) {
    return `Render timed out after 5 minutes. Try reducing video length or resolution.`;
  }

  if (msg.includes('storage') || msg.includes('quota') || msg.includes('insufficient')) {
    return `Insufficient browser storage. Reduce video length/resolution or clear browser data.`;
  }

  if (msg.includes('cancelled') || msg.includes('abort')) {
    return 'Render was cancelled.';
  }

  return `Render failed: ${error.message}`;
}
