import { describe, it, expect } from 'vitest';
import { createFormatter, TextFormatter, JsonFormatter, YamlFormatter } from '../../../src/output/index.js';
import type { OutputFormat, Formatter } from '../../../src/output/formatter.js';

describe('createFormatter', () => {
  it('creates TextFormatter for text format', () => {
    const formatter = createFormatter('text');

    expect(formatter).toBeInstanceOf(TextFormatter);
  });

  it('creates JsonFormatter for json format', () => {
    const formatter = createFormatter('json');

    expect(formatter).toBeInstanceOf(JsonFormatter);
  });

  it('creates YamlFormatter for yaml format', () => {
    const formatter = createFormatter('yaml');

    expect(formatter).toBeInstanceOf(YamlFormatter);
  });

  it('throws on invalid format', () => {
    expect(() => createFormatter('invalid' as OutputFormat)).toThrow(
      'Unknown output format: invalid'
    );
  });

  it('returns a Formatter interface', () => {
    const formatter = createFormatter('text');

    expect(formatter.format).toBeDefined();
    expect(formatter.formatError).toBeDefined();
    expect(typeof formatter.format).toBe('function');
    expect(typeof formatter.formatError).toBe('function');
  });
});

describe('module exports', () => {
  it('exports all formatters', () => {
    expect(TextFormatter).toBeDefined();
    expect(JsonFormatter).toBeDefined();
    expect(YamlFormatter).toBeDefined();
  });

  it('exports createFormatter factory', () => {
    expect(createFormatter).toBeDefined();
    expect(typeof createFormatter).toBe('function');
  });
});
