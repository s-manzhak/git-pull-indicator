import { execFile } from 'child_process';
import { promisify } from 'util';
import { findGitRepository } from './gitApiStatus';

const execFilePromise = promisify(execFile);
const OPERATION_TIMEOUT_MS = 5 * 60_000;

export type GitOperation = 'pull' | 'push' | 'fetch';

const cliArguments: Record<GitOperation, string[]> = {
  pull: ['pull', '--no-edit'],
  push: ['push'],
  fetch: ['fetch'],
};

/**
 * Prefer VS Code's Git API so existing credential prompts and Git settings are
 * respected. Fall back to the CLI for repositories not opened by vscode.git.
 */
export async function runGitOperation(
  repoPath: string,
  operation: GitOperation
): Promise<void> {
  const repository = findGitRepository(repoPath);
  const apiOperation = repository?.[operation];

  if (typeof apiOperation === 'function') {
    await apiOperation.call(repository);
    return;
  }

  await execFilePromise('git', cliArguments[operation], {
    cwd: repoPath,
    timeout: OPERATION_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_MERGE_AUTOEDIT: 'no',
    },
  });
}
