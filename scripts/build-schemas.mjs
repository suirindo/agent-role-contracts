import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertSupportedSchema, canonical } from '../src/schema.mjs';
import { parseCanonicalSchemaSource, serializeCanonicalSchemaSource } from './schema-source.mjs';
const root = new URL('../', import.meta.url);
const names = ['role-contract','bundle','task','handoff','financial-policy','financial-intent','financial-execution','safe-proposal'];
const schemas = Object.fromEntries(names.map(name => [name, parseCanonicalSchemaSource(readFileSync(new URL(`schemas/${name}.schema.json`, root)))]));
for (const schema of Object.values(schemas)) assertSupportedSchema(schema);
const role = {...schemas['role-contract']};delete role.$schema;delete role.$id;delete role.title;
if(canonical(role)!==canonical(schemas.bundle.properties.roles.items.properties.contract)) throw new Error('SCHEMA_ROLE_COPY_DRIFT');
const content = '// Generated from schemas/*.schema.json; do not edit.\nexport default ' + serializeCanonicalSchemaSource(schemas, 2) + ';\n';
const dest = new URL('src/schemas.generated.mjs',root);
if (process.argv.includes('--check')) {
 if (readFileSync(dest,'utf8') !== content) throw new Error('SCHEMA_GENERATED_DRIFT');
 console.log(`${names.length} bundled schemas: supported-keyword check and generated identity PASS`);
} else {writeFileSync(dest,content);console.log(fileURLToPath(dest));}
