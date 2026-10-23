import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, readFile, chmod, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--'))
    throw new Error(`Missing ${name}`);
  return process.argv[i + 1];
};
export const quote = (name) => `"${name.replaceAll('"', '""')}"`;
export function wranglerTarget() {
  const args = [
    option('--database', 'DB'),
    process.argv.includes('--remote') ? '--remote' : '--local',
    '--config',
    option('--config', 'data-service/wrangler.jsonc'),
  ];
  for (const name of ['--env', '--persist-to'])
    if (process.argv.includes(name)) args.push(name, option(name));
  return args;
}
export async function targetSnapshot() {
  if (
    process.argv.includes('--remote') &&
    !process.argv.includes('--confirm-writes-paused')
  )
    throw new Error('Pause all writers and pass --confirm-writes-paused');
  const folder = resolve('.migration', `target-${randomUUID()}`);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  if (
    !process.argv.includes('--remote') &&
    (process.argv.includes('--persist-to') ||
      process.argv.includes('--sqlite-file'))
  ) {
    let sqlite = option('--sqlite-file');
    if (!sqlite) {
      const location = resolve(
        option('--persist-to'),
        'v3/d1/miniflare-D1DatabaseObject',
      );
      const candidates = (await readdir(location)).filter(
        (name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite',
      );
      if (candidates.length !== 1)
        throw new Error(
          'Specify --sqlite-file when the local persistence directory contains multiple databases',
        );
      sqlite = join(location, candidates[0]);
    }
    const source = new DatabaseSync(resolve(sqlite), { readOnly: true });
    const file = join(folder, 'snapshot.sqlite');
    try {
      await backup(source, file);
    } finally {
      source.close();
    }
    await chmod(file, 0o600);
    const db = new DatabaseSync(file, { readOnly: true });
    if (
      db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Error('Local SQLite integrity or foreign key check failed');
    return { db, folder, file };
  }
  const file = option('--snapshot-sql', join(folder, 'snapshot.sql'));
  if (!process.argv.includes('--snapshot-sql')) {
    execFileSync(
      process.execPath,
      [
        resolve('node_modules/wrangler/bin/wrangler.js'),
        'd1',
        'export',
        ...wranglerTarget(),
        '--output',
        file,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 },
    );
    await chmod(file, 0o600);
  }
  const db = new DatabaseSync(':memory:');
  // Dump order is not guaranteed to follow foreign-key dependencies. Validate
  // the complete restored graph after loading instead of checking half a dump.
  db.exec('PRAGMA foreign_keys=OFF;');
  db.exec(await readFile(file, 'utf8'));
  db.exec('PRAGMA foreign_keys=ON;');
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
    throw new Error('SQLite integrity check failed');
  if (db.prepare('PRAGMA foreign_key_check').all().length)
    throw new Error('Foreign key check failed');
  return { db, folder, file };
}
export function rows(db, table) {
  const keys = table.primaryKey.map(quote).join(',');
  // SQLite's native iterator walks the primary-key index without OFFSET or
  // copying the full table into memory. Text keys use binary ordering.
  return db
    .prepare(
      `SELECT ${table.columns.map((c) => quote(c.name)).join(',')} FROM ${quote(table.name)} ORDER BY ${keys}`,
    )
    .iterate();
}
