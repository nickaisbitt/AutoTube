import { generateGrokTts } from './grokEngine';

const apiKey = import.meta.env.VITE_XAI_KEY;
if (!apiKey || apiKey.includes('your-xai-key-here')) {
  console.error('Please set a valid VITE_XAI_KEY in .env.local');
  process.exit(1);
}

(async () => {
  try {
    const audioBlob = await generateGrokTts('Hello, this is a test.', apiKey, {});
    if (audioBlob) {
      console.log('Success: GrokTTS generated audio blob of size:', audioBlob.size);
      // Create a blob URL and log it
      const url = URL.createObjectURL(audioBlob);
      console.log('Blob URL:', url);
    } else {
      console.error('Failed: GrokTTS returned null');
    }
  } catch (err) {
    console.error('Error:', err);
  }
})();
