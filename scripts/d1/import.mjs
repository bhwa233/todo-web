import { readFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { wranglerTarget } from './target-snapshot.mjs';
import { migrationTables } from '../../src/data/schema.ts';

const directory = resolve(process.argv[2] ?? '.migration/export');
const remote = process.argv.includes('--remote');
if (remote && !process.argv.includes('--confirm-empty-target'))
  throw new Error(
    'Remote import requires --confirm-empty-target after independently checking the target is empty and all writers are paused',
  );
const manifest = JSON.parse(
  await readFile(join(directory, 'manifest.json'), 'utf8'),
);
if (
  manifest.version !== 1 ||
  manifest.schemaHash !==
    createHash('sha256').update(JSON.stringify(migrationTables())).digest('hex')
)
  throw new Error('Export schema differs from the current Prisma schema');
for (const file of manifest.files) {
  if (file !== basename(file) || !/^\d+\.sql$/.test(file))
    throw new Error('Invalid export file name');
  if (
    createHash('sha256')
      .update(await readFile(join(directory, file)))
      .digest('hex') !== manifest.fileHashes?.[file]
  )
    throw new Error(`Export file integrity failed: ${file}`);
}
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const targetArgs = ['d1', 'execute', ...wranglerTarget()];
const counts = JSON.parse(
  execFileSync(
    process.execPath,
    [
      wrangler,
      ...targetArgs,
      '--command',
      'SELECT ' +
        [...migrationTables(), { name: '_AiJob' }]
          .map(
            (table) =>
              `(SELECT COUNT(*) FROM "${table.name}") AS "${table.name}"`,
          )
          .join(','),
      '--json',
    ],
    { encoding: 'utf8' },
  ),
);
if (
  counts.some(
    (batch) =>
      !batch.success ||
      batch.results.some((row) =>
        Object.values(row).some((count) => Number(count) !== 0),
      ),
  )
)
  throw new Error(
    'Target is not empty; refusing to merge snapshots or repeat a partial import',
  );
for (const file of manifest.files) {
  console.log(`Importing ${file}`);
  try {
    execFileSync(
      process.execPath,
      [wrangler, ...targetArgs, '--file', join(directory, file)],
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (error) {
    // Preserve the provider's complete diagnostics privately; the default
    // child-process Error truncates stderr to a numeric Buffer dump.
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(directory, 'import-failure.log'),
      `${error.stdout?.toString() ?? ''}\n${error.stderr?.toString() ?? ''}`,
      { mode: 0o600 },
    );
    throw new Error(
      `Import failed at ${file}; keep writes paused and use a new empty target. Details: ${join(directory, 'import-failure.log')}`,
    );
  }
}
console.log(
  'Import finished. Keep writes paused and run pnpm data:verify before switching clients.',
);
