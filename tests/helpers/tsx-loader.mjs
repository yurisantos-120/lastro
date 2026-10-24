import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Test-only transform for rendering real React components with the existing Node runner.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = resolvePath(specifier.slice(2));
    const file = ['', '.ts', '.tsx', '.mjs']
      .map((ext) => base + ext)
      .find(existsSync);
    if (file) return nextResolve(pathToFileURL(file).href, context);
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.tsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    return {
      format: 'module',
      shortCircuit: true,
      source: ts.transpileModule(source, {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    };
  }
  return nextLoad(url, context);
}
