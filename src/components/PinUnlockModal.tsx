import { useState } from 'react';
import { useVideoProject } from '../store/StoreContext';

/**
 * Shown when encrypted keys exist in localStorage but session is locked.
 */
export default function PinUnlockModal() {
  const { hasEncryptedKeys, isUnlocked, unlockConfig, pinError, clearSavedKeys } =
    useVideoProject();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  if (!hasEncryptedKeys || isUnlocked) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await unlockConfig(pin);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4" data-testid="pin-unlock-modal">
      <div className="absolute inset-0 bg-black/90" />
      <form
        onSubmit={handleUnlock}
        className="relative w-full max-w-md border-2 border-surface-700 bg-surface-900 p-6 shadow-hard space-y-4"
      >
        <h2 className="text-lg font-bold text-white font-mono uppercase">Unlock API Keys</h2>
        <p className="text-sm text-surface-400 font-mono">
          Enter the PIN used to encrypt your saved keys.
        </p>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          minLength={4}
          required
          autoFocus
          placeholder="PIN"
          className="w-full border-2 border-surface-700 bg-surface-800 px-3 py-2 text-sm font-mono text-white focus:border-brand-500 focus:outline-none"
          data-testid="pin-unlock-input"
        />
        {pinError && (
          <p className="text-xs text-red-400 font-mono" data-testid="pin-unlock-error">
            {pinError}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || pin.length < 4}
            className="flex-1 border-2 border-brand-500 bg-brand-500 px-4 py-2 text-xs font-mono font-bold uppercase text-black disabled:opacity-50"
          >
            Unlock
          </button>
          <button
            type="button"
            onClick={() => clearSavedKeys()}
            className="border-2 border-surface-600 px-4 py-2 text-xs font-mono uppercase text-surface-300"
          >
            Clear Keys
          </button>
        </div>
      </form>
    </div>
  );
}
