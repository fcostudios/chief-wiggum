import { createStore } from 'solid-js/store';
import type { InlineDiffPreview } from '@/lib/inlineDiff';

interface DiffReviewState {
  activeInlineDiff: InlineDiffPreview | null;
}

const [state, setState] = createStore<DiffReviewState>({
  activeInlineDiff: null,
});

export function setActiveInlineDiff(preview: InlineDiffPreview): void {
  setState('activeInlineDiff', { ...preview });
}

export function clearActiveInlineDiff(): void {
  setState('activeInlineDiff', null);
}

export { state as diffReviewState };
