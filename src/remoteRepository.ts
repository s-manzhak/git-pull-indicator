import { execFile } from 'child_process';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;

export interface BrowserRemote {
  name: string;
  browserUrl: string;
}

interface RemoteUrls {
  name: string;
  fetchUrl?: string;
  pushUrl?: string;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFilePromise('git', args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

function cleanRepositoryPath(repositoryPath: string): string {
  return repositoryPath
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
}

function hostedBrowserUrl(host: string, repositoryPath: string): string | undefined {
  const cleanPath = cleanRepositoryPath(repositoryPath);
  if (!host || !cleanPath) {
    return undefined;
  }

  const hostLower = host.toLowerCase();
  const pathParts = cleanPath.split('/').filter(Boolean);

  if (
    (hostLower === 'ssh.dev.azure.com' ||
      hostLower.endsWith('.vs-ssh.visualstudio.com')) &&
    pathParts[0] === 'v3' &&
    pathParts.length >= 4
  ) {
    const [, organization, project, ...repositoryParts] = pathParts;
    return `https://dev.azure.com/${organization}/${project}/_git/${repositoryParts.join('/')}`;
  }

  return `https://${host}/${cleanPath}`;
}

/**
 * Convert common Git remote formats into a safe browser URL.
 * Local paths and file:// remotes intentionally return undefined.
 */
export function remoteUrlToBrowserUrl(remoteUrl: string): string | undefined {
  const value = remoteUrl.trim();
  if (
    !value ||
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('~/') ||
    /^[A-Za-z]:[\\/]/.test(value)
  ) {
    return undefined;
  }

  if (!value.includes('://')) {
    const scpMatch = value.match(/^(?:[^@\s]+@)?([^:/\s]+):(.+)$/);
    if (scpMatch) {
      return hostedBrowserUrl(scpMatch[1], scpMatch[2]);
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }

  if (parsed.protocol === 'file:') {
    return undefined;
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    parsed.pathname = `/${cleanRepositoryPath(parsed.pathname)}`;
    return parsed.toString().replace(/\/$/, '');
  }

  if (
    parsed.protocol === 'ssh:' ||
    parsed.protocol === 'git:' ||
    parsed.protocol === 'git+ssh:'
  ) {
    return hostedBrowserUrl(parsed.hostname, parsed.pathname);
  }

  return undefined;
}

export async function findGitRepositoryRoot(
  selectedFolderPath: string
): Promise<string | undefined> {
  try {
    return await runGit(selectedFolderPath, ['rev-parse', '--show-toplevel']);
  } catch {
    return undefined;
  }
}

export async function getBrowserRemotes(repoPath: string): Promise<BrowserRemote[]> {
  const output = await runGit(repoPath, ['remote', '-v']);
  if (!output) {
    return [];
  }

  const remoteMap = new Map<string, RemoteUrls>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(.+)\s+\((fetch|push)\)$/);
    if (!match) {
      continue;
    }

    const [, name, url, kind] = match;
    const remote = remoteMap.get(name) ?? { name };
    if (kind === 'fetch') {
      remote.fetchUrl = url;
    } else {
      remote.pushUrl = url;
    }
    remoteMap.set(name, remote);
  }

  const result: BrowserRemote[] = [];
  for (const remote of remoteMap.values()) {
    const browserUrl = remoteUrlToBrowserUrl(
      remote.fetchUrl ?? remote.pushUrl ?? ''
    );
    if (browserUrl) {
      result.push({ name: remote.name, browserUrl });
    }
  }

  return result.sort((a, b) => {
    if (a.name === 'origin') {
      return -1;
    }
    if (b.name === 'origin') {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}
