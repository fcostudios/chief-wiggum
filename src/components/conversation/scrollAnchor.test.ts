import { describe, expect, it } from 'vitest';

import { captureViewportAnchor, restoreViewportAnchor, type ViewportAnchor } from './scrollAnchor';

function setRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        x: rect.left ?? 0,
        y: rect.top ?? 0,
        top: rect.top ?? 0,
        left: rect.left ?? 0,
        right: rect.right ?? 0,
        bottom: rect.bottom ?? 0,
        width: rect.width ?? 0,
        height: rect.height ?? 0,
        toJSON: () => ({}),
      }) satisfies Partial<DOMRect>,
  });
}

function defineBoxMetrics(
  el: HTMLElement,
  metrics: { scrollTop?: number; scrollHeight?: number; clientHeight?: number },
): void {
  if (metrics.scrollTop !== undefined) {
    let value = metrics.scrollTop;
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: () => value,
      set: (next: number) => {
        value = next;
      },
    });
  }

  if (metrics.scrollHeight !== undefined) {
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      value: metrics.scrollHeight,
    });
  }

  if (metrics.clientHeight !== undefined) {
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      value: metrics.clientHeight,
    });
  }
}

describe('scrollAnchor', () => {
  it('captures a message anchor for the first visible row when away from bottom', () => {
    const container = document.createElement('div');
    defineBoxMetrics(container, {
      scrollTop: 400,
      scrollHeight: 2200,
      clientHeight: 600,
    });
    setRect(container, { top: 100, bottom: 700 });

    const hidden = document.createElement('div');
    hidden.dataset.messageId = 'm-1';
    setRect(hidden, { top: 40, bottom: 90 });

    const visible = document.createElement('div');
    visible.dataset.messageId = 'm-2';
    setRect(visible, { top: 160, bottom: 240 });

    container.append(hidden, visible);

    const anchor = captureViewportAnchor(container);

    expect(anchor).toEqual({
      type: 'message',
      messageId: 'm-2',
      offset: 60,
      distanceFromBottom: 1200,
    });
  });

  it('captures a bottom anchor when near the end of the list', () => {
    const container = document.createElement('div');
    defineBoxMetrics(container, {
      scrollTop: 1488,
      scrollHeight: 2200,
      clientHeight: 600,
    });
    setRect(container, { top: 0, bottom: 600 });

    const anchor = captureViewportAnchor(container);

    expect(anchor).toEqual({
      type: 'bottom',
      distanceFromBottom: 112,
    });
  });

  it('restores the same message offset after a layout change', () => {
    const container = document.createElement('div');
    defineBoxMetrics(container, {
      scrollTop: 300,
      scrollHeight: 2500,
      clientHeight: 600,
    });
    setRect(container, { top: 100, bottom: 700 });

    const target = document.createElement('div');
    target.dataset.messageId = 'm-2';
    setRect(target, { top: 250, bottom: 330 });
    container.append(target);

    const anchor: ViewportAnchor = {
      type: 'message',
      messageId: 'm-2',
      offset: 60,
      distanceFromBottom: 900,
    };

    restoreViewportAnchor(container, anchor);

    expect(container.scrollTop).toBe(390);
  });

  it('falls back to bottom anchoring when the target message disappears', () => {
    const container = document.createElement('div');
    defineBoxMetrics(container, {
      scrollTop: 500,
      scrollHeight: 1800,
      clientHeight: 600,
    });
    setRect(container, { top: 0, bottom: 600 });

    restoreViewportAnchor(container, {
      type: 'message',
      messageId: 'missing',
      offset: 24,
      distanceFromBottom: 180,
    });

    expect(container.scrollTop).toBe(1020);
  });
});
