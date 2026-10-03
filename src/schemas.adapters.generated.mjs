// Generated from schemas/*.schema.json; do not edit.
export default {
  "filesystem-write-mapping": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://raw.githubusercontent.com/suirindo/agent-role-contracts/v0.4.0-alpha.1/schemas/filesystem-write-mapping.schema.json",
    "title": "Agent Role Contracts filesystem-write-mapping",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "subject_digest",
      "operation",
      "path",
      "content_sha256"
    ],
    "properties": {
      "schema_version": {
        "type": "string",
        "const": "0.1"
      },
      "subject_digest": {
        "type": "string",
        "pattern": "^sha256:[0-9a-f]{64}$",
        "minLength": 71,
        "maxLength": 71
      },
      "operation": {
        "type": "string",
        "const": "write_file"
      },
      "path": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$(?![\\s\\S])"
      },
      "content_sha256": {
        "type": "string",
        "pattern": "^sha256:[0-9a-f]{64}$",
        "minLength": 71,
        "maxLength": 71
      }
    }
  }
};
