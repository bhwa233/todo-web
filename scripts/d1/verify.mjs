import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { migrationTables, canonicalValue } from '../../src/data/schema.ts';
import { targetSnapshot, rows } from './target-snapshot.mjs';

const manifest = JSON.parse(
  await readFile(
    join(resolve(process.argv[2] ?? '.migration/export'), 'manifest.json'),
    'utf8',
  ),
);
const tables = migrationTables();
if (
  manifest.version !== 1 ||
  manifest.schemaHash !==
    createHash('sha256').update(JSON.stringify(tables)).digest('hex')
)
  throw new Error('Export schema differs from current schema');
if (
  manifest.tables.length !== tables.length ||
  new Set(manifest.tables.map((t) => t.name)).size !== tables.length
)
  throw new Error('Incomplete or duplicate manifest tables');
const { db, folder } = await targetSnapshot();
const report = [];
try {
  for (const table of tables) {
    const expected = manifest.tables.find((t) => t.name === table.name);
    if (!expected) throw new Error(`Missing manifest table: ${table.name}`);
    const hash = createHash('sha256');
    let count = 0;
    for (const row of rows(db, table)) {
      hash.update(
        `${JSON.stringify(table.columns.map((c) => canonicalValue(row[c.name], c.type)))}\n`,
      );
      count++;
    }
    const sha256 = hash.digest('hex');
    const matched = count === expected.count && sha256 === expected.sha256;
    report.push({ name: table.name, count, sha256, matched });
    console.log(
      `${matched ? 'PASS' : 'FAIL'} ${table.name}: ${count}/${expected.count}; full-row SHA-256`,
    );
  }
  const sequence = Number(
    db.prepare("SELECT seq FROM sqlite_sequence WHERE name='Media'").get()
      ?.seq ?? 0,
  );
  const maximum = Number(
    db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM Media').get().id,
  );
  if (sequence < Math.max(maximum, manifest.sequences?.Media ?? 0))
    throw new Error('Media sequence is behind imported IDs');
  await writeFile(
    join(folder, 'verification.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        tables: report,
        mediaSequence: sequence,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  if (report.some((t) => !t.matched)) process.exitCode = 1;
  else
    console.log(
      `All source tables match. Verification report: ${folder}/verification.json`,
    );
} finally {
  db.close();
}
