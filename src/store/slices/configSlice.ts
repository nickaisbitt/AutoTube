import { useState, useCallback } from 'react';
import type { AppConfig } from '../../types';
import {
  hasEncryptedConfig,
  loadEncryptedBlob,
  loadConfigFromSession,
  saveConfigToSession,
  clearEncryptedConfig,
  clearSessionConfig,
  persistEncryptedConfig,
  decryptConfig,
} from '../../utils/secureStorage';
import { logger } from '../../services/logger';

/** Default app config — used for fresh state and merging with stored config. */
export const DEFAULT_APP_CONFIG: AppConfig = {
  openRouterKey: import.meta.env.VITE_OPENROUTER_KEY || '',
  sourceType: 'stock',
  flickrKey: '',
  ttsVoice: 'af_heart',
};

export interface ConfigSliceState {
  appConfig: AppConfig;
  isUnlocked: boolean;
  hasEncryptedKeys: boolean;
  pinError: string | null;
}

export interface ConfigSliceActions {
  setAppConfig: (config: AppConfig, pin?: string) => Promise<void>;
  unlockConfig: (pin: string) => Promise<boolean>;
  clearSavedKeys: () => void;
}

export function useConfigSlice(): ConfigSliceState & ConfigSliceActions {
  const [appConfig, setAppConfigInternal] = useState<AppConfig>(() => {
    const session = loadConfigFromSession();
    if (session) return { ...DEFAULT_APP_CONFIG, ...session };
    return { ...DEFAULT_APP_CONFIG };
  });

  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    const session = loadConfigFromSession();
    return session !== null;
  });
  const [hasEncryptedKeys, setHasEncryptedKeys] = useState<boolean>(() => hasEncryptedConfig());
  const [pinError, setPinError] = useState<string | null>(null);

  const setAppConfig = useCallback(async (config: AppConfig, pin?: string) => {
    setAppConfigInternal(config);
    saveConfigToSession(config);
    setIsUnlocked(true);
    setPinError(null);
    if (pin && pin.length >= 4) {
      await persistEncryptedConfig(config, pin);
      setHasEncryptedKeys(true);
      logger.success('SecureStorage', 'API keys encrypted and saved to localStorage');
    } else {
      logger.info('SecureStorage', 'API keys saved to sessionStorage only (no PIN set)');
    }
  }, []);

  const unlockConfig = useCallback(async (pin: string): Promise<boolean> => {
    const blob = loadEncryptedBlob();
    if (!blob) {
      setPinError('No encrypted keys found.');
      return false;
    }
    try {
      const config = await decryptConfig(blob, pin);
      setAppConfigInternal({ ...DEFAULT_APP_CONFIG, ...config });
      saveConfigToSession(config);
      setIsUnlocked(true);
      setPinError(null);
      logger.success('SecureStorage', 'API keys decrypted and loaded into memory');
      return true;
    } catch {
      setPinError('Incorrect PIN — please try again.');
      return false;
    }
  }, []);

  const clearSavedKeys = useCallback(() => {
    clearEncryptedConfig();
    clearSessionConfig();
    setAppConfigInternal({ ...DEFAULT_APP_CONFIG });
    setHasEncryptedKeys(false);
    setIsUnlocked(false);
    setPinError(null);
    logger.info('SecureStorage', 'All saved API keys cleared');
  }, []);

  return {
    appConfig,
    isUnlocked,
    hasEncryptedKeys,
    pinError,
    setAppConfig,
    unlockConfig,
    clearSavedKeys,
  };
}
