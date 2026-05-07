/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENROUTER_KEY?: string;
  readonly VITE_SERPER_KEY?: string;
  readonly VITE_FIRECRAWL_KEY?: string;
  readonly VITE_XAI_KEY?: string;
  readonly VITE_CF_ACCOUNT_ID?: string;
  readonly VITE_CF_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
