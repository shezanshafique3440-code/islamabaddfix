import { prisma } from '../db';
import { AppError } from '../errors';
import {
  defaultSettings,
  settingKeys,
  settingsSchema,
  type SettingKey,
  type SettingValue,
} from './definitions';

export * from './definitions';

/**
 * Settings read path.
 *
 * Values are cached in-process for a short TTL: they are read on nearly every
 * request (commission, guarantee, matching weights) but change rarely. Writes
 * invalidate the cache in the writing process; other instances converge within
 * the TTL, which is acceptable for configuration of this kind.
 */
const CACHE_TTL_MS = 15_000;

interface Cache {
  values: Record<string, unknown>;
  loadedAt: number;
}
const globalForSettings = globalThis as unknown as { settingsCache?: Cache };

async function load(): Promise<Record<string, unknown>> {
  const cached = globalForSettings.settingsCache;
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.values;

  const rows = await prisma.setting.findMany();
  const values: Record<string, unknown> = { ...defaultSettings() };
  for (const row of rows) {
    if (!(row.key in settingsSchema)) continue; // ignore retired keys
    const parsed = settingsSchema[row.key as SettingKey].schema.safeParse(row.value);
    // A stored value that no longer validates falls back to the default rather
    // than taking the platform down.
    if (parsed.success) values[row.key] = parsed.data;
  }
  globalForSettings.settingsCache = { values, loadedAt: Date.now() };
  return values;
}

export function invalidateSettingsCache(): void {
  globalForSettings.settingsCache = undefined;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const values = await load();
  return values[key] as SettingValue<K>;
}

export async function getSettings<const K extends readonly SettingKey[]>(
  keys: K,
): Promise<{ [I in keyof K]: SettingValue<K[I] & SettingKey> }> {
  const values = await load();
  return keys.map((k) => values[k]) as { [I in keyof K]: SettingValue<K[I] & SettingKey> };
}

export async function getAllSettings(): Promise<Record<SettingKey, unknown>> {
  const values = await load();
  return values as Record<SettingKey, unknown>;
}

/** Validate and persist one setting. Callers must have already authorized. */
export async function setSetting<K extends SettingKey>(
  key: K,
  rawValue: unknown,
  updatedByUserId?: string,
): Promise<SettingValue<K>> {
  const definition = settingsSchema[key];
  const parsed = definition.schema.safeParse(rawValue);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', `Setting "${key}" ki value invalid hai.`, {
      fields: parsed.error.issues.map((i) => ({
        path: [key, ...i.path.map(String)].join('.'),
        message: i.message,
      })),
    });
  }
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: parsed.data as object, updatedByUserId },
    update: { value: parsed.data as object, updatedByUserId },
  });
  invalidateSettingsCache();
  return parsed.data as SettingValue<K>;
}

/** Metadata for rendering the admin settings screen. */
export function settingsMetadata() {
  return settingKeys.map((key) => {
    const def = settingsSchema[key];
    return {
      key,
      label: def.label,
      help: def.help,
      group: def.group,
      unit: 'unit' in def ? def.unit : undefined,
      kind: inferKind(def.default),
    };
  });
}

function inferKind(value: unknown): 'boolean' | 'number' | 'string' | 'json' {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  return 'json';
}
