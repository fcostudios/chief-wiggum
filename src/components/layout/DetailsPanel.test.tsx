import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { Session } from '@/lib/types';
import {
  PINNED_KEY_PREFIX,
  loadPinnedSections,
  savePinnedSections,
} from '@/components/layout/detailsPanelPins';

let mockSessions: Session[] = [];
let mockActiveSessionId: string | null = null;
let mockClaudeMdContent: string | null = null;
let mockProjectId: string | null = null;
let mockSelectedPath: string | null = null;
let mockPreviewContent: string | null = null;
let mockPreviewLoading = false;
let mockFileVisible = false;
let mockSelectedActionId: string | null = null;
let mockIsDirty = false;
let mockEditingFilePath: string | null = null;
let mockAttachmentsCount = 0;
let mockIsStreaming = false;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/stores/sessionStore', () => ({
  sessionState: {
    get sessions() {
      return mockSessions;
    },
    get activeSessionId() {
      return mockActiveSessionId;
    },
    get sessionSummaries() {
      return {};
    },
  },
  loadSessionSummary: vi.fn(),
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: {
    get claudeMdContent() {
      return mockClaudeMdContent;
    },
    get activeProjectId() {
      return mockProjectId;
    },
  },
}));

vi.mock('@/stores/fileStore', () => ({
  fileState: {
    get selectedPath() {
      return mockSelectedPath;
    },
    get previewContent() {
      return mockPreviewContent;
    },
    get isPreviewLoading() {
      return mockPreviewLoading;
    },
    get isVisible() {
      return mockFileVisible;
    },
    get isDirty() {
      return mockIsDirty;
    },
    get editingFilePath() {
      return mockEditingFilePath;
    },
  },
}));

vi.mock('@/stores/actionStore', () => ({
  actionState: {
    get selectedActionId() {
      return mockSelectedActionId;
    },
  },
}));

vi.mock('@/stores/conversationStore', () => ({
  conversationState: {
    get isStreaming() {
      return mockIsStreaming;
    },
  },
}));

vi.mock('@/stores/contextStore', () => ({
  contextState: {
    get attachments() {
      return Array.from({ length: mockAttachmentsCount }, (_, idx) => ({ id: String(idx) }));
    },
  },
}));

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => {
    const map: Record<string, string> = {
      'detailsPanel.actionOutput': 'Action Output',
      'detailsPanel.filePreview': 'File Preview',
      'detailsPanel.projectContext': 'Project Context',
      'detailsPanel.context': 'Context',
      'detailsPanel.cost': 'Cost',
      'detailsPanel.history': 'History',
      'detailsPanel.artifacts': 'Artifacts',
      'detailsPanel.selectFileHint': 'Select a file from the sidebar to preview',
      'detailsPanel.noArtifacts': 'No code blocks found in this session yet.',
      'detailsPanel.pinSection': 'Pin open',
      'detailsPanel.unpinSection': 'Unpin',
    };
    return map[key] ?? key;
  },
}));

vi.mock('@/components/conversation/MarkdownContent', () => ({
  default: () => <div data-testid="markdown-project-context" />,
}));
vi.mock('@/components/explorer/FilePreview', () => ({
  default: () => <div data-testid="file-preview" />,
}));
vi.mock('@/components/actions/ActionOutputPanel', () => ({
  default: () => <div data-testid="action-output-panel" />,
}));

import DetailsPanel from './DetailsPanel';

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: 's1',
    project_id: null,
    title: 'Session',
    model: 'claude-sonnet-4-6',
    status: null,
    parent_session_id: null,
    context_tokens: null,
    total_input_tokens: 2000,
    total_output_tokens: 500,
    total_cost_cents: 321,
    created_at: null,
    updated_at: null,
    cli_session_id: null,
    pinned: false,
    ...overrides,
  };
}

describe('DetailsPanel', () => {
  beforeEach(() => {
    mockSessions = [makeSession()];
    mockActiveSessionId = 's1';
    mockClaudeMdContent = null;
    mockProjectId = null;
    mockSelectedPath = null;
    mockPreviewContent = null;
    mockPreviewLoading = false;
    mockFileVisible = false;
    mockSelectedActionId = null;
    mockIsDirty = false;
    mockEditingFilePath = null;
    mockAttachmentsCount = 0;
    mockIsStreaming = false;
    localStorage.clear();
  });

  it('renders details panel with Context and Cost sections', () => {
    render(() => <DetailsPanel />);
    expect(screen.getByLabelText('Details panel')).toBeInTheDocument();
    expect(screen.getByText('Context')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
  });

  it('displays active session token and cost summaries', () => {
    render(() => <DetailsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Context' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cost' }));
    expect(screen.getByText('2.0K / 0.5K')).toBeInTheDocument();
    expect(screen.getByText('$3.21')).toBeInTheDocument();
  });

  it('shows file preview placeholder when files pane is visible but no file selected', () => {
    mockProjectId = 'p1';
    mockFileVisible = true;
    render(() => <DetailsPanel />);
    expect(screen.getByText('File Preview')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'File Preview' }));
    expect(screen.getByText(/Select a file from the sidebar to preview/)).toBeInTheDocument();
  });

  it('renders action output, file preview, and project context sections when data exists', () => {
    mockSelectedActionId = 'action-1';
    mockSelectedPath = 'src/main.ts';
    mockPreviewContent = 'const x = 1';
    mockFileVisible = true;
    mockProjectId = 'p1';
    mockClaudeMdContent = '# Project context';

    render(() => <DetailsPanel />);
    expect(screen.getByText('Action Output')).toBeInTheDocument();
    expect(screen.getByTestId('action-output-panel')).toBeInTheDocument();
    expect(screen.getByTestId('file-preview')).toBeInTheDocument();
    expect(screen.getByText('Project Context')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Project Context'));
    expect(screen.getByTestId('markdown-project-context')).toBeInTheDocument();
  });
});

describe('DetailsPanel pin persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty set when no saved pins', () => {
    expect(loadPinnedSections('proj-1')).toEqual(new Set());
  });

  it('returns empty set when projectId is null', () => {
    expect(loadPinnedSections(null)).toEqual(new Set());
  });

  it('saves and loads pinned sections', () => {
    const pinned = new Set(['context', 'cost']);
    savePinnedSections('proj-1', pinned);
    expect(loadPinnedSections('proj-1')).toEqual(pinned);
  });

  it('isolates per project', () => {
    savePinnedSections('proj-1', new Set(['context']));
    savePinnedSections('proj-2', new Set(['cost']));
    expect(loadPinnedSections('proj-1')).toEqual(new Set(['context']));
    expect(loadPinnedSections('proj-2')).toEqual(new Set(['cost']));
  });

  it('tolerates malformed persisted JSON', () => {
    localStorage.setItem(`${PINNED_KEY_PREFIX}proj-1`, '{');
    expect(loadPinnedSections('proj-1')).toEqual(new Set());
  });
});
