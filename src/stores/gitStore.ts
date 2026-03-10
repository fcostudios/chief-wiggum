// src/stores/gitStore.ts
// Reactive store for Git repository state (CHI-315).
// Polls via IPC; components subscribe reactively.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';

export interface RepoInfo {
  root: string;
  head_branch: string | null;
  is_dirty: boolean;
}

export type FileStatusKind =
  | 'staged'
  | 'modified'
  | 'untracked'
  | 'deleted'
  | 'renamed'
  | 'conflicted';

export interface FileStatusEntry {
  path: string;
  status: FileStatusKind;
  is_staged: boolean;
  old_path: string | null;
}

interface GitState {
  projectId: string | null;
  repoInfo: RepoInfo | null;
  statusEntries: FileStatusEntry[];
  isLoading: boolean;
  error: string | null;
}

const [gitState, setGitState] = createStore<GitState>({
  projectId: null,
  repoInfo: null,
  statusEntries: [],
  isLoading: false,
  error: null,
});

export { gitState };

export function setGitProjectId(id: string | null): void {
  setGitState('projectId', id);
}

export async function refreshRepoInfo(): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;

  setGitState('isLoading', true);
  setGitState('error', null);
  try {
    const info = await invoke<RepoInfo | null>('git_get_repo_info', { project_id: projectId });
    setGitState('repoInfo', info);
  } catch (err) {
    setGitState('error', String(err));
  } finally {
    setGitState('isLoading', false);
  }
}

export async function refreshGitStatus(): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;

  try {
    const entries = await invoke<FileStatusEntry[]>('git_get_status', { project_id: projectId });
    setGitState('statusEntries', entries);
  } catch (err) {
    setGitState('error', String(err));
  }
}

/** Total count of changed files (staged + unstaged + untracked). */
export function getTotalChangedCount(): number {
  return gitState.statusEntries.length;
}

/** Files that are staged (in the index). */
export function getStagedFiles(): FileStatusEntry[] {
  return gitState.statusEntries.filter((e) => e.is_staged);
}

/** Files with unstaged worktree changes (modified/deleted/renamed). */
export function getUnstagedFiles(): FileStatusEntry[] {
  return gitState.statusEntries.filter(
    (e) =>
      !e.is_staged && (e.status === 'modified' || e.status === 'deleted' || e.status === 'renamed'),
  );
}

/** Untracked files. */
export function getUntrackedFiles(): FileStatusEntry[] {
  return gitState.statusEntries.filter((e) => e.status === 'untracked');
}
