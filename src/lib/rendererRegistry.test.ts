import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRenderers,
  getRenderer,
  hasRenderer,
  listRenderers,
  registerRenderer,
} from './rendererRegistry';

describe('RendererRegistry', () => {
  beforeEach(() => {
    clearRenderers();
  });

  it('registers and retrieves a renderer by content type', () => {
    const component = vi.fn();
    registerRenderer('json', { component, label: 'JSON Viewer' });

    expect(hasRenderer('json')).toBe(true);
    const entry = getRenderer('json');
    expect(entry).toBeDefined();
    expect(entry?.component).toBe(component);
    expect(entry?.label).toBe('JSON Viewer');
  });

  it('returns undefined for unregistered content type', () => {
    expect(getRenderer('mermaid')).toBeUndefined();
    expect(hasRenderer('mermaid')).toBe(false);
  });

  it('lists all registered renderer types', () => {
    registerRenderer('json', { component: vi.fn(), label: 'JSON' });
    registerRenderer('svg', { component: vi.fn(), label: 'SVG' });

    const types = listRenderers();
    expect(types).toContain('json');
    expect(types).toContain('svg');
    expect(types).toHaveLength(2);
  });

  it('clearRenderers removes all entries', () => {
    registerRenderer('json', { component: vi.fn(), label: 'JSON' });
    clearRenderers();
    expect(listRenderers()).toHaveLength(0);
  });

  it('overwrites existing renderer on re-register (HMR-safe)', () => {
    const first = vi.fn();
    const second = vi.fn();

    registerRenderer('json', { component: first, label: 'v1' });
    registerRenderer('json', { component: second, label: 'v2' });

    expect(getRenderer('json')?.component).toBe(second);
    expect(getRenderer('json')?.label).toBe('v2');
  });
});

describe('ContentDetector', () => {
  beforeEach(() => {
    clearRenderers();
  });

  it('detects renderer by code block language tag', () => {
    registerRenderer('json', {
      component: vi.fn(),
      label: 'JSON',
      detect: (lang, _code) => lang === 'json',
    });

    const entry = getRenderer('json');
    expect(entry?.detect?.('json', '{}')).toBe(true);
    expect(entry?.detect?.('typescript', '{}')).toBe(false);
  });

  it('detects renderer by content pattern when lang is empty', () => {
    registerRenderer('json-auto', {
      component: vi.fn(),
      label: 'JSON Auto',
      detect: (_lang, code) => {
        try {
          JSON.parse(code);
          return true;
        } catch {
          return false;
        }
      },
    });

    const entry = getRenderer('json-auto');
    expect(entry?.detect?.('', '{"key":"value"}')).toBe(true);
    expect(entry?.detect?.('', 'not json')).toBe(false);
  });
});
