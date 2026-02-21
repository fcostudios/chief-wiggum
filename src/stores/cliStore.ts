// src/stores/cliStore.ts
// CLI detection state: tracks whether Claude Code CLI is available.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { CliLocation } from '@/lib/types';

interface CliState {
  location: CliLocation | null;
  isDetected: boolean;
  isLoading: boolean;
}

const [state, setState] = createStore<CliState>({
  location: null,
  isDetected: false,
  isLoading: true,
});

/** Detect CLI on app startup. Non-fatal if missing. */
export async function detectCli(): Promise<void> {
  setState('isLoading', true);
  try {
    const location = await invoke<CliLocation>('get_cli_info');
    setState('location', location);
    setState('isDetected', location.resolved_path !== null);
  } catch {
    setState('isDetected', false);
  } finally {
    setState('isLoading', false);
  }
}

/** Retry CLI detection (e.g., after user installs CLI). */
export async function retryCliDetection(): Promise<void> {
  await detectCli();
}

export { state as cliState };
