// Bounded schema engine for the public contract profile.
//
// This module is a source-owned, bounded implementation for the Core's bundled
// Draft-07 profile. It intentionally implements only the keywords admitted
// below. It is not a general JSON Schema validator.
const hasOwn = (value, key) => Object.hasOwn(value, key);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const SUPPORTED_TYPES = new Set([
  'object', 'array', 'string', 'number', 'integer', 'boolean', 'null',
]);

const SUPPORTED_KEYWORDS = new Set([
  '$schema', '$id', 'title', 'description',
  'type', 'required', 'properties', 'additionalProperties', 'items',
  'minItems', 'maxItems', 'uniqueItems',
  'minLength', 'maxLength', 'pattern',
  'enum', 'const', 'minimum', 'maximum',
]);

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#';
const DIAGNOSTIC_UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g;

function safeDiagnostic(value) {
  return String(value).replace(
    DIAGNOSTIC_UNSAFE,
    char => '\\u' + char.codePointAt(0).toString(16).padStart(4, '0'),
  );
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (isRecord(value)) {
    return '{' + Object.keys(value)
      .sort()
      .map(key => JSON.stringify(key) + ':' + stableJson(value[key]))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

export function canonical(value) {
  return stableJson(value);
}

function schemaFailure(code, path = '') {
  const suffix = path ? ' ' + safeDiagnostic(path) : '';
  throw new Error(code + suffix);
}

function requireSchemaRecord(value, path) {
  if (!isRecord(value)) schemaFailure('SCHEMA_NOT_OBJECT', path);
}

function validateTypeKeyword(typeValue, path) {
  const types = Array.isArray(typeValue) ? typeValue : [typeValue];
  if (
    types.length === 0
    || types.some(type => !SUPPORTED_TYPES.has(type))
    || new Set(types).size !== types.length
  ) schemaFailure('SCHEMA_INVALID_KEYWORD_VALUE', path);
}

function validateStringArray(value, path) {
  if (
    !Array.isArray(value)
    || value.some(item => typeof item !== 'string')
    || new Set(value).size !== value.length
  ) schemaFailure('SCHEMA_INVALID_KEYWORD_VALUE', path);
}

function validateNonNegativeInteger(value, path) {
  if (!Number.isInteger(value) || value < 0) {
    schemaFailure('SCHEMA_INVALID_KEYWORD_VALUE', path);
  }
}

function validateFiniteNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    schemaFailure('SCHEMA_INVALID_KEYWORD_VALUE', path);
  }
}

function walkSchemaDefinition(schema, path) {
  requireSchemaRecord(schema, path);

  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      schemaFailure('SCHEMA_UNSUPPORTED_KEYWORD', path + '/' + key);
    }
  }

  if (hasOwn(schema, '$schema') && schema.$schema !== DRAFT_07) {
    schemaFailure('SCHEMA_UNSUPPORTED_DIALECT');
  }

  for (const key of ['$id', 'title', 'description']) {
    if (hasOwn(schema, key) && typeof schema[key] !== 'string') {
      schemaFailure('SCHEMA_INVALID_KEYWORD_VALUE', path + '/' + key);
    }
  }

  if (hasOwn(schema, 'type')) validateTypeKeyword(schema.type, path + '/type');
  if (hasOwn(schema, 'required')) validateStringArray(schema.required, path + '/required');

  if (hasOwn(schema, 'enum') && !Array.isArray(schema.enum)) {
    schemaFailure('SCHEMA_INVALID_KEYWORD_VALUE', path + '/enum');
  }
  if (hasOwn(schema, 'uniqueItems') && typeof schema.uniqueItems !== 'boolean') {
    schemaFailure('SCHEMA_INVALID_KEYWORD_VALUE', path + '/uniqueItems');
  }

  for (const key of ['minItems', 'maxItems', 'minLength', 'maxLength']) {
    if (hasOwn(schema, key)) validateNonNegativeInteger(schema[key], path + '/' + key);
  }
  for (const key of ['minimum', 'maximum']) {
    if (hasOwn(schema, key)) validateFiniteNumber(schema[key], path + '/' + key);
  }

  if (hasOwn(schema, 'pattern')) {
    if (typeof schema.pattern !== 'string') {
      schemaFailure('SCHEMA_INVALID_KEYWORD_VALUE', path + '/pattern');
    }
    try {
      new RegExp(schema.pattern, 'u');
    } catch {
      schemaFailure('SCHEMA_INVALID_KEYWORD_VALUE', path + '/pattern');
    }
  }

  if (hasOwn(schema, 'properties')) {
    if (!isRecord(schema.properties)) {
      schemaFailure('SCHEMA_INVALID_KEYWORD_VALUE', path + '/properties');
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      walkSchemaDefinition(child, path + '/properties/' + key);
    }
  }

  if (hasOwn(schema, 'items')) {
    walkSchemaDefinition(schema.items, path + '/items');
  }

  if (hasOwn(schema, 'additionalProperties')) {
    const additional = schema.additionalProperties;
    if (typeof additional === 'boolean') {
      // admitted as-is
    } else if (isRecord(additional)) {
      walkSchemaDefinition(additional, path + '/additionalProperties');
    } else {
      schemaFailure('SCHEMA_INVALID_KEYWORD_VALUE', path + '/additionalProperties');
    }
  }
}

export function assertSupportedSchema(schema, path = '$') {
  walkSchemaDefinition(schema, path);
}

function matchesType(value, type) {
  switch (type) {
    case 'object': return isRecord(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return false;
  }
}

function pointerSegment(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function declaredTypes(schema) {
  if (!hasOwn(schema, 'type')) return null;
  return Array.isArray(schema.type) ? schema.type : [schema.type];
}

export function validateSchema(value, schema) {
  assertSupportedSchema(schema);

  const errors = [];
  const add = (path, keyword, message) => {
    if (errors.length >= 100) return;
    errors.push({
      code: 'SCHEMA_' + keyword.toUpperCase(),
      path,
      message,
    });
  };

  function visit(current, currentSchema, path) {
    const types = declaredTypes(currentSchema);
    if (types && !types.some(type => matchesType(current, type))) {
      add(path, 'type', 'Expected ' + JSON.stringify(currentSchema.type));
      return;
    }

    if (hasOwn(currentSchema, 'const') && stableJson(current) !== stableJson(currentSchema.const)) {
      add(path, 'const', 'Value does not match the contract');
    }

    if (
      hasOwn(currentSchema, 'enum')
      && !currentSchema.enum.some(candidate => stableJson(current) === stableJson(candidate))
    ) {
      add(path, 'enum', 'Value is not in the declared enumeration');
    }

    if (typeof current === 'string') {
      const length = [...current].length;
      if (hasOwn(currentSchema, 'minLength') && length < currentSchema.minLength) {
        add(path, 'minLength', 'String is too short');
      }
      if (hasOwn(currentSchema, 'maxLength') && length > currentSchema.maxLength) {
        add(path, 'maxLength', 'String is too long');
      }
      if (hasOwn(currentSchema, 'pattern') && !new RegExp(currentSchema.pattern, 'u').test(current)) {
        add(path, 'pattern', 'String does not match the declared pattern');
      }
    }

    if (typeof current === 'number') {
      if (!Number.isFinite(current)) add(path, 'type', 'Finite numbers only');
      if (hasOwn(currentSchema, 'minimum') && current < currentSchema.minimum) {
        add(path, 'minimum', 'Number is below minimum');
      }
      if (hasOwn(currentSchema, 'maximum') && current > currentSchema.maximum) {
        add(path, 'maximum', 'Number is above maximum');
      }
    }

    if (isRecord(current)) {
      for (const key of currentSchema.required ?? []) {
        if (!hasOwn(current, key)) {
          add(path + '/' + pointerSegment(key), 'required', 'Required field is missing');
        }
      }

      const properties = currentSchema.properties ?? {};
      for (const [key, child] of Object.entries(current)) {
        const childPath = path + '/' + pointerSegment(key);
        if (hasOwn(properties, key)) {
          visit(child, properties[key], childPath);
        } else if (currentSchema.additionalProperties === false) {
          add(childPath, 'additionalProperties', 'Unknown field');
        } else if (isRecord(currentSchema.additionalProperties)) {
          visit(child, currentSchema.additionalProperties, childPath);
        }
      }
    }

    if (Array.isArray(current)) {
      if (hasOwn(currentSchema, 'minItems') && current.length < currentSchema.minItems) {
        add(path, 'minItems', 'Array has too few entries');
      }
      if (hasOwn(currentSchema, 'maxItems') && current.length > currentSchema.maxItems) {
        add(path, 'maxItems', 'Array has too many entries');
      }
      if (
        currentSchema.uniqueItems === true
        && new Set(current.map(stableJson)).size !== current.length
      ) {
        add(path, 'uniqueItems', 'Duplicate entries');
      }
      if (hasOwn(currentSchema, 'items')) {
        current.forEach((item, index) => visit(item, currentSchema.items, path + '/' + index));
      }
    }
  }

  visit(value, schema, '');
  return { valid: errors.length === 0, errors };
}
