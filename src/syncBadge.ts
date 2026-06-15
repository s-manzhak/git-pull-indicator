import * as vscode from 'vscode';
import { RepoStatus } from './types';

/** Human-readable age like "just now", "5m ago", "2h ago", "3d ago". */
export function formatAge(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) {
    return 'just now';
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return `${hr}h ago`;
  }
  return `${Math.floor(hr / 24)}d ago`;
}

/**
 * Tooltip line about fetch freshness, or '' when unknown.
 * `staleFetchMinutes` of 0 disables the "may be outdated" warning (age still shown).
 */
function fetchFreshnessNote(status: RepoStatus, staleFetchMinutes: number): string {
  if (status.lastFetchedAt === undefined) {
    return '';
  }
  const age = Date.now() - status.lastFetchedAt;
  const stale = staleFetchMinutes > 0 && age > staleFetchMinutes * 60_000;
  return stale
    ? `\nLast fetched ${formatAge(age)} — counts may be outdated, run Fetch.`
    : `\nLast fetched ${formatAge(age)}.`;
}

/** Sync arrows for the Git Sync tree (not Explorer file decorations). */
export function syncBadgeForStatus(
  status: RepoStatus,
  useAscii: boolean,
  staleFetchMinutes = 0
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
  const fetchNote = fetchFreshnessNote(status, staleFetchMinutes);

  if (behind > 0 && ahead === 0) {
    return {
      badge: useAscii ? 'PL' : '↓',
      tooltip: `Remote has ${behind} commit${behind === 1 ? '' : 's'}. Pull required.${dirtyNote}${fetchNote}`,
    };
  }

  if (ahead > 0 && behind === 0) {
    return {
      badge: useAscii ? 'PS' : '↑',
      tooltip: `Local branch has ${ahead} commit${ahead === 1 ? '' : 's'} to push.${dirtyNote}${fetchNote}`,
    };
  }

  if (ahead > 0 && behind > 0) {
    return {
      badge: useAscii ? 'PM' : '↕',
      tooltip: `Branch has ${behind} incoming and ${ahead} outgoing commits.${dirtyNote}${fetchNote}`,
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
