import { describe, it, expect } from 'vitest';
import { ConfigSchema, type Config } from '../../../src/config/schema.js';

describe('ConfigSchema', () => {
  describe('validation', () => {
    it('validates a complete valid config', () => {
      const config = {
        provider: 'anthropic',
        model: 'claude-3-opus',
        budget: {
          maxCost: 10.0,
          maxIterations: 50,
          maxDepth: 3,
          maxTime: 600000,
        },
        repl: {
          backend: 'native',
          timeout: 60000,
        },
        output: {
          format: 'json',
        },
      };

      const result = ConfigSchema.parse(config);
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-3-opus');
      expect(result.budget.maxCost).toBe(10.0);
    });

    it('rejects invalid provider', () => {
      const config = {
        provider: 'invalid-provider',
      };

      expect(() => ConfigSchema.parse(config)).toThrow();
    });

    it('rejects negative budget values', () => {
      const config = {
        budget: {
          maxCost: -5.0,
        },
      };

      expect(() => ConfigSchema.parse(config)).toThrow();
    });

    it('rejects invalid backend', () => {
      const config = {
        repl: {
          backend: 'invalid-backend',
        },
      };

      expect(() => ConfigSchema.parse(config)).toThrow();
    });

    it('rejects invalid output format', () => {
      const config = {
        output: {
          format: 'invalid-format',
        },
      };

      expect(() => ConfigSchema.parse(config)).toThrow();
    });
  });

  describe('defaults', () => {
    it('applies default values for empty config', () => {
      const result = ConfigSchema.parse({});

      expect(result.provider).toBe('ollama');
      expect(result.model).toBe('llama3.2');
      expect(result.budget.maxCost).toBe(5.0);
      expect(result.budget.maxIterations).toBe(30);
      expect(result.budget.maxDepth).toBe(2);
      expect(result.budget.maxTime).toBe(300000);
      expect(result.repl.backend).toBe('auto');
      expect(result.repl.timeout).toBe(30000);
      expect(result.output.format).toBe('text');
    });

    it('applies defaults for partial config', () => {
      const config = {
        provider: 'anthropic',
        budget: {
          maxCost: 20.0,
        },
      };

      const result = ConfigSchema.parse(config);

      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('llama3.2'); // default
      expect(result.budget.maxCost).toBe(20.0);
      expect(result.budget.maxIterations).toBe(30); // default
    });

    it('preserves explicit values over defaults', () => {
      const config = {
        provider: 'openai',
        model: 'gpt-4',
        budget: {
          maxCost: 100.0,
          maxIterations: 100,
          maxDepth: 5,
          maxTime: 900000,
        },
        repl: {
          backend: 'daemon',
          timeout: 120000,
        },
        output: {
          format: 'yaml',
        },
      };

      const result = ConfigSchema.parse(config);

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4');
      expect(result.budget.maxCost).toBe(100.0);
      expect(result.budget.maxIterations).toBe(100);
      expect(result.budget.maxDepth).toBe(5);
      expect(result.budget.maxTime).toBe(900000);
      expect(result.repl.backend).toBe('daemon');
      expect(result.repl.timeout).toBe(120000);
      expect(result.output.format).toBe('yaml');
    });
  });

  describe('type inference', () => {
    it('produces correct Config type', () => {
      const config: Config = ConfigSchema.parse({});

      // Type checks - these would fail at compile time if types are wrong
      const provider: 'anthropic' | 'openai' | 'ollama' | 'claude-code' = config.provider;
      const maxCost: number = config.budget.maxCost;
      const format: 'text' | 'json' | 'yaml' = config.output.format;

      expect(provider).toBeDefined();
      expect(maxCost).toBeDefined();
      expect(format).toBeDefined();
    });
  });

  describe('subcallProvider', () => {
    it('accepts optional subcallProvider for mixed provider setups', () => {
      const config = {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        subcallProvider: 'ollama',
        subcallModel: 'qwen2.5-coder:14b',
      };

      const result = ConfigSchema.parse(config);
      expect(result.subcallProvider).toBe('ollama');
      expect(result.subcallModel).toBe('qwen2.5-coder:14b');
    });

    it('defaults subcallProvider to undefined (uses main provider)', () => {
      const result = ConfigSchema.parse({});
      expect(result.subcallProvider).toBeUndefined();
    });
  });

  describe('profiles', () => {
    it('accepts profiles object with named configurations', () => {
      const config = {
        profiles: {
          local: {
            provider: 'ollama',
            model: 'qwen2.5-coder:14b',
          },
          cloud: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
          },
        },
        default: 'local',
      };

      const result = ConfigSchema.parse(config);
      expect(result.profiles).toBeDefined();
      expect(result.profiles?.local?.provider).toBe('ollama');
      expect(result.profiles?.cloud?.provider).toBe('anthropic');
      expect(result.default).toBe('local');
    });

    it('supports extends for profile inheritance', () => {
      const config = {
        profiles: {
          base: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            budget: { maxCost: 10.0, maxIterations: 50 },
          },
          research: {
            extends: 'base',
            model: 'claude-opus-4-5',
            budget: { maxCost: 50.0 },
          },
        },
      };

      const result = ConfigSchema.parse(config);
      expect(result.profiles?.research?.extends).toBe('base');
    });

    it('maintains backward compatibility with flat config', () => {
      const flatConfig = {
        provider: 'ollama',
        model: 'llama3.2',
        budget: { maxCost: 5.0 },
      };

      const result = ConfigSchema.parse(flatConfig);
      expect(result.provider).toBe('ollama');
      expect(result.profiles).toBeUndefined();
    });

    it('validates subcallProvider in profiles', () => {
      const config = {
        profiles: {
          hybrid: {
            provider: 'anthropic',
            model: 'claude-opus-4-5',
            subcallProvider: 'ollama',
            subcallModel: 'qwen2.5-coder:14b',
          },
        },
      };

      const result = ConfigSchema.parse(config);
      expect(result.profiles?.hybrid?.subcallProvider).toBe('ollama');
    });
  });
});
