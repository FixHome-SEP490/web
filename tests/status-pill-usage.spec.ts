import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// FhStatusPill shows its `label` prop (or the status default); text written between its
// tags is silently dropped. That is how an active warehouse read "Thành công" (BUG DETECTOR 91).
const vueFiles = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? vueFiles(path) : path.endsWith('.vue') ? [path] : [];
});

describe('FhStatusPill usage', () => {
  it('never passes its text between the tags', () => {
    const offenders = vueFiles('src').flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/<FhStatusPill\b[^>]*?(?<!\/)>([\s\S]*?)<\/FhStatusPill>/g)]
        .filter((match) => match[1]!.trim())
        .map((match) => `${file}:${source.slice(0, match.index).split('\n').length}`);
    });
    expect(offenders).toEqual([]);
  });
});
