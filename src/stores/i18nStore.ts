// src/stores/i18nStore.ts
// Internationalization infrastructure for CHI-126/128.
// Uses @solid-primitives/i18n (flatten + translator) with lazy locale loading.

import { createSignal } from 'solid-js';
import {
  flatten,
  resolveTemplate,
  translator,
  type BaseTemplateArgs,
  type Flatten,
} from '@solid-primitives/i18n';
import enLocale from '@/locales/en.json';
import { createLogger } from '@/lib/logger';

const log = createLogger('ui/i18n');

export type Locale = 'en' | 'es';
type RawDictionary = typeof enLocale;
type FlatDictionary = Flatten<RawDictionary>;

const SUPPORTED_LOCALES = new Set<Locale>(['en', 'es']);
const localeLoaders = import.meta.glob<{ default: RawDictionary }>('../locales/*.json');
const flatDictionaryCache: Partial<Record<Locale, FlatDictionary>> = {
  en: flatten(enLocale) as FlatDictionary,
};

const [locale, setLocale] = createSignal<Locale>('en');
type TranslateFn = (path: string, args?: BaseTemplateArgs) => unknown;

const translatorCache: Partial<Record<Locale, TranslateFn>> = {
  en: translator(() => flatDictionaryCache.en!, resolveTemplate) as TranslateFn,
};

function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.has(value as Locale);
}

/** Coerce persisted/user-provided locale values to a supported locale. */
export function normalizeLocale(value: string | null | undefined): Locale {
  if (value && isLocale(value)) return value;
  return 'en';
}

async function ensureLocaleLoaded(target: Locale): Promise<boolean> {
  if (flatDictionaryCache[target]) return true;

  const loader = localeLoaders[`../locales/${target}.json`];
  if (!loader) {
    log.warn(`Locale file not found for "${target}"`);
    return false;
  }

  try {
    const mod = await loader();
    flatDictionaryCache[target] = flatten(mod.default) as FlatDictionary;
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Failed to load locale "${target}": ${message}`);
    return false;
  }
}

/** Translate a dot-path key with optional template arguments. Falls back to English, then key name. */
export function t(key: string, args?: BaseTemplateArgs): string {
  const activeLocale = locale();
  const activeTranslator =
    translatorCache[activeLocale] ??
    (translatorCache[activeLocale] = translator(
      () => flatDictionaryCache[activeLocale] ?? flatDictionaryCache.en!,
      resolveTemplate,
    ) as TranslateFn);

  const activeResult = activeTranslator(key, args);
  if (typeof activeResult === 'string') return activeResult;

  const fallback = translatorCache.en!(key, args);
  return typeof fallback === 'string' ? fallback : key;
}

/** Switch UI locale. Unknown locales are coerced to English. */
export async function switchLocale(nextLocale: string | Locale): Promise<void> {
  const target = normalizeLocale(nextLocale);
  if (target === locale()) return;

  const loaded = await ensureLocaleLoaded(target);
  if (!loaded) return;

  setLocale(target);
  log.info(`Switched locale to ${target}`);
}

/** Read the current UI locale. */
export function currentLocale(): Locale {
  return locale();
}
