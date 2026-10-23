// Guards against typos in t('...') keys: every static key used by the reception screens and
// feature code must exist in en/reception.json (or en/common.json for the common: prefix).
import common from '@/i18n/en/common.json';
import reception from '@/i18n/en/reception.json';

// No @types/node in this project: describe the few Node APIs used here.
interface NodeFs {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: string): string;
  statSync(path: string): { isDirectory(): boolean };
}
declare const __dirname: string;
const { readdirSync, readFileSync, statSync } = jest.requireActual<NodeFs>('fs');
const { join } = jest.requireActual<{ join(...parts: string[]): string }>('path');

const root = join(__dirname, '..', '..', '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p);
    return /\.(tsx?|ts)$/.test(name) ? [p] : [];
  });
}

function lookup(tree: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      return record[key] ?? record[`${key}_other`];
    }
    return undefined;
  }, tree);
}

describe('reception i18n keys', () => {
  const sources = [
    ...files(join(root, 'app', 'reception')),
    ...files(join(root, 'src', 'features', 'reception')),
  ];

  it('finds the screens', () => {
    expect(sources.length).toBeGreaterThan(15);
  });

  it('resolves every static key', () => {
    const missing: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bt\(\s*(['"`])([A-Za-z][\w.:]*)\1/g)) {
        const key = m[2] as string;
        const found = key.startsWith('common:')
          ? lookup(common, key.slice('common:'.length))
          : key.startsWith('reception:')
            ? lookup(reception, key.slice('reception:'.length))
            : lookup(reception, key);
        if (typeof found !== 'string') missing.push(`${file.replace(root, '')}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
