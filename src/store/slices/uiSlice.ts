import { useState, useEffect } from 'react';
import type { SystemLog } from '../../types';
import { subscribeToLogs } from '../../services/logger';
import type { BatchJob } from '../../services/batchProcessor';

export interface UISliceState {
  logs: SystemLog[];
  batchJobs: BatchJob[];
  isBatchProcessing: boolean;
}

export interface UISliceActions {
  setLogs: (logs: SystemLog[] | ((prev: SystemLog[]) => SystemLog[])) => void;
  setBatchJobs: (jobs: BatchJob[] | ((prev: BatchJob[]) => BatchJob[])) => void;
  setIsBatchProcessing: (processing: boolean) => void;
}

export function useUISlice(): UISliceState & UISliceActions {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // Initialize logger subscription
  useEffect(() => {
    const unsub = subscribeToLogs((newLog) => {
      setLogs((prev) => [...prev, newLog].slice(-100)); // Keep last 100 logs
    });
    return unsub;
  }, []);

  return {
    logs,
    batchJobs,
    isBatchProcessing,
    setLogs,
    setBatchJobs,
    setIsBatchProcessing,
  };
}
