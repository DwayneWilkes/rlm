/**
 * @fileoverview Tests for Pyodide sandbox URL validation.
 * @module @rlm/core/repl/pyodide.test
 */

import { describe, it, expect } from 'vitest';
import { validatePyodideURL } from './pyodide.js';

describe('Pyodide URL Validation', () => {
  describe('validatePyodideURL', () => {
    describe('valid URLs', () => {
      it('should accept jsdelivr CDN URLs', () => {
        expect(() =>
          validatePyodideURL('https://cdn.jsdelivr.net/pyodide/v0.26.0/full/')
        ).not.toThrow();
      });

      it('should accept jsdelivr CDN with different versions', () => {
        expect(() =>
          validatePyodideURL('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/')
        ).not.toThrow();
        expect(() =>
          validatePyodideURL('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/')
        ).not.toThrow();
      });

      it('should reject deprecated iodide CDN URLs', () => {
        // pyodide-cdn2.iodide.io is deprecated - users should use jsdelivr
        expect(() =>
          validatePyodideURL('https://pyodide-cdn2.iodide.io/pyodide/v0.23.4/full/')
        ).toThrow(/Untrusted Pyodide URL domain/);
      });

      it('should accept pythonhosted URLs', () => {
        expect(() =>
          validatePyodideURL('https://files.pythonhosted.org/packages/pyodide/')
        ).not.toThrow();
      });
    });

    describe('invalid URLs - protocol', () => {
      it('should reject HTTP URLs', () => {
        expect(() =>
          validatePyodideURL('http://cdn.jsdelivr.net/pyodide/v0.26.0/full/')
        ).toThrow(/only HTTPS URLs are allowed/);
      });

      it('should reject file:// URLs', () => {
        expect(() =>
          validatePyodideURL('file:///home/user/pyodide/')
        ).toThrow(/only HTTPS URLs are allowed/);
      });

      it('should reject javascript: URLs', () => {
        expect(() =>
          validatePyodideURL('javascript:alert(1)')
        ).toThrow(/only HTTPS URLs are allowed/);
      });

      it('should reject data: URLs', () => {
        expect(() =>
          validatePyodideURL('data:text/html,<script>alert(1)</script>')
        ).toThrow(/only HTTPS URLs are allowed/);
      });
    });

    describe('invalid URLs - untrusted domains', () => {
      it('should reject arbitrary domains', () => {
        expect(() =>
          validatePyodideURL('https://evil.com/pyodide/')
        ).toThrow(/Untrusted Pyodide URL domain/);
      });

      it('should reject localhost', () => {
        expect(() =>
          validatePyodideURL('https://localhost/pyodide/')
        ).toThrow(/Untrusted Pyodide URL domain/);
      });

      it('should reject IP addresses', () => {
        expect(() =>
          validatePyodideURL('https://192.168.1.1/pyodide/')
        ).toThrow(/Untrusted Pyodide URL domain/);
      });

      it('should reject look-alike domains', () => {
        expect(() =>
          validatePyodideURL('https://cdn-jsdelivr.net/pyodide/')
        ).toThrow(/Untrusted Pyodide URL domain/);
        expect(() =>
          validatePyodideURL('https://cdn.jsdelivr.net.evil.com/pyodide/')
        ).toThrow(/Untrusted Pyodide URL domain/);
      });

      it('should reject subdomains of allowed domains', () => {
        expect(() =>
          validatePyodideURL('https://evil.cdn.jsdelivr.net/pyodide/')
        ).toThrow(/Untrusted Pyodide URL domain/);
      });
    });

    describe('invalid URLs - missing pyodide in path', () => {
      it('should reject URLs without pyodide in path', () => {
        expect(() =>
          validatePyodideURL('https://cdn.jsdelivr.net/npm/some-package/')
        ).toThrow(/URL must contain 'pyodide' in the path/);
      });

      it('should reject root paths', () => {
        expect(() =>
          validatePyodideURL('https://cdn.jsdelivr.net/')
        ).toThrow(/URL must contain 'pyodide' in the path/);
      });
    });

    describe('invalid URLs - malformed', () => {
      it('should reject empty strings', () => {
        expect(() => validatePyodideURL('')).toThrow(/only HTTPS URLs are allowed/);
      });

      it('should reject non-URL strings', () => {
        expect(() => validatePyodideURL('not a url')).toThrow(/only HTTPS URLs are allowed/);
      });

      it('should handle URLs with embedded credentials safely', () => {
        // URL parser normalizes these - the domain check ensures safety
        // Note: Node.js URL parser strips newlines, so domain check is the protection
        expect(() =>
          validatePyodideURL('https://user:pass@cdn.jsdelivr.net/pyodide/')
        ).not.toThrow();
      });
    });

    describe('case sensitivity', () => {
      it('should accept mixed case in path (pyodide check is case-insensitive)', () => {
        expect(() =>
          validatePyodideURL('https://cdn.jsdelivr.net/PYODIDE/v0.26.0/full/')
        ).not.toThrow();
        expect(() =>
          validatePyodideURL('https://cdn.jsdelivr.net/Pyodide/v0.26.0/full/')
        ).not.toThrow();
      });
    });
  });
});
