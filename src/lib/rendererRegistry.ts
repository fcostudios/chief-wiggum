import type { Component } from 'solid-js';

export type ContentDetector = (lang: string, code: string) => boolean;

export interface RendererComponentProps {
  code: string;
  lang: string;
}

export interface RendererEntry {
  component: Component<RendererComponentProps>;
  label: string;
  detect?: ContentDetector;
}

type RendererRegistryMap = Map<string, RendererEntry>;

declare global {
  var __cwRendererRegistry__: RendererRegistryMap | undefined;
}

const registry: RendererRegistryMap = globalThis.__cwRendererRegistry__ ?? new Map();
if (!globalThis.__cwRendererRegistry__) {
  globalThis.__cwRendererRegistry__ = registry;
}

export function registerRenderer(contentType: string, entry: RendererEntry): void {
  registry.set(contentType, entry);
}

export function getRenderer(contentType: string): RendererEntry | undefined {
  return registry.get(contentType);
}

export function hasRenderer(contentType: string): boolean {
  return registry.has(contentType);
}

export function listRenderers(): string[] {
  return Array.from(registry.keys());
}

export function clearRenderers(): void {
  registry.clear();
}

export function findRenderer(lang: string, code: string): RendererEntry | undefined {
  if (lang) {
    const exact = registry.get(lang);
    if (exact && (!exact.detect || exact.detect(lang, code))) {
      return exact;
    }
  }

  for (const entry of registry.values()) {
    if (entry.detect?.(lang, code)) {
      return entry;
    }
  }

  return undefined;
}

export const RENDERER_ATTR = 'data-cw-renderer';
export const RENDERER_CODE_ATTR = 'data-cw-code';
export const RENDERER_LANG_ATTR = 'data-cw-lang';
