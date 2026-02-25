import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';
import type { Project } from '@/lib/types';

type ProjectStoreModule = typeof import('./projectStore');

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: 'proj-1',
    name: 'test-project',
    path: '/home/user/project',
    default_model: null,
    default_effort: null,
    created_at: new Date().toISOString(),
    last_opened_at: null,
    ...overrides,
  };
}

describe('projectStore', () => {
  let mod: ProjectStoreModule;

  beforeEach(async () => {
    vi.resetModules();
    mockIpcCommand('list_projects', () => []);
    mockIpcCommand('start_project_file_watcher', () => undefined);
    mockIpcCommand('stop_project_file_watcher', () => undefined);
    mockIpcCommand('read_claude_md', () => null);
    mockIpcCommand('pick_project_folder', () => null);
    mockIpcCommand('create_project', () => makeProject());

    mod = await import('./projectStore');
    mod.setActiveProject(null);
  });

  it('starts with empty projects', () => {
    expect(mod.projectState.projects).toEqual([]);
    expect(mod.projectState.activeProjectId).toBeNull();
  });

  it('loadProjects fetches from backend', async () => {
    const projects = [makeProject(), makeProject({ id: 'proj-2', name: 'project-2' })];
    mockIpcCommand('list_projects', () => projects);
    await mod.loadProjects();
    expect(mod.projectState.projects).toHaveLength(2);
    expect(mod.projectState.isLoading).toBe(false);
  });

  it('loadProjects auto-selects first project', async () => {
    mockIpcCommand('list_projects', () => [makeProject()]);
    await mod.loadProjects();
    expect(mod.projectState.activeProjectId).toBe('proj-1');
  });

  it('loadProjects handles IPC error gracefully', async () => {
    mockIpcCommand('list_projects', () => {
      throw new Error('db error');
    });
    await mod.loadProjects();
    expect(mod.projectState.isLoading).toBe(false);
    expect(mod.projectState.loadError).toContain('db error');
  });

  it('setActiveProject updates active project ID', () => {
    mod.setActiveProject('proj-2');
    expect(mod.projectState.activeProjectId).toBe('proj-2');
  });

  it('setActiveProject(null) clears CLAUDE.md content', async () => {
    mockIpcCommand('read_claude_md', () => '# My Project');
    await mod.loadClaudeMd('proj-1');
    expect(mod.projectState.claudeMdContent).toBe('# My Project');
    mod.setActiveProject(null);
    expect(mod.projectState.claudeMdContent).toBeNull();
  });

  it('getActiveProject returns matching project', async () => {
    mockIpcCommand('list_projects', () => [makeProject()]);
    await mod.loadProjects();
    const active = mod.getActiveProject();
    expect(active?.id).toBe('proj-1');
    expect(active?.name).toBe('test-project');
  });

  it('getActiveProject returns undefined when no match', () => {
    expect(mod.getActiveProject()).toBeUndefined();
  });

  it('loadClaudeMd fetches content from backend', async () => {
    mockIpcCommand('read_claude_md', () => '# My Project');
    await mod.loadClaudeMd('proj-1');
    expect(mod.projectState.claudeMdContent).toBe('# My Project');
  });

  it('loadClaudeMd sets null on IPC error', async () => {
    mockIpcCommand('read_claude_md', () => {
      throw new Error('not found');
    });
    await mod.loadClaudeMd('proj-1');
    expect(mod.projectState.claudeMdContent).toBeNull();
  });
});
