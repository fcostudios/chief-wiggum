export interface ViewportAnchor {
  type: 'message' | 'bottom';
  messageId?: string;
  offset?: number;
  distanceFromBottom: number;
}

function clampScrollTop(container: HTMLElement, nextTop: number): number {
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
  return Math.max(0, Math.min(nextTop, maxTop));
}

export function captureViewportAnchor(container: HTMLElement): ViewportAnchor | null {
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  if (distanceFromBottom < 120) {
    return {
      type: 'bottom',
      distanceFromBottom,
    };
  }

  const containerTop = container.getBoundingClientRect().top;
  const messageEls = Array.from(
    container.querySelectorAll<HTMLElement>('[data-message-id]'),
  ).filter((el) => el.dataset.messageId);

  const firstVisible = messageEls.find((el) => el.getBoundingClientRect().bottom > containerTop);
  if (!firstVisible?.dataset.messageId) {
    return {
      type: 'bottom',
      distanceFromBottom,
    };
  }

  return {
    type: 'message',
    messageId: firstVisible.dataset.messageId,
    offset: firstVisible.getBoundingClientRect().top - containerTop,
    distanceFromBottom,
  };
}

export function restoreViewportAnchor(container: HTMLElement, anchor: ViewportAnchor): void {
  if (anchor.type === 'bottom') {
    container.scrollTop = clampScrollTop(
      container,
      container.scrollHeight - container.clientHeight - anchor.distanceFromBottom,
    );
    return;
  }

  const target = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]')).find(
    (el) => el.dataset.messageId === anchor.messageId,
  );

  if (!target) {
    container.scrollTop = clampScrollTop(
      container,
      container.scrollHeight - container.clientHeight - anchor.distanceFromBottom,
    );
    return;
  }

  const containerTop = container.getBoundingClientRect().top;
  const targetTop = target.getBoundingClientRect().top;
  const desiredTop = container.scrollTop + (targetTop - containerTop) - (anchor.offset ?? 0);
  container.scrollTop = clampScrollTop(container, desiredTop);
}
