import { parseJsonRejectDuplicateKeys } from "../src/strict-json.mjs";

function assertSupportedJsonNumberProfile(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("SCHEMA_SOURCE_NONFINITE_NUMBER");
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new Error("SCHEMA_SOURCE_UNSAFE_INTEGER");
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSupportedJsonNumberProfile(item);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "__proto__") throw new Error("SCHEMA_SOURCE_RESERVED_KEY");
      assertSupportedJsonNumberProfile(item);
    }
  }
}

export function parseCanonicalSchemaSource(bytes) {
  const value = parseJsonRejectDuplicateKeys(bytes, "SCHEMA_SOURCE_JSON_INVALID");
  assertSupportedJsonNumberProfile(value);
  return value;
}

export function serializeCanonicalSchemaSource(value, space = 2) {
  return JSON.stringify(value, null, space).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
