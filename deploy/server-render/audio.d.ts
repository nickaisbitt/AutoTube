declare module '*/audio.mjs' {
  export function generateAudio(text: string, outputPath: string, voice?: string): Promise<void>;
  export function getAvailableVoices(): Promise<string[]>;
  const audioModule: {
    generateAudio: typeof generateAudio;
    getAvailableVoices: typeof getAvailableVoices;
  };
  export default audioModule;
}
