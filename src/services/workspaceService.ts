import { dirname, sep } from 'node:path';

export interface ShorebirdApp {
  readonly root: string;
  readonly yamlPath: string;
  readonly appId: string;
  readonly flavors: Readonly<Record<string, string>>;
}

const TOP_LEVEL = /^([A-Za-z_][\w-]*):\s*(.*)$/;
const NESTED = /^\s+([A-Za-z_][\w-]*):\s*(.+)$/;

function unquote(value: string): string {
  const trimmed = value.replace(/\s+#.*$/, '').trim();
  return trimmed.replace(/^["'](.*)["']$/, '$1');
}

interface ParseState {
  readonly appId: string | undefined;
  readonly flavors: Readonly<Record<string, string>>;
  readonly inFlavors: boolean;
}

function step(state: ParseState, line: string): ParseState {
  if (line.trim() === '' || line.trim().startsWith('#')) {
    return state;
  }
  const top = TOP_LEVEL.exec(line);
  if (top !== null) {
    const [, keyword, value] = top;
    if (keyword === 'app_id') {
      return { ...state, appId: unquote(value ?? ''), inFlavors: false };
    }
    return { ...state, inFlavors: keyword === 'flavors' };
  }
  const nested = NESTED.exec(line);
  if (state.inFlavors && nested !== null) {
    const [, flavor, value] = nested;
    return { ...state, flavors: { ...state.flavors, [flavor ?? '']: unquote(value ?? '') } };
  }
  return state;
}

export function parseShorebirdYaml(yamlPath: string, text: string): ShorebirdApp | undefined {
  const initial: ParseState = { appId: undefined, flavors: {}, inFlavors: false };
  const state = text.split(/\r?\n/).reduce(step, initial);
  if (state.appId === undefined || state.appId === '') {
    return undefined;
  }
  return { root: dirname(yamlPath), yamlPath, appId: state.appId, flavors: state.flavors };
}

const contains = (root: string, path: string): boolean =>
  path === root || path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);

export function resolveAppForPath(
  apps: readonly ShorebirdApp[],
  path: string | undefined,
): ShorebirdApp | undefined {
  if (path === undefined) {
    return apps.length === 1 ? apps[0] : undefined;
  }
  return [...apps]
    .filter((app) => contains(app.root, path))
    .sort((a, b) => b.root.length - a.root.length)[0];
}
