// Generated from schemas/*.schema.json; do not edit.
export default {
  "financial-policy": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://raw.githubusercontent.com/suirindo/agent-role-contracts/main/schemas/financial-policy.schema.json",
    "title": "Agent Role Contracts financial-policy preview",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "id",
      "task_type",
      "allowed_chain_ids",
      "allowed_senders",
      "allowed_recipients",
      "allowed_spenders",
      "asset_limits",
      "human_approver",
      "max_evidence_age_seconds"
    ],
    "properties": {
      "schema_version": {
        "type": "string",
        "const": "0.2"
      },
      "id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$",
        "minLength": 1,
        "maxLength": 96
      },
      "task_type": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$",
        "minLength": 1,
        "maxLength": 96
      },
      "allowed_chain_ids": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$",
          "maxLength": 78
        },
        "minItems": 1,
        "maxItems": 256,
        "uniqueItems": true
      },
      "allowed_senders": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^0x[0-9a-fA-F]{40}$"
        },
        "minItems": 1,
        "maxItems": 256,
        "uniqueItems": true
      },
      "allowed_recipients": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^0x[0-9a-fA-F]{40}$"
        },
        "minItems": 0,
        "maxItems": 256,
        "uniqueItems": true
      },
      "allowed_spenders": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^0x[0-9a-fA-F]{40}$"
        },
        "minItems": 0,
        "maxItems": 256,
        "uniqueItems": true
      },
      "asset_limits": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "chain_id",
            "asset",
            "max_transfer_base_units",
            "max_approval_base_units",
            "max_fee_base_units"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "pattern": "^[1-9][0-9]*$",
              "maxLength": 78
            },
            "asset": {
              "type": "string",
              "pattern": "^(native|0x[0-9a-fA-F]{40})$"
            },
            "max_transfer_base_units": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]*)$",
              "maxLength": 78
            },
            "max_approval_base_units": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]*)$",
              "maxLength": 78
            },
            "max_fee_base_units": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]*)$",
              "maxLength": 78
            }
          }
        },
        "minItems": 1,
        "maxItems": 256,
        "uniqueItems": true
      },
      "human_approver": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$",
        "minLength": 1,
        "maxLength": 96
      },
      "max_evidence_age_seconds": {
        "type": "integer",
        "minimum": 1,
        "maximum": 86400
      }
    }
  },
  "financial-intent": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://raw.githubusercontent.com/suirindo/agent-role-contracts/main/schemas/financial-intent.schema.json",
    "title": "Agent Role Contracts financial-intent preview",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "transaction",
      "simulation",
      "review",
      "human_approval"
    ],
    "properties": {
      "schema_version": {
        "type": "string",
        "const": "0.2"
      },
      "transaction": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "operation",
          "chain_id",
          "sender",
          "asset",
          "target",
          "amount_base_units",
          "max_fee_base_units",
          "nonce",
          "current_allowance_base_units"
        ],
        "properties": {
          "operation": {
            "type": "string",
            "enum": [
              "native_transfer",
              "erc20_transfer",
              "erc20_approve"
            ]
          },
          "chain_id": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$",
            "maxLength": 78
          },
          "sender": {
            "type": "string",
            "pattern": "^0x[0-9a-fA-F]{40}$"
          },
          "asset": {
            "type": "string",
            "pattern": "^(native|0x[0-9a-fA-F]{40})$"
          },
          "target": {
            "type": "string",
            "pattern": "^0x[0-9a-fA-F]{40}$"
          },
          "amount_base_units": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]*)$",
            "maxLength": 78
          },
          "max_fee_base_units": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]*)$",
            "maxLength": 78
          },
          "nonce": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]*)$",
            "maxLength": 78
          },
          "current_allowance_base_units": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^(0|[1-9][0-9]*)$",
            "maxLength": 78
          }
        }
      },
      "simulation": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "subject_digest",
          "status",
          "chain_id",
          "block_number",
          "observed_at",
          "return_value"
        ],
        "properties": {
          "subject_digest": {
            "type": "string",
            "pattern": "^sha256:[0-9a-f]{64}$"
          },
          "status": {
            "type": "string",
            "enum": [
              "success",
              "failure"
            ]
          },
          "chain_id": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$",
            "maxLength": 78
          },
          "block_number": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]*)$",
            "maxLength": 78
          },
          "observed_at": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z$"
          },
          "return_value": {
            "type": [
              "boolean",
              "null"
            ]
          }
        }
      },
      "review": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "subject_digest",
          "role_id",
          "decision",
          "reviewed_at"
        ],
        "properties": {
          "subject_digest": {
            "type": "string",
            "pattern": "^sha256:[0-9a-f]{64}$"
          },
          "role_id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9._-]*$",
            "minLength": 1,
            "maxLength": 96
          },
          "decision": {
            "type": "string",
            "enum": [
              "pass",
              "blocked"
            ]
          },
          "reviewed_at": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z$"
          }
        }
      },
      "human_approval": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "subject_digest",
          "role_id",
          "decision",
          "approved_at"
        ],
        "properties": {
          "subject_digest": {
            "type": "string",
            "pattern": "^sha256:[0-9a-f]{64}$"
          },
          "role_id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9._-]*$",
            "minLength": 1,
            "maxLength": 96
          },
          "decision": {
            "type": "string",
            "enum": [
              "approved",
              "denied"
            ]
          },
          "approved_at": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z$"
          }
        }
      }
    }
  },
  "financial-execution": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://raw.githubusercontent.com/suirindo/agent-role-contracts/main/schemas/financial-execution.schema.json",
    "title": "Agent Role Contracts financial-execution preview",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "subject_digest",
      "chain_id",
      "transaction_hash",
      "nonce",
      "block_number",
      "status",
      "executed_at",
      "observed_at"
    ],
    "properties": {
      "schema_version": {
        "type": "string",
        "const": "0.2"
      },
      "subject_digest": {
        "type": "string",
        "pattern": "^sha256:[0-9a-f]{64}$"
      },
      "chain_id": {
        "type": "string",
        "pattern": "^[1-9][0-9]*$",
        "maxLength": 78
      },
      "transaction_hash": {
        "type": "string",
        "pattern": "^0x[0-9a-fA-F]{64}$"
      },
      "nonce": {
        "type": "string",
        "pattern": "^(0|[1-9][0-9]*)$",
        "maxLength": 78
      },
      "block_number": {
        "type": "string",
        "pattern": "^(0|[1-9][0-9]*)$",
        "maxLength": 78
      },
      "status": {
        "type": "string",
        "enum": [
          "success",
          "reverted"
        ]
      },
      "executed_at": {
        "type": "string",
        "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z$"
      },
      "observed_at": {
        "type": "string",
        "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z$"
      }
    }
  },
  "safe-proposal": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://raw.githubusercontent.com/suirindo/agent-role-contracts/main/schemas/safe-proposal.schema.json",
    "title": "Agent Role Contracts Safe single CALL envelope declaration preview",
    "description": "Offline matching of subject, chain, Safe address, nonce and supported CALL fields only; no canonical Safe serialization, transaction hash or authentication assurance.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "subject_digest",
      "chain_id",
      "safe_address",
      "safe_nonce",
      "transaction"
    ],
    "properties": {
      "schema_version": {
        "type": "string",
        "const": "0.2"
      },
      "subject_digest": {
        "type": "string",
        "pattern": "^sha256:[0-9a-f]{64}$"
      },
      "chain_id": {
        "type": "string",
        "pattern": "^[1-9][0-9]*$",
        "maxLength": 78
      },
      "safe_address": {
        "type": "string",
        "pattern": "^0x[0-9a-fA-F]{40}$"
      },
      "safe_nonce": {
        "type": "string",
        "pattern": "^(0|[1-9][0-9]*)$",
        "maxLength": 78
      },
      "transaction": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "to",
          "value",
          "data",
          "operation"
        ],
        "properties": {
          "to": {
            "type": "string",
            "pattern": "^0x[0-9a-fA-F]{40}$"
          },
          "value": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]*)$",
            "maxLength": 78
          },
          "data": {
            "type": "string",
            "pattern": "^0x([0-9a-f]{2})*$",
            "maxLength": 138
          },
          "operation": {
            "type": "integer",
            "const": 0
          }
        }
      }
    }
  }
};
