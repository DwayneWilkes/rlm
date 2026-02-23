import { describe, it, expect } from 'vitest';
import { loadTemplate, listTemplates } from '../../../src/templates/loader.js';

describe('Template Loader', () => {
  describe('loadTemplate', () => {
    it('should load the academic-summary template', () => {
      const template = loadTemplate('academic-summary');
      expect(template.name).toBe('academic-summary');
      expect(template.description).toBeDefined();
      expect(template.systemPrompt).toContain('research analyst');
      expect(template.mode).toBe('direct');
    });

    it('should include inference options from template', () => {
      const template = loadTemplate('academic-summary');
      expect(template.inference).toBeDefined();
      expect(template.inference?.temperature).toBe(0.3);
    });

    it('should throw for unknown template', () => {
      expect(() => loadTemplate('nonexistent-template')).toThrow(
        'Template "nonexistent-template" not found'
      );
    });

    it('should list available templates in error message', () => {
      try {
        loadTemplate('nonexistent');
      } catch (error) {
        expect((error as Error).message).toContain('academic-summary');
      }
    });
  });

  describe('listTemplates', () => {
    it('should return an array of templates', () => {
      const templates = listTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThanOrEqual(1);
    });

    it('should include academic-summary in the list', () => {
      const templates = listTemplates();
      const names = templates.map((t) => t.name);
      expect(names).toContain('academic-summary');
    });

    it('should not include dotfiles in the list', () => {
      const templates = listTemplates();
      const names = templates.map((t) => t.name);
      // .rlmrc.yaml.template should not appear
      expect(names.every((n) => !n.startsWith('.'))).toBe(true);
    });
  });
});
