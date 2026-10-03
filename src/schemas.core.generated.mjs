// Generated from schemas/*.schema.json; do not edit.
export default {
  "role-contract": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://raw.githubusercontent.com/suirindo/agent-role-contracts/v0.1.0/schemas/role-contract.schema.json",
    "title": "Agent Role Contracts role contract",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "version",
      "scope",
      "status",
      "aliases",
      "mission",
      "contract",
      "authority",
      "knowledge",
      "reasoning"
    ],
    "properties": {
      "id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9-]*$",
        "maxLength": 96
      },
      "version": {
        "type": "integer",
        "minimum": 1
      },
      "scope": {
        "type": "string",
        "enum": [
          "company",
          "domain",
          "repository"
        ]
      },
      "status": {
        "type": "string",
        "enum": [
          "active",
          "dormant",
          "deprecated",
          "archived"
        ]
      },
      "aliases": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9._-]*$",
          "minLength": 1,
          "maxLength": 96
        },
        "minItems": 0,
        "maxItems": 256,
        "uniqueItems": true
      },
      "replacement": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$",
        "minLength": 1,
        "maxLength": 96
      },
      "remove_after": {
        "type": "string",
        "minLength": 1,
        "pattern": "\\S"
      },
      "mission": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "responsibilities",
          "out_of_scope",
          "success_criteria",
          "objective"
        ],
        "properties": {
          "responsibilities": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "minItems": 1,
            "maxItems": 256,
            "uniqueItems": true
          },
          "out_of_scope": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "minItems": 1,
            "maxItems": 256,
            "uniqueItems": true
          },
          "success_criteria": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "minItems": 1,
            "maxItems": 256,
            "uniqueItems": true
          },
          "objective": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          }
        }
      },
      "contract": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "required_inputs",
          "optional_inputs",
          "outputs",
          "output_schema",
          "acceptance_criteria",
          "escalation_conditions"
        ],
        "properties": {
          "required_inputs": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          },
          "optional_inputs": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          },
          "outputs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "minItems": 1,
            "maxItems": 256,
            "uniqueItems": true
          },
          "output_schema": {
            "type": [
              "object",
              "null"
            ]
          },
          "acceptance_criteria": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "minItems": 1,
            "maxItems": 256,
            "uniqueItems": true
          },
          "escalation_conditions": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "minItems": 1,
            "maxItems": 256,
            "uniqueItems": true
          },
          "conditional_required_inputs": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "when",
                "required_inputs"
              ],
              "properties": {
                "when": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "input",
                    "equals"
                  ],
                  "properties": {
                    "input": {
                      "type": "string",
                      "pattern": "^[a-z0-9][a-z0-9._-]*$",
                      "minLength": 1,
                      "maxLength": 96
                    },
                    "equals": {
                      "type": [
                        "string",
                        "number",
                        "boolean"
                      ]
                    }
                  }
                },
                "required_inputs": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "pattern": "^[a-z0-9][a-z0-9._-]*$",
                    "minLength": 1,
                    "maxLength": 96
                  },
                  "minItems": 1,
                  "maxItems": 256,
                  "uniqueItems": true
                }
              }
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          }
        }
      },
      "authority": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "authority_mode",
          "capabilities",
          "prohibited_capabilities",
          "allowed_write_scopes",
          "cannot",
          "may_delegate_to",
          "reports_to",
          "independence_requirements"
        ],
        "properties": {
          "authority_mode": {
            "type": "string",
            "enum": [
              "read_only",
              "write_scoped",
              "operator",
              "human_only"
            ]
          },
          "capabilities": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          },
          "prohibited_capabilities": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          },
          "allowed_write_scopes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          },
          "cannot": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          },
          "may_delegate_to": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          },
          "reports_to": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[a-z0-9][a-z0-9._-]*$"
          },
          "independence_requirements": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          }
        }
      },
      "knowledge": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "required_knowledge",
          "optional_knowledge",
          "repository_context",
          "data_classification",
          "retention_policy"
        ],
        "properties": {
          "required_knowledge": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          },
          "optional_knowledge": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          },
          "repository_context": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          },
          "data_classification": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "public",
                "internal",
                "confidential",
                "personal",
                "secret"
              ]
            },
            "minItems": 1,
            "maxItems": 256,
            "uniqueItems": true
          },
          "retention_policy": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          }
        }
      },
      "reasoning": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "reasoning_tier",
          "max_turn_class",
          "requires_independent_context"
        ],
        "properties": {
          "reasoning_tier": {
            "type": "string",
            "enum": [
              "routine",
              "standard",
              "advanced",
              "frontier"
            ]
          },
          "max_turn_class": {
            "type": "string",
            "enum": [
              "short",
              "normal",
              "extended"
            ]
          },
          "requires_independent_context": {
            "type": "boolean"
          }
        }
      }
    }
  },
  "bundle": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://raw.githubusercontent.com/suirindo/agent-role-contracts/v0.1.0/schemas/bundle.schema.json",
    "title": "Agent Role Contracts bundle",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "policy_version",
      "policy",
      "roles",
      "knowledge",
      "routes"
    ],
    "properties": {
      "schema_version": {
        "type": "string",
        "const": "0.1"
      },
      "policy_version": {
        "type": "string",
        "minLength": 1,
        "pattern": "\\S"
      },
      "policy": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "capabilities",
          "read_only_forbids"
        ],
        "properties": {
          "capabilities": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "minItems": 1,
            "maxItems": 256,
            "uniqueItems": true
          },
          "read_only_forbids": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "minItems": 0,
            "maxItems": 256,
            "uniqueItems": true
          }
        }
      },
      "roles": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "contract",
            "body"
          ],
          "properties": {
            "contract": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "version",
                "scope",
                "status",
                "aliases",
                "mission",
                "contract",
                "authority",
                "knowledge",
                "reasoning"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "pattern": "^[a-z0-9][a-z0-9-]*$",
                  "maxLength": 96
                },
                "version": {
                  "type": "integer",
                  "minimum": 1
                },
                "scope": {
                  "type": "string",
                  "enum": [
                    "company",
                    "domain",
                    "repository"
                  ]
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "active",
                    "dormant",
                    "deprecated",
                    "archived"
                  ]
                },
                "aliases": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "pattern": "^[a-z0-9][a-z0-9._-]*$",
                    "minLength": 1,
                    "maxLength": 96
                  },
                  "minItems": 0,
                  "maxItems": 256,
                  "uniqueItems": true
                },
                "replacement": {
                  "type": "string",
                  "pattern": "^[a-z0-9][a-z0-9._-]*$",
                  "minLength": 1,
                  "maxLength": 96
                },
                "remove_after": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "\\S"
                },
                "mission": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "responsibilities",
                    "out_of_scope",
                    "success_criteria",
                    "objective"
                  ],
                  "properties": {
                    "responsibilities": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "\\S"
                      },
                      "minItems": 1,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "out_of_scope": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "\\S"
                      },
                      "minItems": 1,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "success_criteria": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "\\S"
                      },
                      "minItems": 1,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "objective": {
                      "type": "string",
                      "minLength": 1,
                      "pattern": "\\S"
                    }
                  }
                },
                "contract": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "required_inputs",
                    "optional_inputs",
                    "outputs",
                    "output_schema",
                    "acceptance_criteria",
                    "escalation_conditions"
                  ],
                  "properties": {
                    "required_inputs": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "^[a-z0-9][a-z0-9._-]*$",
                        "minLength": 1,
                        "maxLength": 96
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "optional_inputs": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "^[a-z0-9][a-z0-9._-]*$",
                        "minLength": 1,
                        "maxLength": 96
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "outputs": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "\\S"
                      },
                      "minItems": 1,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "output_schema": {
                      "type": [
                        "object",
                        "null"
                      ]
                    },
                    "acceptance_criteria": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "\\S"
                      },
                      "minItems": 1,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "escalation_conditions": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "\\S"
                      },
                      "minItems": 1,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "conditional_required_inputs": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "when",
                          "required_inputs"
                        ],
                        "properties": {
                          "when": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                              "input",
                              "equals"
                            ],
                            "properties": {
                              "input": {
                                "type": "string",
                                "pattern": "^[a-z0-9][a-z0-9._-]*$",
                                "minLength": 1,
                                "maxLength": 96
                              },
                              "equals": {
                                "type": [
                                  "string",
                                  "number",
                                  "boolean"
                                ]
                              }
                            }
                          },
                          "required_inputs": {
                            "type": "array",
                            "items": {
                              "type": "string",
                              "pattern": "^[a-z0-9][a-z0-9._-]*$",
                              "minLength": 1,
                              "maxLength": 96
                            },
                            "minItems": 1,
                            "maxItems": 256,
                            "uniqueItems": true
                          }
                        }
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    }
                  }
                },
                "authority": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "authority_mode",
                    "capabilities",
                    "prohibited_capabilities",
                    "allowed_write_scopes",
                    "cannot",
                    "may_delegate_to",
                    "reports_to",
                    "independence_requirements"
                  ],
                  "properties": {
                    "authority_mode": {
                      "type": "string",
                      "enum": [
                        "read_only",
                        "write_scoped",
                        "operator",
                        "human_only"
                      ]
                    },
                    "capabilities": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "^[a-z0-9][a-z0-9._-]*$",
                        "minLength": 1,
                        "maxLength": 96
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "prohibited_capabilities": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "^[a-z0-9][a-z0-9._-]*$",
                        "minLength": 1,
                        "maxLength": 96
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "allowed_write_scopes": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "\\S"
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "cannot": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "\\S"
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "may_delegate_to": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "^[a-z0-9][a-z0-9._-]*$",
                        "minLength": 1,
                        "maxLength": 96
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "reports_to": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "pattern": "^[a-z0-9][a-z0-9._-]*$"
                    },
                    "independence_requirements": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "\\S"
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    }
                  }
                },
                "knowledge": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "required_knowledge",
                    "optional_knowledge",
                    "repository_context",
                    "data_classification",
                    "retention_policy"
                  ],
                  "properties": {
                    "required_knowledge": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "^[a-z0-9][a-z0-9._-]*$",
                        "minLength": 1,
                        "maxLength": 96
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "optional_knowledge": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "^[a-z0-9][a-z0-9._-]*$",
                        "minLength": 1,
                        "maxLength": 96
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "repository_context": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "\\S"
                      },
                      "minItems": 0,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "data_classification": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "enum": [
                          "public",
                          "internal",
                          "confidential",
                          "personal",
                          "secret"
                        ]
                      },
                      "minItems": 1,
                      "maxItems": 256,
                      "uniqueItems": true
                    },
                    "retention_policy": {
                      "type": "string",
                      "minLength": 1,
                      "pattern": "\\S"
                    }
                  }
                },
                "reasoning": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "reasoning_tier",
                    "max_turn_class",
                    "requires_independent_context"
                  ],
                  "properties": {
                    "reasoning_tier": {
                      "type": "string",
                      "enum": [
                        "routine",
                        "standard",
                        "advanced",
                        "frontier"
                      ]
                    },
                    "max_turn_class": {
                      "type": "string",
                      "enum": [
                        "short",
                        "normal",
                        "extended"
                      ]
                    },
                    "requires_independent_context": {
                      "type": "boolean"
                    }
                  }
                }
              }
            },
            "body": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            }
          }
        },
        "minItems": 1,
        "maxItems": 128
      },
      "knowledge": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "uri"
          ],
          "properties": {
            "id": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "uri": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            }
          }
        },
        "minItems": 0,
        "maxItems": 512
      },
      "routes": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "task_type",
            "accountable",
            "executors",
            "reviewers",
            "require_human_approval"
          ],
          "properties": {
            "task_type": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "accountable": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9._-]*$",
              "minLength": 1,
              "maxLength": 96
            },
            "executors": {
              "type": "array",
              "items": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9._-]*$",
                "minLength": 1,
                "maxLength": 96
              },
              "minItems": 1,
              "maxItems": 32,
              "uniqueItems": true
            },
            "reviewers": {
              "type": "array",
              "items": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9._-]*$",
                "minLength": 1,
                "maxLength": 96
              },
              "minItems": 1,
              "maxItems": 32,
              "uniqueItems": true
            },
            "require_human_approval": {
              "type": "boolean"
            }
          }
        },
        "minItems": 1,
        "maxItems": 128
      }
    }
  },
  "task": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://raw.githubusercontent.com/suirindo/agent-role-contracts/v0.1.0/schemas/task.schema.json",
    "title": "Agent Role Contracts task",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "id",
      "type",
      "objective",
      "inputs",
      "acceptance_criteria"
    ],
    "properties": {
      "schema_version": {
        "type": "string",
        "const": "0.1"
      },
      "id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$",
        "minLength": 1,
        "maxLength": 96
      },
      "type": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$",
        "minLength": 1,
        "maxLength": 96
      },
      "objective": {
        "type": "string",
        "minLength": 1,
        "pattern": "\\S"
      },
      "inputs": {
        "type": "object",
        "additionalProperties": {
          "type": [
            "string",
            "number",
            "boolean",
            "null"
          ]
        },
        "properties": {}
      },
      "acceptance_criteria": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1,
          "pattern": "\\S"
        },
        "minItems": 1,
        "maxItems": 256,
        "uniqueItems": true
      }
    }
  },
  "handoff": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://raw.githubusercontent.com/suirindo/agent-role-contracts/v0.1.0/schemas/handoff.schema.json",
    "title": "Agent Role Contracts handoff",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "task_id",
      "from_agent",
      "suggested_next_agent",
      "current_status",
      "objective",
      "completed",
      "evidence",
      "decisions",
      "risks",
      "unresolved",
      "required_next_action",
      "confidence"
    ],
    "properties": {
      "schema_version": {
        "type": "string",
        "const": "0.1"
      },
      "task_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$",
        "minLength": 1,
        "maxLength": 96
      },
      "from_agent": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$",
        "minLength": 1,
        "maxLength": 96
      },
      "suggested_next_agent": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$",
        "minLength": 1,
        "maxLength": 96
      },
      "current_status": {
        "type": "string",
        "enum": [
          "in_progress",
          "blocked",
          "ready_for_review",
          "complete"
        ]
      },
      "objective": {
        "type": "string",
        "minLength": 1,
        "pattern": "\\S"
      },
      "completed": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1,
          "pattern": "\\S"
        },
        "minItems": 0,
        "maxItems": 256,
        "uniqueItems": true
      },
      "evidence": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "result"
          ],
          "properties": {
            "file": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "command": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            },
            "result": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            }
          }
        },
        "minItems": 1,
        "maxItems": 128,
        "uniqueItems": true
      },
      "decisions": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1,
          "pattern": "\\S"
        },
        "minItems": 0,
        "maxItems": 256,
        "uniqueItems": true
      },
      "risks": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1,
          "pattern": "\\S"
        },
        "minItems": 0,
        "maxItems": 256,
        "uniqueItems": true
      },
      "unresolved": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1,
          "pattern": "\\S"
        },
        "minItems": 0,
        "maxItems": 256,
        "uniqueItems": true
      },
      "required_next_action": {
        "type": "string",
        "minLength": 1,
        "pattern": "\\S"
      },
      "confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "extensions": {
        "type": "object",
        "additionalProperties": true,
        "properties": {}
      }
    }
  },
  "task-action": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://raw.githubusercontent.com/suirindo/agent-role-contracts/v0.3.0-alpha.1/schemas/task-action.schema.json",
    "title": "Agent Role Contracts task-action",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "id",
      "kind",
      "parameters"
    ],
    "properties": {
      "schema_version": {
        "type": "string",
        "const": "0.3"
      },
      "id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$",
        "minLength": 1,
        "maxLength": 96
      },
      "kind": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$",
        "minLength": 1,
        "maxLength": 96
      },
      "parameters": {
        "type": "object",
        "additionalProperties": {
          "type": [
            "string",
            "number",
            "boolean",
            "null"
          ]
        },
        "properties": {}
      }
    }
  },
  "task-action-binding": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://raw.githubusercontent.com/suirindo/agent-role-contracts/v0.3.0-alpha.1/schemas/task-action-binding.schema.json",
    "title": "Agent Role Contracts task-action-binding",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "subject_digest",
      "reviews"
    ],
    "properties": {
      "schema_version": {
        "type": "string",
        "const": "0.3"
      },
      "subject_digest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "reviews": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "subject_digest",
            "role_id",
            "decision"
          ],
          "properties": {
            "subject_digest": {
              "type": "string",
              "pattern": "^sha256:[a-f0-9]{64}$"
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
            }
          }
        }
      },
      "human_approval": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "subject_digest",
          "role_id",
          "decision"
        ],
        "properties": {
          "subject_digest": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
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
          }
        }
      }
    }
  }
};
