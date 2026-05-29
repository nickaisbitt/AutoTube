import { generateGrokTts } from './grokEngine';

const apiKey = import.meta.env.VITE_XAI_KEY;
if (!apiKey || apiKey.includes('your-xai-key-here')) {
  console.error('Please set a valid VITE_XAI_KEY in .env.local');
  process.exit(1);
}

(async () => {
  try {
    const blobUrl = await generateGrokTts('Hello, this is a test.', apiKey, {});
    if (blobUrl) {
      console.log('Success: GrokTTS generated audio URL:', blobUrl);
    } else {
      console.error('Failed: GrokTTS returned null');
    }
  } catch (err) {
    console.error('Error:', err);
  }
})();
