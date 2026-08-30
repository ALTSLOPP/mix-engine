import type { FeatureDescriptor } from './types';

/** Reject unsafe JSON before it can reach subsystem math or lifecycle hooks. */
export function validateFeatureConfig(descriptor: FeatureDescriptor<any>, config: unknown): asserts config is Record<string, unknown> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`${descriptor.id}: config must be an object`);
  const properties = new Map(descriptor.properties.map(p => [p.key, p]));
  const validateJson = (value: unknown, path: string, sample?: any, depth = 0): void => {
    if (depth > 40) throw new Error(`${path}: config nesting is too deep`);
    if (sample && typeof sample === 'object' && ['x', 'y', 'z'].every(k => k in sample)) {
      if (!value || typeof value !== 'object' || !['x', 'y', 'z'].every(k => typeof (value as any)[k] === 'number')) throw new Error(`${path} requires numeric x, y, z`);
    }
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path} must be finite`);
    if (value === undefined || typeof value === 'function') throw new Error(`${path} must be JSON data`);
    if (sample != null && (Array.isArray(sample) !== Array.isArray(value) || typeof sample !== typeof value || value === null)) throw new Error(`${path} has the wrong type`);
    if (Array.isArray(value)) value.forEach((v, i) => validateJson(v, `${path}[${i}]`, sample?.[0], depth + 1));
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`${path}.${key} is not allowed`);
      validateJson(child, `${path}.${key}`, sample?.[key], depth + 1);
    }
  };
  for (const [key, value] of Object.entries(config)) {
    const path = `${descriptor.id}.${key}`;
    const property = properties.get(key);
    if (!Object.hasOwn(descriptor.defaultConfig, key) && !property) throw new Error(`${path}: unknown configuration field`);
    validateJson(value, path, descriptor.defaultConfig[key] ?? property?.default);
    if (!property) continue;
    if (property.type === 'number' && typeof value !== 'number') throw new Error(`${path} must be a number`);
    if (property.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
    if (['string', 'color'].includes(property.type) && typeof value !== 'string') throw new Error(`${path} must be a string`);
    if (typeof value === 'number') {
      if (property.min !== undefined && value < property.min) throw new Error(`${path} must be >= ${property.min}`);
      if (property.max !== undefined && value > property.max) throw new Error(`${path} must be <= ${property.max}`);
      if (property.step === 1 && !Number.isInteger(value)) throw new Error(`${path} must be an integer`);
    }
    if (property.options && !property.options.some(o => o.value === value)) throw new Error(`${path} must be one of ${property.options.map(o => o.value).join(', ')}`);
  }
}
