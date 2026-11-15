/**
 * Lightweight Runtime JSON Schema Validator
 * Validates task definitions, agent handoffs, evidence records, and release decisions
 * against formal JSON Schemas without external runtime dependencies.
 */

const fs = require('fs');
const path = require('path');

class SchemaValidator {
  constructor(schemasDir = null) {
    this.schemasDir = schemasDir || path.resolve(__dirname, '..', 'contracts');
    this.schemas = new Map();
    this.loadSchemas();
  }

  loadSchemas() {
    if (!fs.existsSync(this.schemasDir)) return;
    const files = fs.readdirSync(this.schemasDir).filter(f => f.endsWith('_schema.json'));
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(this.schemasDir, f), 'utf8');
        const schema = JSON.parse(raw);
        this.schemas.set(f, schema);
        // Also index by title
        if (schema.title) {
          this.schemas.set(schema.title, schema);
        }
      } catch (e) {
        // Continue loading remaining schemas
      }
    }
  }

  getSchema(schemaIdOrName) {
    return this.schemas.get(schemaIdOrName) || null;
  }

  /**
   * Validates an object against a schema definition
   */
  validate(data, schemaOrName) {
    const schema = typeof schemaOrName === 'string' ? this.getSchema(schemaOrName) : schemaOrName;
    if (!schema) {
      return { valid: false, errors: [`Schema '${schemaOrName}' not found in registry.`] };
    }

    const errors = [];
    this._validateNode(data, schema, '', errors, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  _validateNode(data, schema, currentPath, errors, rootSchema = null) {
    if (!schema) return;
    const root = rootSchema || schema;

    // $ref resolution (internal "#/$defs/..." or "#/definitions/..." or schema title)
    if (schema.$ref) {
      const refTarget = this._resolveRef(schema.$ref, root);
      if (refTarget) {
        return this._validateNode(data, refTarget, currentPath, errors, root);
      } else {
        errors.push(`At '${currentPath || 'root'}': could not resolve $ref '${schema.$ref}'`);
        return;
      }
    }

    // const check
    if (schema.const !== undefined) {
      if (data !== schema.const) {
        errors.push(`At '${currentPath || 'root'}': expected const value '${schema.const}', got '${data}'`);
      }
    }

    // Type check
    if (schema.type) {
      const actualType = this._getType(data);
      if (Array.isArray(schema.type)) {
        if (!schema.type.includes(actualType)) {
          errors.push(`At '${currentPath || 'root'}': expected type ${schema.type.join('|')}, got ${actualType}`);
          return;
        }
      } else if (actualType !== schema.type) {
        errors.push(`At '${currentPath || 'root'}': expected type '${schema.type}', got '${actualType}'`);
        return;
      }
    }

    // oneOf validation: exactly one sub-schema must match
    if (Array.isArray(schema.oneOf)) {
      let matches = 0;
      for (const sub of schema.oneOf) {
        const subErrors = [];
        this._validateNode(data, sub, currentPath, subErrors, root);
        if (subErrors.length === 0) matches++;
      }
      if (matches !== 1) {
        errors.push(`At '${currentPath || 'root'}': oneOf validation failed. Matched ${matches} schemas (expected exactly 1).`);
      }
    }

    // anyOf validation: at least one sub-schema must match
    if (Array.isArray(schema.anyOf)) {
      let matched = false;
      for (const sub of schema.anyOf) {
        const subErrors = [];
        this._validateNode(data, sub, currentPath, subErrors, root);
        if (subErrors.length === 0) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        errors.push(`At '${currentPath || 'root'}': anyOf validation failed. No sub-schemas matched.`);
      }
    }

    // allOf validation: all sub-schemas must match
    if (Array.isArray(schema.allOf)) {
      for (const sub of schema.allOf) {
        this._validateNode(data, sub, currentPath, errors, root);
      }
    }

    // Required fields check for objects
    if (schema.required && typeof data === 'object' && data !== null) {
      for (const req of schema.required) {
        if (data[req] === undefined) {
          errors.push(`At '${currentPath || 'root'}': missing required property '${req}'`);
        }
      }
    }

    // Enum check
    if (schema.enum && !schema.enum.includes(data)) {
      errors.push(`At '${currentPath || 'root'}': value '${data}' is not in allowed enum [${schema.enum.join(', ')}]`);
    }

    // Pattern check
    if (schema.pattern && typeof data === 'string') {
      const reg = new RegExp(schema.pattern);
      if (!reg.test(data)) {
        errors.push(`At '${currentPath || 'root'}': string does not match required pattern ${schema.pattern}`);
      }
    }

    // Format check (RFC 3339 / ISO 8601 date-time, uuid, email, uri)
    if (schema.format && typeof data === 'string') {
      if (schema.format === 'date-time') {
        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
        if (!isoRegex.test(data) || isNaN(Date.parse(data))) {
          errors.push(`At '${currentPath || 'root'}': string '${data}' is not a valid ISO 8601 date-time.`);
        }
      } else if (schema.format === 'uuid') {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(data)) {
          errors.push(`At '${currentPath || 'root'}': string '${data}' is not a valid UUID.`);
        }
      } else if (schema.format === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data)) {
          errors.push(`At '${currentPath || 'root'}': string '${data}' is not a valid email.`);
        }
      }
    }

    // Numeric range
    if (typeof data === 'number') {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`At '${currentPath || 'root'}': value ${data} is less than minimum ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push(`At '${currentPath || 'root'}': value ${data} exceeds maximum ${schema.maximum}`);
      }
    }

    // Object properties validation
    if (schema.properties && typeof data === 'object' && data !== null && !Array.isArray(data)) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (data[propName] !== undefined) {
          this._validateNode(data[propName], propSchema, currentPath ? `${currentPath}.${propName}` : propName, errors, root);
        }
      }

      // additionalProperties: false
      if (schema.additionalProperties === false) {
        const declared = new Set(Object.keys(schema.properties));
        for (const actualKey of Object.keys(data)) {
          if (!declared.has(actualKey)) {
            errors.push(`At '${currentPath || 'root'}': unauthorized additional property '${actualKey}'`);
          }
        }
      }
    }

    // Array items validation
    if (schema.items && Array.isArray(data)) {
      data.forEach((item, idx) => {
        this._validateNode(item, schema.items, `${currentPath}[${idx}]`, errors, root);
      });
    }
  }

  _resolveRef(ref, rootSchema) {
    if (ref.startsWith('#/')) {
      const parts = ref.slice(2).split('/');
      let curr = rootSchema;
      for (const p of parts) {
        if (curr && curr[p] !== undefined) {
          curr = curr[p];
        } else {
          return null;
        }
      }
      return curr;
    }
    return this.getSchema(ref);
  }

  _getType(val) {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  }
}

module.exports = { SchemaValidator };
