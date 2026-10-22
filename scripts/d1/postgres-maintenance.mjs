import { Client } from 'pg';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { quote, option } from './target-snapshot.mjs';
const freeze = process.argv.includes('--freeze');
const thaw = process.argv.includes('--thaw');
if (freeze === thaw || !process.argv.includes('--confirm-maintenance-window'))
  throw new Error(
    'Choose --freeze or --thaw and explicitly confirm the maintenance window',
  );
if (!process.env.SOURCE_DATABASE_URL)
  throw new Error('Set SOURCE_DATABASE_URL explicitly');
const stateFile = resolve(
  option('--state', '.migration/postgres-maintenance.json'),
);
// This administrative session must remain able to restore the saved settings.
// Application connections still inherit the database/role read-only defaults.
const admin = new Client({
  connectionString: process.env.SOURCE_DATABASE_URL,
  options: '-c default_transaction_read_only=off',
  connectionTimeoutMillis: 15000,
  application_name: 'todo-cf-maintenance-admin',
});
try {
  await admin.connect();
  const {
    rows: [identity],
  } = await admin.query(
    'SELECT current_database() AS db,current_user AS role,(SELECT oid FROM pg_database WHERE datname=current_database()) AS dbid,(SELECT oid FROM pg_roles WHERE rolname=current_user) AS roleid',
  );
  if (freeze) {
    const settings = (
      await admin.query(
        'SELECT setrole,setdatabase,setconfig FROM pg_db_role_setting WHERE setdatabase=$1 OR setdatabase=0',
        [identity.dbid],
      )
    ).rows;
    const overrides = settings.filter(
      (row) =>
        Number(row.setrole) !== 0 &&
        Number(row.setrole) !== Number(identity.roleid) &&
        row.setconfig.some((v) =>
          v.startsWith('default_transaction_read_only='),
        ),
    );
    if (overrides.length)
      throw new Error(
        'Other role-specific read-only settings exist; audit all writer roles before freezing',
      );
    const otherRoles = (
      await admin.query(
        "SELECT DISTINCT usename FROM pg_stat_activity WHERE datname=current_database() AND usename<>current_user AND backend_type='client backend'",
      )
    ).rows;
    if (otherRoles.length)
      throw new Error(
        'Connections from other database roles remain; drain and audit every writer before freezing',
      );
    const get = (role) =>
      settings
        .find(
          (row) =>
            Number(row.setrole) === role &&
            Number(row.setdatabase) === Number(identity.dbid),
        )
        ?.setconfig.find((v) => v.startsWith('default_transaction_read_only='))
        ?.split('=')[1] ?? null;
    const state = {
      version: 1,
      db: identity.db,
      role: identity.role,
      databaseDefault: get(0),
      roleDefault: get(Number(identity.roleid)),
      frozenAt: new Date().toISOString(),
    };
    await mkdir(dirname(stateFile), { recursive: true, mode: 0o700 });
    await writeFile(stateFile, JSON.stringify(state, null, 2), {
      mode: 0o600,
      flag: 'wx',
    });
    await admin.query(
      `ALTER DATABASE ${quote(identity.db)} SET default_transaction_read_only=on`,
    );
    await admin.query(
      `ALTER ROLE ${quote(identity.role)} IN DATABASE ${quote(identity.db)} SET default_transaction_read_only=on`,
    );
    // Drain/stop applications and Actions before this step. Terminate remaining
    // application sessions so old pools cannot keep a writable transaction.
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND pid<>pg_backend_pid() AND backend_type='client backend'",
    );
    const probe = new Client({
      connectionString: process.env.SOURCE_DATABASE_URL,
      connectionTimeoutMillis: 15000,
      application_name: 'todo-cf-readonly-probe',
    });
    try {
      await probe.connect();
      let denied = false;
      try {
        await probe.query('UPDATE "Task" SET name=name WHERE false');
      } catch (error) {
        denied = error.code === '25006';
      }
      if (!denied)
        throw new Error(
          'Writer probe was not rejected; keep maintenance mode and investigate client overrides',
        );
    } finally {
      await probe.end().catch(() => {});
    }
    console.log(
      `Old PostgreSQL writes rejected; restoration state saved: ${stateFile}`,
    );
  } else {
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    if (
      state.version !== 1 ||
      state.db !== identity.db ||
      state.role !== identity.role
    )
      throw new Error('Maintenance state belongs to another database or role');
    for (const [statement, value] of [
      [`ALTER DATABASE ${quote(identity.db)}`, state.databaseDefault],
      [
        `ALTER ROLE ${quote(identity.role)} IN DATABASE ${quote(identity.db)}`,
        state.roleDefault,
      ],
    ]) {
      if (value !== null && !['on', 'off', 'true', 'false'].includes(value))
        throw new Error('Invalid saved read-only setting');
      await admin.query(
        `${statement} ${value === null ? 'RESET default_transaction_read_only' : `SET default_transaction_read_only=${value}`}`,
      );
    }
    console.log(
      'Original PostgreSQL connection defaults restored. Restart old pools only after rollback validation.',
    );
  }
} catch (error) {
  console.error({
    code: error.code ?? 'MAINTENANCE_FAILED',
    message: error.code
      ? 'Database maintenance operation failed; inspect the saved state before reopening writes'
      : error.message,
  });
  process.exitCode = 1;
} finally {
  await admin.end().catch(() => {});
}
