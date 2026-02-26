import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { Message } from '@/lib/types';

let mockMessages: Message[] = [];
let mockIsLoading = false;
let mockIsStreaming = false;
let mockError: string | null = null;
let mockThinkingContent = '';
let mockLastUserMessage = '';
let mockActiveSessionId: string | null = 'session-1';
let mockCliDetected = true;
let mockActiveProjectId: string | null = null;
let mockTypewriterRendered = '';

const mockSendMessage = vi.fn();
const mockRetryLastMessage = vi.fn();
const mockPickAndCreateProject = vi.fn(() => Promise.resolve());

vi.mock('@tanstack/solid-virtual', () => ({
  createVirtualizer: () => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
    measureElement: vi.fn(),
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

vi.mock('@/stores/conversationStore', () => ({
  conversationState: {
    get messages() {
      return mockMessages;
    },
    get isLoading() {
      return mockIsLoading;
    },
    get isStreaming() {
      return mockIsStreaming;
    },
    get error() {
      return mockError;
    },
    get thinkingContent() {
      return mockThinkingContent;
    },
    get lastUserMessage() {
      return mockLastUserMessage;
    },
  },
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  retryLastMessage: (...args: unknown[]) => mockRetryLastMessage(...args),
  editMessage: vi.fn(),
  regenerateResponse: vi.fn(),
  typewriter: {
    rendered: () => mockTypewriterRendered,
  },
}));

vi.mock('@/stores/sessionStore', () => ({
  sessionState: {
    get activeSessionId() {
      return mockActiveSessionId;
    },
  },
}));

vi.mock('@/stores/cliStore', () => ({
  cliState: {
    get isDetected() {
      return mockCliDetected;
    },
  },
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: {
    get activeProjectId() {
      return mockActiveProjectId;
    },
  },
  pickAndCreateProject: () => mockPickAndCreateProject(),
}));

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => key,
}));

vi.mock('./MessageBubble', () => ({
  default: (props: { message: Message }) => (
    <div data-testid="message-bubble">{props.message.content}</div>
  ),
}));
vi.mock('./MarkdownContent', () => ({
  default: (props: { content: string }) => <div data-testid="markdown">{props.content}</div>,
}));
vi.mock('./ToolUseBlock', () => ({ ToolUseBlock: () => <div data-testid="tool-use" /> }));
vi.mock('./ToolResultBlock', () => ({ ToolResultBlock: () => <div data-testid="tool-result" /> }));
vi.mock('./ThinkingBlock', () => ({ ThinkingBlock: () => <div data-testid="thinking-block" /> }));
vi.mock('./StreamingThinkingBlock', () => ({
  StreamingThinkingBlock: (props: { content: string }) => (
    <div data-testid="streaming-thinking">{props.content}</div>
  ),
}));
vi.mock('./PermissionRecordBlock', () => ({
  PermissionRecordBlock: () => <div data-testid="permission-record" />,
}));

import ConversationView from './ConversationView';

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'm-1',
    session_id: 'session-1',
    role: 'assistant',
    content: 'Assistant reply',
    model: 'claude-sonnet-4-6',
    input_tokens: 10,
    output_tokens: 5,
    thinking_tokens: null,
    cost_cents: 2,
    is_compacted: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('ConversationView', () => {
  beforeEach(() => {
    mockMessages = [];
    mockIsLoading = false;
    mockIsStreaming = false;
    mockError = null;
    mockThinkingContent = '';
    mockLastUserMessage = '';
    mockActiveSessionId = 'session-1';
    mockCliDetected = true;
    mockActiveProjectId = null;
    mockTypewriterRendered = '';
    mockSendMessage.mockClear();
    mockRetryLastMessage.mockClear();
    mockPickAndCreateProject.mockClear();
    if (!HTMLElement.prototype.scrollTo) {
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
        configurable: true,
        value: () => {},
      });
    }
  });

  it('renders empty state with project CTA and sample prompts', () => {
    render(() => <ConversationView />);
    expect(screen.getByText('Open a Project Folder')).toBeInTheDocument();
    expect(screen.getByText('conversation.emptyTitle')).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(1);
  });

  it('opens project picker from empty-state CTA', () => {
    render(() => <ConversationView />);
    fireEvent.click(screen.getByRole('button', { name: /Open a Project Folder/i }));
    expect(mockPickAndCreateProject).toHaveBeenCalled();
  });

  it('sends sample prompt using active session', () => {
    render(() => <ConversationView />);
    fireEvent.click(screen.getByRole('button', { name: /conversation\.sampleExplain/ }));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.any(String), 'session-1');
  });

  it('shows CLI-not-found guidance when CLI is unavailable', () => {
    mockCliDetected = false;
    render(() => <ConversationView />);
    expect(screen.getByText('conversation.cliNotFoundTitle')).toBeInTheDocument();
    expect(screen.getByText(/npm install -g @anthropic-ai\/claude-code/)).toBeInTheDocument();
  });

  it('renders messages and shows retry action for conversation error', () => {
    mockMessages = [
      makeMessage({
        id: 'u1',
        role: 'user',
        content: 'Hello',
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'Hi there' }),
    ];
    mockError = 'Connection failed';
    mockLastUserMessage = 'Hello';

    render(() => <ConversationView />);

    expect(screen.getAllByTestId('message-bubble')).toHaveLength(2);
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(mockRetryLastMessage).toHaveBeenCalledWith('session-1');
  });
});
