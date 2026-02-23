import { describe, it, expect } from 'vitest';
import { validateInferenceOptions } from '../../../src/engine/inference-validator.js';

describe('validateInferenceOptions', () => {
  describe('temperature=0 with sampling params', () => {
    it('should warn when temperature=0 with top_p', () => {
      const warnings = validateInferenceOptions({
        temperature: 0,
        top_p: 0.9,
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('temperature=0');
      expect(warnings[0]).toContain('top_p');
    });

    it('should warn when temperature=0 with top_k', () => {
      const warnings = validateInferenceOptions({
        temperature: 0,
        top_k: 40,
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('temperature=0');
      expect(warnings[0]).toContain('top_k');
    });

    it('should warn when temperature=0 with both top_p and top_k', () => {
      const warnings = validateInferenceOptions({
        temperature: 0,
        top_p: 0.9,
        top_k: 40,
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('top_p');
      expect(warnings[0]).toContain('top_k');
    });

    it('should not warn when temperature > 0 with sampling params', () => {
      const warnings = validateInferenceOptions({
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
      });
      expect(warnings).toHaveLength(0);
    });

    it('should not warn when temperature=0 without sampling params', () => {
      const warnings = validateInferenceOptions({
        temperature: 0,
      });
      expect(warnings).toHaveLength(0);
    });
  });

  describe('seed with high temperature', () => {
    it('should warn when seed set with temperature > 1.0', () => {
      const warnings = validateInferenceOptions({
        seed: 42,
        temperature: 1.5,
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('seed');
      expect(warnings[0]).toContain('temperature');
    });

    it('should not warn when seed set with temperature <= 1.0', () => {
      const warnings = validateInferenceOptions({
        seed: 42,
        temperature: 0.7,
      });
      expect(warnings).toHaveLength(0);
    });

    it('should not warn when seed set without temperature', () => {
      const warnings = validateInferenceOptions({
        seed: 42,
      });
      expect(warnings).toHaveLength(0);
    });
  });

  describe('Cohere p/k naming', () => {
    it('should warn when using top_p instead of p for Cohere-like options', () => {
      // Cohere uses p/k, not top_p/top_k
      // If user has both 'p' and 'top_p', they likely made a mistake
      const warnings = validateInferenceOptions({
        p: 0.9,
        top_p: 0.8,
      } as Record<string, unknown>);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('top_p');
      expect(warnings[0]).toContain('Cohere');
    });

    it('should warn when using top_k instead of k for Cohere-like options', () => {
      const warnings = validateInferenceOptions({
        k: 40,
        top_k: 50,
      } as Record<string, unknown>);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('top_k');
      expect(warnings[0]).toContain('Cohere');
    });

    it('should not warn when using only Cohere naming', () => {
      const warnings = validateInferenceOptions({
        p: 0.9,
        k: 40,
      } as Record<string, unknown>);
      expect(warnings).toHaveLength(0);
    });
  });

  describe('empty/undefined options', () => {
    it('should return empty array for undefined', () => {
      const warnings = validateInferenceOptions(undefined);
      expect(warnings).toHaveLength(0);
    });

    it('should return empty array for empty object', () => {
      const warnings = validateInferenceOptions({});
      expect(warnings).toHaveLength(0);
    });
  });
});
