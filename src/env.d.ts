/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENROUTER_KEY?: string;
  readonly VITE_SERPER_KEY?: string;
  readonly VITE_FIRECRAWL_KEY?: string;
  readonly VITE_CF_ACCOUNT_ID?: string;
  readonly VITE_CF_API_TOKEN?: string;
  readonly VITE_KOKORO_SERVER_URL?: string;
  readonly VITE_XAI_KEY?: string;
  /** Set to 1 or true to bypass quality-gate export blocking (CI/E2E). */
  readonly SKIP_QUALITY_BLOCK?: string;
  readonly VITE_SKIP_QUALITY_BLOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
