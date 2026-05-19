import * as vscode from 'vscode';
import { RepoStatus } from './types';

/** Sync arrows for the Git Sync tree (not Explorer file decorations). */
export function syncBadgeForStatus(
  status: RepoStatus,
  useAscii: boolean
): vscode.FileDecoration | undefined {
  if (status.error) {
    return {
      badge: '!',
      tooltip: `Git status check failed: ${status.error}`,
    };
  }

  if (!status.hasUpstream) {
    return {
      badge: '?',
      tooltip: 'No upstream configured.',
    };
  }

  const { ahead, behind, isDirty } = status;
  const dirtyNote = isDirty ? ' Uncommitted local changes.' : '';

  if (behind > 0 && ahead === 0) {
    return {
      badge: useAscii ? 'PL' : '↓',
      tooltip: `Remote has ${behind} commit${behind === 1 ? '' : 's'}. Pull required.${dirtyNote}`,
    };
  }

  if (ahead > 0 && behind === 0) {
    return {
      badge: useAscii ? 'PS' : '↑',
      tooltip: `Local branch has ${ahead} commit${ahead === 1 ? '' : 's'} to push.${dirtyNote}`,
    };
  }

  if (ahead > 0 && behind > 0) {
    return {
      badge: useAscii ? 'PM' : '↕',
      tooltip: `Branch has ${behind} incoming and ${ahead} outgoing commits.${dirtyNote}`,
    };
  }

  return undefined;
}

export function syncPriority(status: RepoStatus): number {
  if (status.error || !status.hasUpstream) {
    return 0;
  }
  if (status.behind > 0 && status.ahead > 0) {
    return 3;
  }
  if (status.behind > 0) {
    return 2;
  }
  if (status.ahead > 0) {
    return 1;
  }
  return -1;
}
