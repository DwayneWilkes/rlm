/**
 * @fileoverview Template loader for predefined prompt templates.
 *
 * Loads YAML template files from the built-in templates directory.
 *
 * @module templates/loader
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { ExecutionMode, InferenceOptions } from '@rlm/core';

export interface Template {
  name: string;
  description: string;
  mode?: ExecutionMode;
  systemPrompt: string;
  budget?: {
    maxCost?: number;
    maxIterations?: number;
    maxDepth?: number;
    maxTime?: number;
  };
  inference?: InferenceOptions;
  synthesize?: boolean;
  synthesizePrompt?: string;
}

/**
 * Resolve the templates directory path.
 * Works from both source (src/) and built (dist/) locations.
 */
function getTemplatesDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // From src/templates/loader.ts -> ../../templates/
  // From dist/templates/loader.js -> ../../templates/
  return join(thisDir, '..', '..', 'templates');
}

/**
 * Load a template by name.
 *
 * @param name - Template name (without .yaml extension)
 * @returns Parsed template
 * @throws Error if template not found
 */
export function loadTemplate(name: string): Template {
  const dir = getTemplatesDir();
  const filePath = join(dir, `${name}.yaml`);

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    const available = listTemplates().map((t) => t.name).join(', ');
    throw new Error(
      `Template "${name}" not found. Available: ${available || 'none'}`
    );
  }

  const parsed = parseYaml(content) as Template;
  if (!parsed.name || !parsed.systemPrompt) {
    throw new Error(`Template "${name}" is missing required fields (name, systemPrompt)`);
  }

  return parsed;
}

/**
 * List all available templates.
 *
 * @returns Array of templates with name and description
 */
export function listTemplates(): Template[] {
  const dir = getTemplatesDir();

  let files: string[];
  try {
    files = readdirSync(dir).filter(
      (f) => f.endsWith('.yaml') && !f.startsWith('.')
    );
  } catch {
    return [];
  }

  return files.map((f) => {
    const content = readFileSync(join(dir, f), 'utf-8');
    const parsed = parseYaml(content) as Template;
    return parsed;
  });
}
