import prismaInternals from '@prisma/internals';
import { writeFile, readFile } from 'node:fs/promises';
const dmmf = await prismaInternals.getDMMF({
  datamodel: await readFile(
    new URL('../../prisma/schema.prisma', import.meta.url),
    'utf8',
  ),
});
function migrationTables() {
  const models = dmmf.datamodel.models;
  const ordered = [];
  const seen = new Set();
  function visit(model) {
    if (seen.has(model.name)) return;
    seen.add(model.name);
    for (const relation of model.fields.filter(
      (field) => field.kind === 'object' && field.relationFromFields?.length,
    )) {
      const parent = models.find(
        (candidate) => candidate.name === relation.type,
      );
      if (parent) visit(parent);
    }
    ordered.push(model);
  }
  models.forEach(visit);
  const tables = ordered.map((model) => ({
    name: model.dbName ?? model.name,
    columns: model.fields
      .filter((field) => field.kind !== 'object')
      .map((field) => ({ name: field.dbName ?? field.name, type: field.type })),
    primaryKey:
      model.primaryKey?.fields ??
      model.fields
        .filter((field) => field.isId)
        .map((field) => field.dbName ?? field.name),
  }));
  const implicit = new Set();
  for (const model of models) {
    for (const field of model.fields.filter(
      (field) =>
        field.kind === 'object' &&
        field.isList &&
        !field.relationFromFields?.length,
    )) {
      const other = models.find((candidate) => candidate.name === field.type);
      const back = other?.fields.find(
        (candidate) =>
          candidate.relationName === field.relationName &&
          candidate.type === model.name,
      );
      if (
        back?.isList &&
        !back.relationFromFields?.length &&
        field.relationName
      )
        implicit.add(`_${field.relationName}`);
    }
  }
  for (const name of [...implicit].sort())
    tables.push({
      name,
      columns: [
        { name: 'A', type: 'String' },
        { name: 'B', type: 'String' },
      ],
      primaryKey: ['A', 'B'],
    });
  return tables;
}

const metadata = {
  tables: migrationTables(),
  relations: Object.fromEntries(
    dmmf.datamodel.models.map((model) => [
      model.name[0].toLowerCase() + model.name.slice(1),
      model.fields
        .filter((field) => field.kind === 'object')
        .map((field) => field.name),
    ]),
  ),
  enums: Object.fromEntries(
    dmmf.datamodel.enums.map((enumeration) => [
      enumeration.name,
      enumeration.values.map((value) => value.name),
    ]),
  ),
};
const content = `${JSON.stringify(metadata, null, 2)}\n`;
const target = new URL('../../src/data/schema.generated.json', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== content)
    throw new Error('D1 schema metadata is stale. Run pnpm data:generate');
} else await writeFile(target, content);
