export const GENERIC_PROVIDER_TOKENS = new Set([
  'apps',
  'codex',
  'core',
  'mcp',
  'native',
  'plugin',
]);

const TECHNICAL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  add: ['create'],
  assignee: ['assign'],
  assign: ['add'],
  change: ['edit', 'update'],
  check: ['inspect', 'search'],
  chain: ['path', 'explore'],
  count: ['list'],
  documentation: ['docs'],
  find: ['search', 'lookup'],
  fetch: ['get', 'read'],
  get: ['fetch', 'read'],
  gcal: ['google', 'calendar'],
  gh: ['github'],
  github: ['gh', 'git', 'hub'],
  javascript: ['js'],
  js: ['javascript'],
  codegraph: ['code', 'graph'],
  mr: ['merge', 'request'],
  pr: ['pull', 'request'],
  prs: ['pr', 'pull', 'request'],
  repo: ['repository'],
  repos: ['repositories'],
  lookup: ['find', 'search'],
  navigate: ['open'],
  number: ['count'],
  open: ['navigate'],
  search: ['find', 'lookup'],
  serach: ['search', 'find'],
  show: ['get', 'list'],
  trace: ['explore', 'call', 'path'],
  ticktick: ['tick'],
  sned: ['send'],
  lsit: ['list'],
  busca: ['search', 'find'],
  liste: ['list'],
  recherche: ['search', 'find'],
  найди: ['find', 'search'],
  браузер: ['browser'],
  браузере: ['browser'],
  вкладка: ['tab'],
  вкладки: ['tab'],
  вкладку: ['tab'],
  вызовов: ['call'],
  файл: ['file'],
  файла: ['file'],
  изображение: ['image'],
  изображения: ['image'],
  иконка: ['icon', 'image'],
  иконки: ['icon', 'image'],
  количество: ['count'],
  контур: ['outline'],
  закрой: ['close'],
  локальный: ['local'],
  локального: ['local'],
  открой: ['open', 'navigate'],
  прозрачный: ['transparent'],
  прозрачного: ['transparent'],
  проверь: ['inspect', 'view'],
  перечисли: ['list'],
  покажи: ['show', 'explore'],
  показать: ['show', 'explore'],
  посмотри: ['view', 'inspect'],
  посчитай: ['count', 'list'],
  посчитать: ['count', 'list'],
  прочитай: ['read'],
  прочитать: ['read'],
  проекты: ['project'],
  проектов: ['project'],
  списки: ['list', 'project'],
  списков: ['list', 'project'],
  отправь: ['send'],
  цепочка: ['path', 'explore'],
  цепочку: ['path', 'explore'],
  задач: ['task'],
  write: ['add'],
};
export const ACTION_TOKENS = new Set([
  'add',
  'apply',
  'archive',
  'assign',
  'cancel',
  'calculate',
  'click',
  'close',
  'complete',
  'compute',
  'convert',
  'count',
  'create',
  'delete',
  'download',
  'edit',
  'evaluate',
  'execute',
  'export',
  'fetch',
  'capture',
  'explore',
  'find',
  'generate',
  'get',
  'import',
  'inspect',
  'install',
  'list',
  'lookup',
  'mark',
  'merge',
  'navigate',
  'open',
  'query',
  'read',
  'remove',
  'publish',
  'reply',
  'request',
  'rerun',
  'resolve',
  'run',
  'screenshot',
  'search',
  'send',
  'set',
  'show',
  'statistic',
  'stats',
  'uninstall',
  'update',
  'upload',
  'view',
  'wait',
  'write',
]);
const QUERY_ACTION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  retrieve: ['fetch', 'get', 'read'],
  return: ['fetch', 'get', 'read'],
};
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'one',
  'or',
  'the',
  'through',
  'to',
  'with',
  'в',
  'для',
  'из',
  'и',
  'к',
  'на',
  'по',
  'с',
]);

export function tokenize(value: unknown): readonly string[] {
  return (
    String(value ?? '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_:/.-]+/g, ' ')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function expandTechnicalAliases(tokens: readonly string[]): readonly string[] {
  const expanded = tokens.flatMap((token) => [
    token,
    ...(Object.hasOwn(TECHNICAL_ALIASES, token) ? (TECHNICAL_ALIASES[token] ?? []) : []),
  ]);
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index] === 'java' && tokens[index + 1] === 'script') {
      expanded.push('javascript', 'js');
    }
    if (tokens[index] === 'look' && tokens[index + 1] === 'up') {
      expanded.push('find', 'search', 'lookup');
    }
    if (tokens[index] === 'git' && tokens[index + 1] === 'hub') {
      expanded.push('github', 'gh');
    }
    if (tokens[index] === 'code' && tokens[index + 1] === 'graph') {
      expanded.push('codegraph');
    }
    if (tokens[index] === 'tick' && tokens[index + 1] === 'tick') {
      expanded.push('ticktick');
    }
  }
  return expanded;
}

export function expandEnglishMorphology(tokens: readonly string[]): readonly string[] {
  return tokens.flatMap((token) => {
    if (!/^[a-z]+$/.test(token) || token.length <= 4) return [token];
    if (token.endsWith('ing') && token.length > 5) {
      const base = token.slice(0, -3);
      return [token, base, `${base}e`];
    }
    if (token.endsWith('ies')) return [token, `${token.slice(0, -3)}y`];
    if (
      token.endsWith('s') &&
      !token.endsWith('ss') &&
      !token.endsWith('us') &&
      !token.endsWith('is')
    )
      return [token, token.slice(0, -1)];
    return [token];
  });
}

export function meaningfulTokens(value: unknown): readonly string[] {
  return expandTechnicalAliases(expandEnglishMorphology(tokenize(value))).filter(
    (token) => !STOP_WORDS.has(token),
  );
}
export function meaningfulQueryTokens(value: unknown): readonly string[] {
  return meaningfulTokens(value).flatMap((token) => [
    token,
    ...(Object.hasOwn(QUERY_ACTION_ALIASES, token) ? (QUERY_ACTION_ALIASES[token] ?? []) : []),
  ]);
}

export function stripNegatedClauses(value: unknown): string {
  return String(value ?? '')
    .replace(
      /\b(?:do\s+not|don't|never)\b[^,.;]*?(?=(?:\band\s+)?\b(?:do\s+not|don't|never)\b|[,.;]|$)/gi,
      ' ',
    )
    .replace(/\bwithout\b[^,.;]*(?=[,.;]|$)/gi, ' ')
    .replace(
      /(?:^|[;,])[^.;]*?(?:ничего\s+)?не\s+(?:вывод|измен|меня|созда)[^.;]*(?=[.;]|$)/giu,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export function isStopWord(token: string): boolean {
  return STOP_WORDS.has(token);
}

export function uniqueTokens(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function compactIdentifier(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
