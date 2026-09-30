import test from "node:test";
import assert from "node:assert/strict";
import { parseCanonicalSchemaSource, serializeCanonicalSchemaSource } from "../scripts/schema-source.mjs";

test("canonical schema source rejects duplicate decoded keys", () => {
  assert.throws(
    () => parseCanonicalSchemaSource(Buffer.from("{\"type\":\"string\",\"\\u0074ype\":\"number\"}")),
    /SCHEMA_SOURCE_JSON_INVALID/,
  );
});

test("canonical schema source rejects __proto__ keys before JS generation", () => {
  assert.throws(
    () => parseCanonicalSchemaSource(Buffer.from('{"const":{"__proto__":{"x":1}}}')),
    /SCHEMA_SOURCE_RESERVED_KEY/,
  );
});

test("canonical schema source rejects unsafe integer literals before generation", () => {
  assert.throws(
    () => parseCanonicalSchemaSource(Buffer.from("{\"minimum\":9007199254740993}")),
    /SCHEMA_SOURCE_UNSAFE_INTEGER/,
  );
});

test("canonical schema source rejects numbers that decode as non-finite", () => {
  assert.throws(
    () => parseCanonicalSchemaSource(Buffer.from("{\"maximum\":1e400}")),
    /SCHEMA_SOURCE_NONFINITE_NUMBER/,
  );
});

test("canonical schema source keeps safe JSON data unchanged", () => {
  assert.deepEqual(
    parseCanonicalSchemaSource(Buffer.from("{\"minimum\":-9007199254740991,\"maximum\":9007199254740991}")),
    { minimum: -9007199254740991, maximum: 9007199254740991 },
  );
});

test("generated schema source escapes bidi controls while preserving decoded JSON", () => {
  const value = { title: "left\u202eright", const: { "key\u2066": "value\u0085" } };
  const emitted = serializeCanonicalSchemaSource(value, 2);
  assert.equal(emitted.includes("\u202e"), false);
  assert.equal(emitted.includes("\u2066"), false);
  assert.equal(emitted.includes("\u0085"), false);
  assert.ok(emitted.includes("\\u202e"));
  assert.ok(emitted.includes("\\u2066"));
  assert.ok(emitted.includes("\\u0085"));
  assert.deepEqual(JSON.parse(emitted), value);
});
