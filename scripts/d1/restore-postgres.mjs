import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { migrationTables, canonicalValue } from '../../src/data/schema.ts';
import { targetSnapshot, rows, quote, option } from './target-snapshot.mjs';

if (!process.env.TARGET_DATABASE_URL)
  throw new Error('Set TARGET_DATABASE_URL explicitly');
if (
  !process.argv.includes('--confirm-replace-target') ||
  !process.argv.includes('--confirm-writes-paused')
)
  throw new Error(
    'Freeze both stacks and pass --confirm-replace-target --confirm-writes-paused',
  );
const tables = migrationTables();
const { db, folder } = await targetSnapshot();
const pending = db
  .prepare(
    "SELECT COUNT(*) AS count FROM _AiJob WHERE status IN ('PENDING','PUBLISHED','RUNNING')",
  )
  .get().count;
if (pending)
  throw new Error(
    'Drain pending AI jobs before returning to PostgreSQL; the complete D1 snapshot has been saved',
  );
const schema = option('--target-schema', 'public');
if (!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(schema))
  throw new Error('Invalid target schema');
const qualified = (name) => `${quote(schema)}.${quote(name)}`;
// Only this administrative connection overrides the freeze. Legacy application
// pools must continue to inherit read-only defaults throughout verification.
const client = new Client({
  connectionString: process.env.TARGET_DATABASE_URL,
  options: '-c default_transaction_read_only=off',
  connectionTimeoutMillis: 15000,
  application_name: 'todo-d1-reverse-migration',
});
const report = [];
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  await client.query("SET LOCAL lock_timeout='15s'");
  // No CASCADE: an unrecognized external relation must stop the restore.
  await client.query(
    `LOCK TABLE ${tables.map((t) => qualified(t.name)).join(',')} IN ACCESS EXCLUSIVE MODE`,
  );
  const actual = await client.query(
    'SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1',
    [schema],
  );
  const extra = [...new Set(actual.rows.map((r) => r.table_name))].filter(
    (name) =>
      !tables.some((t) => t.name === name) && name !== '_prisma_migrations',
  );
  if (extra.length)
    throw new Error('Target contains unmapped tables; refusing to replace');
  for (const table of tables) {
    const columns = actual.rows
      .filter((r) => r.table_name === table.name)
      .map((r) => r.column_name);
    if (
      columns.length !== table.columns.length ||
      table.columns.some((c) => !columns.includes(c.name))
    )
      throw new Error(`Target schema differs for ${table.name}`);
  }
  for (const table of [...tables].reverse())
    await client.query(`DELETE FROM ${qualified(table.name)}`);
  for (const table of tables) {
    const sourceHash = createHash('sha256');
    let count = 0;
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const params = batch.flatMap((row) =>
        table.columns.map((c) =>
          c.type === 'Boolean' && row[c.name] !== null
            ? Boolean(row[c.name])
            : row[c.name],
        ),
      );
      const tuples = batch.map(
        (_, i) =>
          `(${table.columns.map((_, j) => `$${i * table.columns.length + j + 1}`).join(',')})`,
      );
      await client.query(
        `INSERT INTO ${qualified(table.name)} (${table.columns.map((c) => quote(c.name)).join(',')}) VALUES ${tuples.join(',')}`,
        params,
      );
      batch = [];
    };
    for (const row of rows(db, table)) {
      sourceHash.update(
        `${JSON.stringify(table.columns.map((c) => canonicalValue(row[c.name], c.type)))}\n`,
      );
      count++;
      batch.push(row);
      if (batch.length >= 250) await flush();
    }
    await flush();
    const projection = table.columns
      .map((c) =>
        c.type === 'DateTime'
          ? `to_char(${quote(c.name)}, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS ${quote(c.name)}`
          : quote(c.name),
      )
      .join(',');
    const order = table.primaryKey
      .map(
        (name) =>
          `${quote(name)}${table.columns.find((c) => c.name === name)?.type === 'String' ? ' COLLATE "C"' : ''}`,
      )
      .join(',');
    await client.query(
      `DECLARE verify_reverse NO SCROLL CURSOR FOR SELECT ${projection} FROM ${qualified(table.name)} ORDER BY ${order}`,
    );
    const targetHash = createHash('sha256');
    let targetCount = 0;
    while (true) {
      const result = await client.query(
        'FETCH FORWARD 500 FROM verify_reverse',
      );
      if (!result.rowCount) break;
      for (const row of result.rows) {
        targetHash.update(
          `${JSON.stringify(table.columns.map((c) => canonicalValue(c.type === 'DateTime' && row[c.name] !== null ? `${row[c.name]}Z` : row[c.name], c.type)))}\n`,
        );
        targetCount++;
      }
    }
    await client.query('CLOSE verify_reverse');
    const expected = sourceHash.digest('hex');
    const matched =
      expected === targetHash.digest('hex') && count === targetCount;
    if (!matched)
      throw new Error(`Reverse verification failed for ${table.name}`);
    report.push({ name: table.name, count, sha256: expected });
    console.log(`PASS reverse ${table.name}: ${count}`);
  }
  const max = Number(
    db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM Media').get().id,
  );
  const high = Math.max(
    max,
    Number(
      db.prepare("SELECT seq FROM sqlite_sequence WHERE name='Media'").get()
        ?.seq ?? 0,
    ),
  );
  await client.query("SELECT setval(pg_get_serial_sequence($1,'id'),$2,$3)", [
    `${quote(schema)}."Media"`,
    Math.max(1, high),
    high > 0,
  ]);
  // setval is non-transactional in PostgreSQL. On failure, a sequence may move
  // forward but no row/ID is lost or reused; keep both stacks frozen on error.
  await client.query('COMMIT');
  await writeFile(
    join(folder, 'postgres-restore.json'),
    JSON.stringify(
      {
        schema,
        completedAt: new Date().toISOString(),
        tables: report,
        mediaSequence: high,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    `Reverse restore committed and verified. Report: ${folder}/postgres-restore.json`,
  );
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error({
    code: error.code ?? 'RESTORE_FAILED',
    message: error.code
      ? 'PostgreSQL rejected restore; target rows rolled back'
      : error.message,
  });
  process.exitCode = 1;
} finally {
  db.close();
  await client.end().catch(() => {});
}
