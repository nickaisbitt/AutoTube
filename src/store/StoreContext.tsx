/**
 * StoreContext — shares a single `useVideoProject()` instance across the React tree.
 *
 * Background:
 *   `useVideoProject()` composes 5 slice hooks (useProjectSlice, usePipelineSlice,
 *   useConfigSlice, useNarrationSlice, useUISlice). Each slice calls `useState`
 *   internally. Without a Context provider, every component that calls
 *   `useVideoProject()` gets its own independent `useState` instance — meaning
 *   `generateScript` updating stepStatuses in one component does NOT update
 *   `stepStatuses` in another component. This caused the E2E test to fail:
 *   `PipelineStepRouter` updated script to 'complete' but `AppShell`'s
 *   `PipelineSidebar` still saw 'idle' (disabled).
 *
 * Fix:
 *   - `StoreProvider` creates the store once at the top of the tree.
 *   - `useVideoProject()` wrapper reads from Context when a provider exists,
 *     otherwise falls back to creating a local instance. This keeps test files
 *     working — `renderHook(useVideoProject)` in unit tests still works without
 *     wrapping in `StoreProvider`.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useVideoProject as useVideoProjectLocal } from './index';

type Store = ReturnType<typeof useVideoProjectLocal>;

const StoreContext = createContext<Store | null>(null);
StoreContext.displayName = 'StoreContext';

export interface StoreProviderProps {
  children: ReactNode;
}

/**
 * Wraps the app in a Context that provides a single shared store instance.
 * Place this as high in the tree as possible — ideally wrapping `<App />`.
 */
export function StoreProvider({ children }: StoreProviderProps) {
  const store = useVideoProjectLocal();
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/**
 * Components should import this hook (not the one from `./index`) so they
 * share a single store instance via Context. In tests where no provider is
 * present, the hook falls back to creating an isolated instance — preserving
 * the existing test behavior.
 */
export function useVideoProject(): Store {
  const fromContext = useContext(StoreContext);
  if (fromContext) return fromContext;
  return useVideoProjectLocal();
}
