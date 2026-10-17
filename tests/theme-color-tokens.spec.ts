import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A colour class whose shade the theme never defines (bg-ink-950/50) generates no CSS
// at all: every dialog using it lost its dimmed backdrop and looked pasted on the page.
const ROOT = join(__dirname, '..', 'src');
const PALETTES = ['ink', 'brand', 'success', 'warning', 'danger', 'info'];
const USE = new RegExp(`\\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|shadow|decoration|accent|caret|placeholder)-(${PALETTES.join('|')})-(\\d{2,3})\\b`, 'g');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(vue|ts)$/.test(name) ? [path] : [];
  });
}

describe('theme colour tokens', () => {
  it('defines every palette shade the code uses', () => {
    const theme = readFileSync(join(ROOT, 'assets', 'theme.css'), 'utf8');
    const defined = new Set([...theme.matchAll(/--color-([a-z]+-\d+)\s*:/g)].map((m) => m[1]));
    const missing = new Map<string, string>();
    for (const file of files(ROOT)) {
      for (const match of readFileSync(file, 'utf8').matchAll(USE)) {
        const token = `${match[1]}-${match[2]}`;
        if (!defined.has(token) && !missing.has(token)) missing.set(token, file.slice(ROOT.length + 1));
      }
    }
    expect(Object.fromEntries(missing)).toEqual({});
  });
});
