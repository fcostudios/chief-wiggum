// src/stores/gitStore.ts
// Reactive store for Git repository state (CHI-315).
// Polls via IPC; components subscribe reactively.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface RepoInfo {
  root: string;
  head_branch: string | null;
  is_dirty: boolean;
  ahead: number;
  behind: number;
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

export interface CommitEntry {
  sha: string;
  short_sha: string;
  summary: string;
  message: string;
  author: string;
  author_email: string;
  timestamp: number;
}

export interface DiscardResult {
  old_content: string | null;
  was_untracked: boolean;
}

export interface StashEntry {
  index: number;
  message: string;
  oid: string;
}

export type RemoteOperation = 'fetch' | 'pull' | 'push';

export interface RemoteProgressState {
  current: number;
  total: number;
  message: string;
}

interface GitState {
  projectId: string | null;
  repoInfo: RepoInfo | null;
  statusEntries: FileStatusEntry[];
  commits: CommitEntry[];
  commitsLoaded: boolean;
  commitsLoading: boolean;
  stashes: StashEntry[];
  stashesLoaded: boolean;
  isStashing: boolean;
  remoteOperation: RemoteOperation | null;
  remoteProgress: RemoteProgressState | null;
  remoteError: string | null;
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
  commits: [],
  commitsLoaded: false,
  commitsLoading: false,
  stashes: [],
  stashesLoaded: false,
  isStashing: false,
  remoteOperation: null,
  remoteProgress: null,
  remoteError: null,
  isLoading: false,
  error: null,
  selectedGitFile: null,
  selectedFileDiff: null,
  isDiffLoading: false,
});

export { gitState };
const COMMITS_PAGE_SIZE = 20;
let remoteProgressUnlisten: UnlistenFn | null = null;

export function setGitProjectId(id: string | null): void {
  setGitState('projectId', id);
  setGitState('selectedGitFile', null);
  setGitState('selectedFileDiff', null);
  setGitState('commits', []);
  setGitState('commitsLoaded', false);
  setGitState('commitsLoading', false);
  setGitState('stashes', []);
  setGitState('stashesLoaded', false);
  setGitState('isStashing', false);
  setGitState('remoteOperation', null);
  setGitState('remoteProgress', null);
  setGitState('remoteError', null);
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

export async function stageFile(entry: FileStatusEntry): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;
  await invoke('git_stage_file', { project_id: projectId, file_path: entry.path });
  await refreshGitStatus();
  const updated: FileStatusEntry = { ...entry, is_staged: true, status: 'staged' };
  setSelectedGitFile(updated);
  await loadFileDiff(updated);
}

export async function unstageFile(entry: FileStatusEntry): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;
  await invoke('git_unstage_file', { project_id: projectId, file_path: entry.path });
  await refreshGitStatus();
  const updated: FileStatusEntry = { ...entry, is_staged: false, status: 'modified' };
  setSelectedGitFile(updated);
  await loadFileDiff(updated);
}

export async function stageHunk(filePath: string, hunkIndex: number): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;
  await invoke('git_stage_hunk', {
    project_id: projectId,
    file_path: filePath,
    hunk_index: hunkIndex,
  });
  await refreshGitStatus();
  if (gitState.selectedGitFile) {
    await loadFileDiff(gitState.selectedGitFile);
  }
}

export async function unstageHunk(filePath: string, hunkIndex: number): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;
  await invoke('git_unstage_hunk', {
    project_id: projectId,
    file_path: filePath,
    hunk_index: hunkIndex,
  });
  await refreshGitStatus();
  if (gitState.selectedGitFile) {
    await loadFileDiff(gitState.selectedGitFile);
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
    void loadCommits(true);
  } catch (err) {
    setGitState('error', String(err));
  }
}

export async function loadCommits(reset = false): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;

  const skip = reset ? 0 : gitState.commits.length;
  setGitState('commitsLoading', true);
  try {
    const entries = await invoke<CommitEntry[]>('git_list_commits', {
      project_id: projectId,
      skip,
      limit: COMMITS_PAGE_SIZE,
    });
    if (reset) {
      setGitState('commits', entries);
    } else {
      setGitState('commits', (prev) => [...prev, ...entries]);
    }
    setGitState('commitsLoaded', true);
  } catch (err) {
    setGitState('error', String(err));
  } finally {
    setGitState('commitsLoading', false);
  }
}

export async function loadStashes(): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;

  try {
    const entries = await invoke<StashEntry[]>('git_list_stashes', { project_id: projectId });
    setGitState('stashes', entries);
    setGitState('stashesLoaded', true);
  } catch (err) {
    setGitState('stashes', []);
    setGitState('error', String(err));
  }
}

export async function pushStash(message: string, includeUntracked = true): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;

  setGitState('isStashing', true);
  try {
    await invoke('git_push_stash', {
      project_id: projectId,
      message,
      include_untracked: includeUntracked,
    });
    await refreshGitStatus();
    await loadStashes();
  } finally {
    setGitState('isStashing', false);
  }
}

export async function popStash(index: number): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;

  await invoke('git_pop_stash', { project_id: projectId, index });
  await refreshGitStatus();
  await loadStashes();
}

export async function applyStash(index: number): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;

  await invoke('git_apply_stash', { project_id: projectId, index });
  await refreshGitStatus();
  await loadStashes();
}

export async function dropStash(index: number): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;

  await invoke('git_drop_stash', { project_id: projectId, index });
  await loadStashes();
}

export async function startListeningRemoteProgress(): Promise<void> {
  if (remoteProgressUnlisten) return;
  remoteProgressUnlisten = await listen<{
    operation: string;
    current: number;
    total: number;
    message: string;
  }>('git:progress', (event) => {
    setGitState('remoteProgress', {
      current: event.payload.current,
      total: event.payload.total,
      message: event.payload.message,
    });
  });
}

export function stopListeningRemoteProgress(): void {
  remoteProgressUnlisten?.();
  remoteProgressUnlisten = null;
}

export async function fetchRemote(): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;

  setGitState('remoteOperation', 'fetch');
  setGitState('remoteProgress', null);
  setGitState('remoteError', null);
  try {
    await startListeningRemoteProgress();
    await invoke('git_fetch', { project_id: projectId });
    await refreshRepoInfo();
    await refreshGitStatus();
  } catch (err) {
    setGitState('remoteError', String(err));
    throw err;
  } finally {
    setGitState('remoteOperation', null);
    setGitState('remoteProgress', null);
    stopListeningRemoteProgress();
  }
}

export async function pullRemote(): Promise<string> {
  const projectId = gitState.projectId;
  if (!projectId) return '';

  setGitState('remoteOperation', 'pull');
  setGitState('remoteProgress', null);
  setGitState('remoteError', null);
  try {
    await startListeningRemoteProgress();
    const result = await invoke<{
      commits_pulled: number;
      had_conflicts: boolean;
      message: string;
    }>('git_pull', { project_id: projectId });
    await refreshRepoInfo();
    await refreshGitStatus();
    return result.message;
  } catch (err) {
    setGitState('remoteError', String(err));
    throw err;
  } finally {
    setGitState('remoteOperation', null);
    setGitState('remoteProgress', null);
    stopListeningRemoteProgress();
  }
}

export async function pushRemote(): Promise<void> {
  const projectId = gitState.projectId;
  if (!projectId) return;

  setGitState('remoteOperation', 'push');
  setGitState('remoteProgress', null);
  setGitState('remoteError', null);
  try {
    await startListeningRemoteProgress();
    await invoke('git_push', { project_id: projectId });
    await refreshRepoInfo();
  } catch (err) {
    setGitState('remoteError', String(err));
    throw err;
  } finally {
    setGitState('remoteOperation', null);
    setGitState('remoteProgress', null);
    stopListeningRemoteProgress();
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
