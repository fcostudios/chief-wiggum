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

export type DiffLineKind = 'added' | 'removed' | 'context';

export interface DiffLine {
  kind: DiffLineKind;
  old_lineno: number | null;
  new_lineno: number | null;
  content: string;
}

export interface DiffHunk {
  header: string;
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  old_path: string | null;
  is_binary: boolean;
  is_new_file: boolean;
  hunks: DiffHunk[];
}

interface GitState {
  projectId: string | null;
  repoInfo: RepoInfo | null;
  statusEntries: FileStatusEntry[];
  isLoading: boolean;
  error: string | null;
  selectedGitFile: FileStatusEntry | null;
  selectedFileDiff: FileDiff | null;
  isDiffLoading: boolean;
}

const [gitState, setGitState] = createStore<GitState>({
  projectId: null,
  repoInfo: null,
  statusEntries: [],
  isLoading: false,
  error: null,
  selectedGitFile: null,
  selectedFileDiff: null,
  isDiffLoading: false,
});

export { gitState };

export function setGitProjectId(id: string | null): void {
  setGitState('projectId', id);
  setGitState('selectedGitFile', null);
  setGitState('selectedFileDiff', null);
}

export function setSelectedGitFile(entry: FileStatusEntry | null): void {
  setGitState('selectedGitFile', entry);
  setGitState('selectedFileDiff', null);
}

export async function loadFileDiff(entry: FileStatusEntry): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;

  setGitState('isDiffLoading', true);
  setGitState('error', null);
  try {
    const diff = await invoke<FileDiff | null>('git_get_file_diff', {
      project_id: projectId,
      file_path: entry.path,
      staged: entry.is_staged,
    });
    setGitState('selectedFileDiff', diff);
  } catch (err) {
    setGitState('error', String(err));
  } finally {
    setGitState('isDiffLoading', false);
  }
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
