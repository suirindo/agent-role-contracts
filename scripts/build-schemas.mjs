import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertSupportedSchema, canonical } from '../src/schema.mjs';
import { parseCanonicalSchemaSource, serializeCanonicalSchemaSource } from './schema-source.mjs';
const root = new URL('../', import.meta.url);
const names = ['role-contract','bundle','task','handoff','task-action','task-action-binding','task-lifecycle','financial-policy','financial-intent','financial-execution','safe-proposal'];
const schemas = Object.fromEntries(names.map(name => [name, parseCanonicalSchemaSource(readFileSync(new URL(`schemas/${name}.schema.json`, root)))]));
for (const schema of Object.values(schemas)) assertSupportedSchema(schema);
const role = {...schemas['role-contract']};delete role.$schema;delete role.$id;delete role.title;
if(canonical(role)!==canonical(schemas.bundle.properties.roles.items.properties.contract)) throw new Error('SCHEMA_ROLE_COPY_DRIFT');
const header = '// Generated from schemas/*.schema.json; do not edit.\n';
const coreNames = ['role-contract', 'bundle', 'task', 'handoff', 'task-action', 'task-action-binding', 'task-lifecycle'];
const financeNames = ['financial-policy', 'financial-intent', 'financial-execution', 'safe-proposal'];
const moduleFor = keys => header + 'export default ' + serializeCanonicalSchemaSource(Object.fromEntries(keys.map(name => [name, schemas[name]])), 2) + ';\n';
const outputs = {
 'src/schemas.core.generated.mjs': moduleFor(coreNames),
 'src/schemas.finance.generated.mjs': moduleFor(financeNames),
 'src/schemas.generated.mjs': header + "import core from './schemas.core.generated.mjs';\nimport finance from './schemas.finance.generated.mjs';\nexport default {...core,...finance};\n",
};
for (const [name, content] of Object.entries(outputs)) {
 const dest = new URL(name, root);
 if (process.argv.includes('--check')) {
  if (readFileSync(dest, 'utf8') !== content) throw new Error('SCHEMA_GENERATED_DRIFT: ' + name);
 } else { writeFileSync(dest, content); console.log(fileURLToPath(dest)); }
}
if (process.argv.includes('--check')) console.log(`${names.length} bundled schemas: supported-keyword check and generated identity PASS`);
