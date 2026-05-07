import type { MediaCandidate } from '../media';

export interface SourceProviderConfig {
  apiKey?: string;
  signal?: AbortSignal;
  maxResults?: number;
}

export interface SourceProvider {
  readonly name: string;
  readonly requiresKey: boolean;
  isAvailable(config: SourceProviderConfig): boolean;
  search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]>;
}
