/**
 * SchemaValidator — Pure, deterministic, headless-safe validator for
 * command parameters against JSON Schema-compatible CommandParamSchema.
 */

import type { CommandParamSchema, ValidationError, ValidationResult } from './types';

export class SchemaValidator {
  /**
   * Validates an arbitrary value against a CommandParamSchema.
   * Returns a ValidationResult with path-accurate errors.
   */
  static validate(value: unknown, schema: CommandParamSchema, basePath = ''): ValidationResult {
    const errors: ValidationError[] = [];
    this.validateNode(value, schema, basePath, errors);
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private static validateNode(
    value: unknown,
    schema: CommandParamSchema,
    path: string,
    errors: ValidationError[]
  ): void {
    if (value === undefined) {
      if (schema.required) {
        errors.push({
          path: path || 'value',
          message: `Required value is missing at '${path || 'root'}'.`,
          code: 'missing_required',
        });
      }
      return;
    }

    // oneOf / anyOf handling
    if (schema.oneOf && schema.oneOf.length > 0) {
      let matchCount = 0;
      const branchErrors: ValidationError[][] = [];
      for (const branch of schema.oneOf) {
        const subErrors: ValidationError[] = [];
        this.validateNode(value, branch, path, subErrors);
        if (subErrors.length === 0) {
          matchCount++;
        } else {
          branchErrors.push(subErrors);
        }
      }
      if (matchCount !== 1) {
        errors.push({
          path: path || 'value',
          message: `Value at '${path || 'root'}' must match exactly one schema in oneOf (matched ${matchCount}).`,
          code: 'union_mismatch',
          actual: value,
        });
      }
      return;
    }

    if (schema.anyOf && schema.anyOf.length > 0) {
      let anyMatch = false;
      for (const branch of schema.anyOf) {
        const subErrors: ValidationError[] = [];
        this.validateNode(value, branch, path, subErrors);
        if (subErrors.length === 0) {
          anyMatch = true;
          break;
        }
      }
      if (!anyMatch) {
        errors.push({
          path: path || 'value',
          message: `Value at '${path || 'root'}' does not match any schema in anyOf.`,
          code: 'union_mismatch',
          actual: value,
        });
      }
      return;
    }

    // Enum validation
    if (schema.enum && schema.enum.length > 0) {
      if (!schema.enum.includes(value as string | number | boolean)) {
        errors.push({
          path: path || 'value',
          message: `Value '${String(value)}' at '${path || 'root'}' is not a valid enum member. Expected one of: ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}.`,
          code: 'invalid_enum',
          expected: schema.enum,
          actual: value,
        });
        return;
      }
    }

    // Type validation
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      const matched = types.some((t) => this.matchesPrimitiveType(value, t));
      if (!matched && !types.includes('any')) {
        errors.push({
          path: path || 'value',
          message: `Expected type '${types.join(' | ')}' at '${path || 'root'}', received '${this.describeType(value)}'.`,
          code: 'type_mismatch',
          expected: types,
          actual: this.describeType(value),
        });
        return;
      }
    }

    // Number / Integer range validation
    if (typeof value === 'number') {
      if (Number.isNaN(value) || !Number.isFinite(value)) {
        errors.push({
          path: path || 'value',
          message: `Numeric value at '${path || 'root'}' must be a finite number.`,
          code: 'out_of_bounds',
          actual: value,
        });
        return;
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          path: path || 'value',
          message: `Value ${value} at '${path || 'root'}' is less than minimum ${schema.minimum}.`,
          code: 'out_of_bounds',
          expected: `>= ${schema.minimum}`,
          actual: value,
        });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          path: path || 'value',
          message: `Value ${value} at '${path || 'root'}' exceeds maximum ${schema.maximum}.`,
          code: 'out_of_bounds',
          expected: `<= ${schema.maximum}`,
          actual: value,
        });
      }
    }

    // Array / Tuple validation
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push({
          path: path || 'value',
          message: `Array at '${path || 'root'}' has ${value.length} item(s), minimum required is ${schema.minItems}.`,
          code: 'invalid_length',
          expected: `>= ${schema.minItems}`,
          actual: value.length,
        });
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push({
          path: path || 'value',
          message: `Array at '${path || 'root'}' has ${value.length} item(s), maximum allowed is ${schema.maxItems}.`,
          code: 'invalid_length',
          expected: `<= ${schema.maxItems}`,
          actual: value.length,
        });
      }
      if (schema.items) {
        if (Array.isArray(schema.items)) {
          // Tuple schema
          schema.items.forEach((itemSchema, index) => {
            const itemPath = path ? `${path}[${index}]` : `[${index}]`;
            if (index < value.length) {
              this.validateNode(value[index], itemSchema, itemPath, errors);
            } else if (itemSchema.required) {
              errors.push({
                path: itemPath,
                message: `Missing required tuple element at index ${index}.`,
                code: 'missing_required',
              });
            }
          });
        } else {
          // Uniform array schema
          value.forEach((elem, index) => {
            const itemPath = path ? `${path}[${index}]` : `[${index}]`;
            this.validateNode(elem, schema.items as CommandParamSchema, itemPath, errors);
          });
        }
      }
    }

    // Object validation
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;

      const checkedRequired = new Set<string>();
      // Check required properties from requiredProperties list
      if (schema.requiredProperties) {
        for (const reqProp of schema.requiredProperties) {
          checkedRequired.add(reqProp);
          if (!Object.prototype.hasOwnProperty.call(obj, reqProp) || obj[reqProp] === undefined) {
            const propPath = path ? `${path}.${reqProp}` : reqProp;
            errors.push({
              path: propPath,
              message: `Missing required parameter '${reqProp}'.`,
              code: 'missing_required',
            });
          }
        }
      }

      // Check properties defined in schema
      if (schema.properties) {
        for (const [propKey, propSchema] of Object.entries(schema.properties)) {
          const propPath = path ? `${path}.${propKey}` : propKey;
          const propVal = obj[propKey];
          if (!checkedRequired.has(propKey) && propVal === undefined && propSchema.required) {
            errors.push({
              path: propPath,
              message: `Missing required parameter '${propKey}'.`,
              code: 'missing_required',
            });
          } else if (propVal !== undefined) {
            this.validateNode(propVal, propSchema, propPath, errors);
          }
        }
      }

      // Check additionalProperties policy
      if (schema.additionalProperties === false && schema.properties) {
        const allowedKeys = new Set(Object.keys(schema.properties));
        for (const key of Object.keys(obj)) {
          if (!allowedKeys.has(key)) {
            const propPath = path ? `${path}.${key}` : key;
            errors.push({
              path: propPath,
              message: `Unexpected property '${key}' is not allowed by schema.`,
              code: 'unknown_property',
              actual: key,
            });
          }
        }
      } else if (typeof schema.additionalProperties === 'object' && schema.additionalProperties !== null) {
        const allowedKeys = new Set(schema.properties ? Object.keys(schema.properties) : []);
        for (const [key, propVal] of Object.entries(obj)) {
          if (!allowedKeys.has(key)) {
            const propPath = path ? `${path}.${key}` : key;
            this.validateNode(propVal, schema.additionalProperties as CommandParamSchema, propPath, errors);
          }
        }
      }
    }
  }

  private static matchesPrimitiveType(value: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'null':
        return value === null;
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
      case 'tuple':
        return Array.isArray(value);
      case 'any':
        return true;
      default:
        return true;
    }
  }

  private static describeType(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return 'integer';
      return 'number';
    }
    return typeof value;
  }
}
