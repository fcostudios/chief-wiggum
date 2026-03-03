// src/lib/types.ts
// TypeScript IPC types mirroring Rust types (SPEC-004 §6).
// Populated as Tauri commands are added.

/** Session status per SPEC-001 §9 */
export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';

/** Agent status per SPEC-001 §9 */
export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'complete' | 'error';

/** Agent role per SPEC-001 §9 */
export type AgentRole = 'lead' | 'teammate' | 'background';

/** Model identifiers per SPEC-001 §3 */
export type ModelId = 'claude-opus-4-6' | 'claude-sonnet-4-6' | 'claude-haiku-4-5';

/** Message role per SPEC-001 §9 */
export type MessageRole =
  | 'user'
  | 'assistant'
  | 'system'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'permission';

/** Permission request from CLI bridge (mirrors Rust PermissionRequest) */
export interface PermissionRequest {
  request_id: string;
  tool: string;
  command: string;
  file_path: string | null;
  risk_level: 'low' | 'medium' | 'high';
}

/** Permission response action (mirrors Rust PermissionAction) */
export type PermissionAction = 'Approve' | 'Deny' | 'AlwaysAllow';

/** Permission response sent back to backend */
export interface PermissionResponse {
  request_id: string;
  action: PermissionAction;
  pattern: string | null;
}

/** Message per SPEC-004 §6 */
export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  thinking_tokens: number | null;
  cost_cents: number | null;
  is_compacted: boolean;
  created_at: string;
}

/** Structured data stored in tool_use message content (JSON string). */
export interface ToolUseData {
  tool_name: string;
  tool_input: string;
  tool_use_id?: string;
}

/** Structured data stored in tool_result message content (JSON string). */
export interface ToolResultData {
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

/** Structured data stored in permission message content (JSON string). */
export interface PermissionRecordData {
  tool: string;
  command: string;
  outcome: 'allowed' | 'denied' | 'yolo';
  risk_level: string;
}

/** Tool classification category for color-coding. */
export type ToolCategory = 'file' | 'bash' | 'neutral';

/** A single todo item from a TodoWrite tool call. */
export interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/** Parsed payload of a TodoWrite tool_input JSON string. */
export interface TodoWriteData {
  todos: TodoItem[];
}

/** Process lifecycle status (mirrors Rust ProcessStatus). */
export type ProcessStatus =
  | 'not_started'
  | 'starting'
  | 'running'
  | 'shutting_down'
  | 'exited'
  | 'error';

/** Session per SPEC-004 §6 — matches Rust SessionRow */
export interface Session {
  id: string;
  project_id: string | null;
  title: string | null;
  model: string;
  status: string | null;
  parent_session_id: string | null;
  context_tokens: number | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cost_cents: number | null;
  created_at: string | null;
  updated_at: string | null;
  cli_session_id: string | null;
  pinned: boolean | null;
}

/** Backend info about an active CLI bridge (for reconnection after HMR/reload). */
export interface ActiveBridgeInfo {
  session_id: string;
  process_status: string;
  cli_session_id: string | null;
  model: string | null;
  has_buffered_events: boolean;
}

/** Payload from `cli:init` Tauri event (Agent SDK system:init). */
export interface CliInitEvent {
  session_id: string;
  cli_session_id: string;
  model: string;
  tools: string[];
  mcp_servers: string[];
}

/** Buffered event from backend replay after frontend reconnect. */
export interface BufferedEvent {
  type:
    | 'Chunk'
    | 'MessageComplete'
    | 'CliInit'
    | 'CliExited'
    | 'ToolUse'
    | 'ToolOutput'
    | 'ToolResult'
    | 'Thinking'
    | 'PermissionRequest';
  session_id: string;
  // Chunk fields
  content?: string;
  token_count?: number | null;
  // MessageComplete fields
  role?: string;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  thinking_tokens?: number | null;
  cost_cents?: number | null;
  is_error?: boolean;
  // CliInit fields
  cli_session_id?: string;
  // CliExited fields
  exit_code?: number | null;
  // ToolUse fields
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: string;
  // ToolResult fields (content, is_error, tool_use_id already covered above)
  // Thinking fields (content already covered above)
  is_streaming?: boolean;
  // PermissionRequest fields
  request_id?: string;
  tool?: string;
  command?: string;
  file_path?: string | null;
  risk_level?: string;
}

/** Payload from `tool:output` Tauri event — emitted just before tool:result. */
export interface ToolOutputEvent {
  session_id: string;
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

/** CLI location info from backend (mirrors Rust CliLocation) */
export interface CliLocation {
  path_override: string | null;
  resolved_path: string | null;
  version: string | null;
  supports_sdk?: boolean;
}

/** Project row from backend (mirrors Rust ProjectRow) */
export interface Project {
  id: string;
  name: string;
  path: string;
  default_model: string | null;
  default_effort: string | null;
  created_at: string | null;
  last_opened_at: string | null;
}

/** Slash command from backend discovery (mirrors Rust SlashCommand). */
export interface SlashCommand {
  name: string;
  description: string;
  category: 'Builtin' | 'Action' | 'Project' | 'User' | 'Sdk' | 'Skill';
  args_hint: string | null;
  source_path: string | null;
  from_sdk: boolean;
}

// ── File Explorer (CHI-115/116/117) ──────────────────────

/** Filesystem node type. */
export type FileNodeType = 'File' | 'Directory' | 'Symlink';

/** A node in the file tree. */
export interface FileNode {
  name: string;
  relative_path: string;
  node_type: FileNodeType;
  size_bytes: number | null;
  extension: string | null;
  children: FileNode[] | null;
  is_binary: boolean;
  is_git_ignored?: boolean;
}

/** File content returned by read_project_file. */
export interface FileContent {
  relative_path: string;
  content: string;
  line_count: number;
  size_bytes: number;
  language: string | null;
  estimated_tokens: number;
  truncated: boolean;
  /** Whether the file is read-only on disk. */
  is_readonly: boolean;
  /** Last modified timestamp in ms since Unix epoch. Null if unavailable. */
  modified_at_ms: number | null;
}

/** Search result for file name matching. */
export interface FileSearchResult {
  relative_path: string;
  name: string;
  extension: string | null;
  score: number;
}

/** A code symbol found by backend regex scanning. */
export interface SymbolSearchResult {
  name: string;
  kind: 'function' | 'class' | 'variable';
  file_path: string;
  line_number: number;
  snippet: string;
  estimated_tokens: number;
}

/** Git file status indicator (mirrors Rust GitFileStatus). */
export interface GitFileStatus {
  status: 'modified' | 'untracked' | 'staged' | 'deleted' | 'renamed' | 'conflict';
}

/** Reference to a file attached to a prompt. */
export interface FileReference {
  relative_path: string;
  name: string;
  extension: string | null;
  estimated_tokens: number;
  start_line?: number;
  end_line?: number;
  /** Optimized symbol-level context selection (CHI-131). */
  symbol_names?: string[];
  /** Estimated tokens of the original full-file attachment before optimization. */
  full_file_tokens?: number;
  is_directory: boolean;
}

/** An attached file in the context assembly. */
export interface ContextAttachment {
  id: string;
  reference: FileReference;
  content?: string;
  actual_tokens?: number;
}

/** An image pasted from clipboard, stored in-memory as base64 data URL. */
export interface ImageAttachment {
  id: string;
  data_url: string;
  mime_type: string;
  file_name: string;
  size_bytes: number;
  estimated_tokens: number;
  width?: number;
  height?: number;
}

/** Image payload sent to the backend for SDK vision input blocks. */
export interface PromptImageInput {
  file_name: string;
  mime_type: string;
  data_base64: string;
  size_bytes: number;
  width?: number;
  height?: number;
}

/** MIME types accepted for external file drag-drop and paste. */
export const SUPPORTED_TEXT_MIMES = new Set([
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'text/typescript',
  'text/markdown',
  'text/x-python',
  'text/x-java',
  'text/x-c',
  'text/x-c++',
  'text/x-rust',
  'text/x-go',
  'text/x-ruby',
  'text/x-yaml',
  'text/xml',
  'text/csv',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-yaml',
  'application/toml',
]);

/** File extensions accepted regardless of MIME type. */
export const SUPPORTED_TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.rs',
  '.go',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.md',
  '.txt',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.graphql',
  '.gql',
  '.env',
  '.gitignore',
  '.dockerfile',
  '.lua',
  '.vim',
  '.el',
  '.clj',
  '.r',
  '.jl',
  '.m',
  '.tf',
  '.hcl',
]);

/** Image MIME types accepted for paste/drop. */
export const SUPPORTED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

/** Quality score for an attached file in the current conversation context. */
export interface ContextQualityScore {
  /** Overall quality 0-100. Green >= 60, Yellow >= 30, Red < 30. */
  overall: number;
  /** Keyword overlap between file content/name and conversation history. */
  relevance: number;
  /** Inverse token cost factor — smaller files score higher. */
  tokenEfficiency: number;
  /** Whether the file has been modified since attachment (stale = true). */
  isStale: boolean;
  /** Human-readable quality label. */
  label: 'high' | 'medium' | 'low';
}

/** Related file suggestion generated from imports/tests for context attachment. */
export interface FileSuggestion {
  path: string;
  reason: string;
  confidence: number;
  estimated_tokens: number;
}

/** Symbol discovered in a source file (CHI-131). */
export interface ExtractedSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'struct' | 'trait' | 'impl';
  start_line: number;
  end_line: number;
  estimated_tokens: number;
}

/** Suggested symbol-level optimization for an attached file (CHI-131). */
export interface SymbolOptimizationSuggestion {
  symbols: ExtractedSymbol[];
  suggested_symbols: string[];
  optimized_tokens: number;
  full_tokens: number;
}

/** Single file entry inside a multi-file bundle suggestion (CHI-134). */
export interface FileBundleEntry {
  relative_path: string;
  name: string;
  extension: string | null;
  estimated_tokens: number;
}

/** Bundle suggestion for one-click multi-file context attachment (CHI-134). */
export interface FileBundleSuggestion {
  id: string;
  kind: 'component' | 'module' | 'custom';
  label: string;
  reason: string;
  entries: FileBundleEntry[];
  estimated_tokens: number;
}

// ── Artifacts (CHI-225) ──────────────────────────────────

/** A code/diagram/plan block extracted from a session message. */
export interface Artifact {
  id: string;
  session_id: string;
  message_id: string;
  message_index: number;
  block_index: number;
  type: 'code' | 'file' | 'plan' | 'diagram' | 'data';
  language: string | null;
  title: string;
  preview: string;
  content: string;
  line_count: number;
  created_at: number;
}

/** Aggregate session statistics for the History tab. */
export interface SessionSummary {
  message_count: number;
  tool_count: number;
  artifact_count: number;
  duration_secs: number;
  models_used: string[];
}

// ── Settings (CHI-122) ──────────────────────────────────

/** User settings persisted to JSON (mirrors Rust UserSettings). */
export interface UserSettings {
  version: number;
  appearance: AppearanceSettings;
  i18n: I18nSettings;
  cli: CliSettings;
  sessions: SessionSettings;
  onboarding: OnboardingSettings;
  keybindings: Record<string, string>;
  privacy: PrivacySettings;
  advanced: AdvancedSettings;
}

export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  font_size: number;
  code_font_size: number;
  sidebar_default: 'expanded' | 'collapsed' | 'hidden';
}

export interface I18nSettings {
  locale: string;
  date_format: 'relative' | 'iso' | 'locale';
  number_format: 'standard' | 'compact';
}

export interface CliSettings {
  default_model: string;
  default_effort: 'low' | 'medium' | 'high';
}

export interface SessionSettings {
  max_concurrent: number;
  auto_save_interval_secs: number;
  resume_inactivity_minutes: number;
}

export interface OnboardingSettings {
  completed: boolean;
  seen_hints: string[];
  hints_enabled: boolean;
}

export interface PrivacySettings {
  log_redaction_level: 'none' | 'standard' | 'aggressive';
}

export interface AdvancedSettings {
  cli_path_override: string;
  debug_mode: boolean;
  developer_mode: boolean;
}

/** Payload from `settings:updated` backend event. */
export interface SettingsChangedPayload {
  category: string;
  key: string | null;
}

/** Redaction summary returned by diagnostic bundle export. */
export interface RedactionSummary {
  rules_applied: string[];
  entries_redacted: number;
  total_entries: number;
  fields_redacted: number;
}

/** Result of diagnostic bundle export (CHI-96). */
export interface BundleExportResult {
  path: string;
  size_bytes: number;
  log_entry_count: number;
  redaction: RedactionSummary;
}

// ── Project Actions (CHI-138) ──────────────────────────────

export type ActionSource =
  | 'package_json'
  | 'makefile'
  | 'cargo_toml'
  | 'docker_compose'
  | 'claude_actions';
export type ActionCategory = 'dev' | 'build' | 'test' | 'lint' | 'deploy' | 'custom';
export type ActionStatus = 'starting' | 'running' | 'completed' | 'failed' | 'stopped' | 'idle';

export interface ActionDefinition {
  id: string;
  name: string;
  command: string;
  working_dir: string;
  source: ActionSource;
  category: ActionCategory;
  description: string | null;
  is_long_running: boolean;
  before_commands?: string[];
  after_commands?: string[];
  env_vars?: Record<string, string>;
  args?: ActionArgTemplate[];
}

export interface ActionOutputLine {
  line: string;
  is_error: boolean;
  timestamp: number;
}

/** Recent action lifecycle event (frontend-only CHI-144 helper shape). */
export interface ActionRecentEvent {
  action_id: string;
  name: string;
  status: 'completed' | 'failed';
  exit_code: number | null;
  timestamp: number;
}

export interface RunningActionInfo {
  action_id: string;
  status: ActionStatus;
}

/** Running action snapshot used by cross-project Actions Center lanes (CHI-220). */
export interface CrossProjectRunningAction {
  action_id: string;
  project_id: string;
  project_name: string;
  action_name: string;
  status: ActionStatus;
  elapsed_ms: number;
  last_output_line: string | null;
  command: string;
  category: ActionCategory;
  is_long_running: boolean;
}

/** Persisted action execution history row (CHI-219/220). */
export interface ActionHistoryEntry {
  id: number;
  action_id: string;
  project_id: string;
  project_name: string;
  action_name: string;
  command: string;
  category: string;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  output_preview: string | null;
  created_at: string;
}

/** CHI-145 inline editor payload for custom actions. */
export interface CustomActionDraft {
  name: string;
  command: string;
  working_dir: string;
  category: ActionCategory;
  description: string | null;
  is_long_running: boolean;
  before_commands?: string[];
  after_commands?: string[];
  env_vars?: Record<string, string>;
  args?: ActionArgTemplate[];
}

/** Minimal argument template metadata (Phase 2, CHI-145). */
export interface ActionArgTemplate {
  name: string;
  type: 'string' | 'enum';
  description?: string;
  required?: boolean;
  options?: string[];
  default?: string;
}
