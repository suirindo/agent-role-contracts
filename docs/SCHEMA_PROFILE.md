# Supported schema profile

Only the bundled, developer-controlled Draft-07 schemas are interpreted. This is not a public arbitrary-schema API or a general JSON Schema implementation.

Supported assertions: `type`, `required`, `properties`, `additionalProperties` (boolean or homogeneous value schema), `items` (single schema), `minItems`, `maxItems`, `uniqueItems`, `minLength`, `maxLength`, `pattern`, `enum`, `const`, `minimum`, `maximum`.

Recognized annotations: `$schema` (Draft-07 only), `$id`, `title`, `description`. No URI resolution is performed. `$ref`, combinators, tuple validation, format and other unsupported keywords are rejected rather than silently accepted. Boolean schemas are not supported by this subset.

Deep uniqueness and enum/const equality are independent of object-member order. Unicode string length counts code points. Numbers follow finite JavaScript Number semantics, and public JSON input also rejects unsafe integers. Patterns in bundled schemas are developer-controlled; callers cannot register arbitrary runtime regular expressions.

`output_schema` inside a role contract is inert instance data. Its content is not evaluated, and results explicitly report `output_schema_validated=false`. Evidence command strings, extensions and role body text are also inert declarations.

The four bundled schemas are definition-checked and their generated module is byte-identity checked. Repository tests exercise supported assertions and fail-closed cases. These checks do not claim complete Draft-07 conformance or exhaustive instance coverage.
