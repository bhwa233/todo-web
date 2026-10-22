import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { resolve, join, dirname } from 'node:path';
import { migrationTables, canonicalValue } from '../../src/data/schema.ts';

if (!process.env.SOURCE_DATABASE_URL)
  throw new Error(
    'Set SOURCE_DATABASE_URL explicitly; application credentials are not loaded automatically',
  );
const output = resolve(
  process.argv[2] ??
    `.migration/export-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
await mkdir(output, { recursive: false, mode: 0o700 });
const client = new Client({
  connectionString: process.env.SOURCE_DATABASE_URL,
  connectionTimeoutMillis: 15000,
  application_name: 'todo-d1-export',
});
const tables = migrationTables();
const manifest = {
  version: 1,
  createdAt: new Date().toISOString(),
  schemaHash: createHash('sha256').update(JSON.stringify(tables)).digest('hex'),
  tables: [],
  files: [],
  fileHashes: {},
};
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const literal = (value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : value.includes('\0')
        ? `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`
        : `'${value.replaceAll("'", "''")}'`;
let stream;
let streamError;
let fileBytes = 0;
let fileIndex = 0;
async function closeFile() {
  if (!stream) return;
  stream.end();
  await once(stream, 'finish');
  stream = undefined;
}
async function emit(sql) {
  if (streamError) throw streamError;
  const bytes = Buffer.byteLength(sql);
  if (bytes > 95_000)
    throw new Error(
      'A row exceeds D1 SQL statement size; export stopped without truncating data',
    );
  if (!stream || fileBytes + bytes > 4 * 1024 * 1024) {
    await closeFile();
    const file = `${String(++fileIndex).padStart(5, '0')}.sql`;
    stream = createWriteStream(join(output, file), {
      flags: 'wx',
      mode: 0o600,
    });
    stream.on('error', (error) => {
      streamError = error;
    });
    manifest.files.push(file);
    fileBytes = 0;
  }
  fileBytes += bytes;
  if (!stream.write(sql)) await once(stream, 'drain');
}
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  const actual = await client.query(
    "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY ordinal_position",
  );
  const known = new Set(tables.map((table) => table.name));
  const extra = [...new Set(actual.rows.map((row) => row.table_name))].filter(
    (name) => !known.has(name) && name !== '_prisma_migrations',
  );
  if (extra.length)
    throw new Error(
      `Unmapped source tables: ${extra.join(', ')}. Add them to the schema before exporting.`,
    );
  for (const table of tables) {
    const actualColumns = actual.rows
      .filter((row) => row.table_name === table.name)
      .map((row) => row.column_name);
    if (
      actualColumns.length !== table.columns.length ||
      table.columns.some((column) => !actualColumns.includes(column.name))
    )
      throw new Error(
        `Source schema differs for ${table.name}; no data has been truncated`,
      );
  }
  for (const table of tables) {
    const projection = table.columns
      .map((column) =>
        column.type === 'DateTime'
          ? `to_char(${quote(column.name)}, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS ${quote(column.name)}`
          : quote(column.name),
      )
      .join(',');
    const order = table.primaryKey
      .map(
        (name) =>
          `${quote(name)}${table.columns.find((column) => column.name === name)?.type === 'String' ? ' COLLATE "C"' : ''}`,
      )
      .join(',');
    await client.query(
      `DECLARE migration_cursor NO SCROLL CURSOR FOR SELECT ${projection} FROM public.${quote(table.name)} ORDER BY ${order}`,
    );
    const hash = createHash('sha256');
    let count = 0;
    while (true) {
      const batch = await client.query(
        'FETCH FORWARD 500 FROM migration_cursor',
      );
      if (!batch.rowCount) break;
      for (const row of batch.rows) {
        const values = table.columns.map((column) =>
          canonicalValue(
            column.type === 'DateTime' && row[column.name] !== null
              ? `${row[column.name]}Z`
              : row[column.name],
            column.type,
          ),
        );
        hash.update(`${JSON.stringify(values)}\n`);
        const insertSql = (expressions) =>
          `INSERT INTO ${quote(table.name)} (${table.columns.map((column) => quote(column.name)).join(',')}) VALUES (${expressions.join(',')});\n`;
        const direct = insertSql(values.map(literal));
        if (Buffer.byteLength(direct) <= 95_000) await emit(direct);
        else {
          // Materialize long values before the final INSERT. This preserves
          // unique keys and NOT NULL constraints without truncating any field.
          await emit(
            'CREATE TABLE "_MigrationLargeValue" (name TEXT PRIMARY KEY,value TEXT NOT NULL);\n',
          );
          const expressions = [];
          for (let i = 0; i < values.length; i++) {
            const value = values[i];
            const key = String(i);
            if (typeof value !== 'string' || Buffer.byteLength(value) < 2000) {
              expressions.push(literal(value));
              continue;
            }
            const points = Array.from(value);
            for (let start = 0; start < points.length; start += 4000) {
              const part = literal(points.slice(start, start + 4000).join(''));
              await emit(
                start === 0
                  ? `INSERT INTO "_MigrationLargeValue" VALUES (${literal(key)},${part});\n`
                  : `UPDATE "_MigrationLargeValue" SET value=value||${part} WHERE name=${literal(key)};\n`,
              );
            }
            expressions.push(
              `(SELECT value FROM "_MigrationLargeValue" WHERE name=${literal(key)})`,
            );
          }
          await emit(insertSql(expressions));
          await emit('DROP TABLE "_MigrationLargeValue";\n');
        }
        count++;
      }
    }
    await client.query('CLOSE migration_cursor');
    manifest.tables.push({
      name: table.name,
      count,
      sha256: hash.digest('hex'),
    });
    console.log(`${table.name}: ${count} rows`);
  }
  const sequence = await client.query(
    "SELECT pg_sequence_last_value(pg_get_serial_sequence('public.\"Media\"','id')::regclass) AS value",
  );
  const high = Number(sequence.rows[0]?.value ?? 0);
  if (!Number.isSafeInteger(high) || high < 0)
    throw new Error('Invalid source Media sequence');
  manifest.sequences = { Media: high };
  await emit(
    `UPDATE sqlite_sequence SET seq=MAX(seq,${high}) WHERE name='Media';\n`,
  );
  await closeFile();
  for (const file of manifest.files) {
    const { readFile } = await import('node:fs/promises');
    manifest.fileHashes[file] = createHash('sha256')
      .update(await readFile(join(output, file)))
      .digest('hex');
  }
  // Explicit IDs keep all references intact; SQLite's AUTOINCREMENT sequence
  // advances automatically to the imported Media maximum.
  await client.query('COMMIT');
  await writeFile(
    join(output, 'manifest.json.tmp'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  await rename(
    join(output, 'manifest.json.tmp'),
    join(output, 'manifest.json'),
  );
  console.log(`Export complete: ${output}`);
} catch (error) {
  stream?.destroy();
  await client.query('ROLLBACK').catch(() => {});
  console.error(
    JSON.stringify({
      code: error.code ?? 'EXPORT_FAILED',
      message: error.code
        ? 'Source database rejected the export; no complete manifest was produced'
        : error.message,
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
