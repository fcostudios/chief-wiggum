// src/stores/projectStore.ts
// Project state: active project folder for CLI working directory.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { Project } from '@/lib/types';

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  isLoading: boolean;
  claudeMdContent: string | null;
}

const [state, setState] = createStore<ProjectState>({
  projects: [],
  activeProjectId: null,
  isLoading: false,
  claudeMdContent: null,
});

/** Load all projects from the database. */
export async function loadProjects(): Promise<void> {
  setState('isLoading', true);
  try {
    const projects = await invoke<Project[]>('list_projects');
    setState('projects', projects);
    // Auto-select the first project if none selected
    if (!state.activeProjectId && projects.length > 0) {
      setState('activeProjectId', projects[0].id);
      loadClaudeMd(projects[0].id);
    }
  } finally {
    setState('isLoading', false);
  }
}

/** Open folder picker and create a project. Returns the new project. */
export async function pickAndCreateProject(): Promise<Project | null> {
  const folderPath = await invoke<string | null>('pick_project_folder');
  if (!folderPath) return null;

  const project = await invoke<Project>('create_project', {
    folder_path: folderPath,
  });
  setState('projects', (prev) => [project, ...prev]);
  setState('activeProjectId', project.id);
  loadClaudeMd(project.id);
  return project;
}

/** Fetch CLAUDE.md content for a project. Returns null if not found. */
export async function loadClaudeMd(projectId: string): Promise<void> {
  try {
    const content = await invoke<string | null>('read_claude_md', { project_id: projectId });
    setState('claudeMdContent', content);
  } catch {
    setState('claudeMdContent', null);
  }
}

/** Set the active project. */
export function setActiveProject(projectId: string | null): void {
  setState('activeProjectId', projectId);
  if (projectId) {
    loadClaudeMd(projectId);
  } else {
    setState('claudeMdContent', null);
  }
}

/** Get the active project object. */
export function getActiveProject(): Project | undefined {
  return state.projects.find((p) => p.id === state.activeProjectId);
}

export { state as projectState };
