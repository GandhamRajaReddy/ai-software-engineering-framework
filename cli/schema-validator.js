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
    this._validateNode(data, schema, '', errors);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  _validateNode(data, schema, currentPath, errors) {
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
          this._validateNode(data[propName], propSchema, currentPath ? `${currentPath}.${propName}` : propName, errors);
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
        this._validateNode(item, schema.items, `${currentPath}[${idx}]`, errors);
      });
    }
  }

  _getType(val) {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  }
}

module.exports = { SchemaValidator };
