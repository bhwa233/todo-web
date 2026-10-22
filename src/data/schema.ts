import metadata from './schema.generated.json' with { type: 'json' };

export interface MigrationTable {
  name: string;
  columns: { name: string; type: string }[];
  primaryKey: string[];
}

// Generated from Prisma at build time: DMMF is unavailable inside Workers.
export function migrationTables(): MigrationTable[] {
  return metadata.tables;
}

export function canonicalValue(
  value: unknown,
  type: string,
): string | number | null {
  if (value === null) return null;
  if (value === undefined) throw new Error('Missing migration column');
  if (type === 'DateTime') {
    const date =
      value instanceof Date
        ? value
        : new Date(typeof value === 'number' ? value : String(value));
    if (Number.isNaN(date.getTime()))
      throw new Error('Invalid migration timestamp');
    return date.toISOString().replace('Z', '+00:00');
  }
  if (type === 'Boolean') {
    if (![true, false, 0, 1].includes(value as boolean | number))
      throw new Error('Invalid migration boolean');
    return Number(value);
  }
  if (type === 'Int' || type === 'Float') {
    const number = Number(value);
    if (
      !Number.isFinite(number) ||
      (type === 'Int' && !Number.isSafeInteger(number))
    )
      throw new Error('Invalid migration number');
    return number;
  }
  const text = String(value);
  const enumeration = (metadata.enums as Record<string, string[]>)[type];
  if (enumeration && !enumeration.includes(text))
    throw new Error(`Unsupported migration enum: ${type}`);
  return text;
}
