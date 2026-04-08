/**
 * @fileoverview Tests for the shared serializeError utility.
 *
 * Ensures the extracted serializeError function works correctly
 * and is shared between JSON and YAML formatters.
 */

import { describe, it, expect } from 'vitest';
import { serializeError } from '../../../src/output/serialize-error.js';

describe('serializeError', () => {
  it('extracts name, message, and stack from Error', () => {
    const error = new Error('test message');
    const result = serializeError(error);

    expect(result.name).toBe('Error');
    expect(result.message).toBe('test message');
    expect(result.stack).toBeDefined();
    expect(typeof result.stack).toBe('string');
  });

  it('preserves custom error names', () => {
    const error = new TypeError('type mismatch');
    const result = serializeError(error);

    expect(result.name).toBe('TypeError');
    expect(result.message).toBe('type mismatch');
  });

  it('returns a plain object (not an Error instance)', () => {
    const error = new Error('test');
    const result = serializeError(error);

    expect(result).not.toBeInstanceOf(Error);
    expect(typeof result).toBe('object');
  });

  it('result is JSON-serializable', () => {
    const error = new Error('test');
    const result = serializeError(error);

    expect(() => JSON.stringify(result)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(result));
    expect(parsed.name).toBe('Error');
    expect(parsed.message).toBe('test');
  });
});
