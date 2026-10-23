import { execFileSync } from 'node:child_process';
import { mkdir, chmod, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
if (!process.env.SOURCE_DATABASE_URL)
  throw new Error('Set SOURCE_DATABASE_URL explicitly');
const url = new URL(process.env.SOURCE_DATABASE_URL);
const folder = resolve(process.argv[2] ?? `.migration/pg-backup-${Date.now()}`);
await mkdir(folder, { recursive: false, mode: 0o700 });
const file = join(folder, 'database.dump');
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGSSLMODE: ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    ? 'disable'
    : 'verify-full',
  PGSSLROOTCERT: 'system',
  PGAPPNAME: 'todo-cf-backup',
};
const dump = process.env.PG_DUMP_PATH ?? 'pg_dump';
try {
  execFileSync(dump, ['--format=custom', '--file', file], {
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await chmod(file, 0o600);
  execFileSync(
    process.env.PG_RESTORE_PATH ??
      (dump === 'pg_dump' ? 'pg_restore' : join(dirname(dump), 'pg_restore')),
    ['--list', file],
    { env, stdio: 'ignore' },
  );
  await writeFile(
    join(folder, 'backup.json'),
    JSON.stringify(
      {
        version: 1,
        createdAt: new Date().toISOString(),
        format: 'postgres-custom',
        file: 'database.dump',
        sha256: createHash('sha256')
          .update(await readFile(file))
          .digest('hex'),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(`Verified PostgreSQL backup saved: ${folder}`);
} catch {
  console.error(
    'PostgreSQL backup failed; no verified backup manifest produced',
  );
  process.exitCode = 1;
}
