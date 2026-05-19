# Changelog

## 0.1.22

- Remove user-facing reload instructions from docs; activation is handled by workspace and startup events
- Update README to match the current Explorer colors and status bar workflow

## 0.1.21

- Use built-in VS Code theme colors for Explorer folder states so colors apply reliably after installing a VSIX

## 0.1.20

- Reduce background CPU usage: one lightweight git status command per repo instead of multiple rev-parse/rev-list calls
- Lower default repo check concurrency and auto-refresh frequency
- Disable full refresh on window focus by default and remove the recursive workspace fs watcher from activation
- Avoid rescanning the whole workspace on periodic refresh; reuse the repository list found at startup

## 0.1.19

- Activate in git workspaces without waiting for the next IDE startup, so Explorer colors appear after installing into an open window

## 0.1.18

- Expand the status bar tooltip with pull, push, diverged counts and click-to-refresh text

## 0.1.17

- Use red Explorer folder text for repositories that have both incoming and outgoing commits

## 0.1.16

- Add sync-state colors for git repo folder names in Explorer when Git's dirty bubble hides the arrow badge
- Keep the ordinary Explorer-only approach; no separate Git Sync panel

## 0.1.15

- Remove the Git Sync Explorer panel; keep the extension focused on ordinary Explorer folder decorations
- Continue probing Explorer folder badge behavior without changing built-in Git colors

## 0.1.14

- Add a reliable Explorer fallback in the Git Sync view: title description, view badge, and repo rows show ↓/↑ even when built-in Git owns the folder badge

## 0.1.13

- Show ↓/↑ next to repo folder name alongside built-in Git dot (register after vscode.git, badge only)

## 0.1.12

- Explorer: ↓/↑/↕ badge only on git repo folder row (right of name), not on files inside
- Git Sync panel in Explorer sidebar; optional `showExplorerFolderBadges`

## 0.1.10

- Fix pull/push badges on repo folders (path matching, Git CLI sync counts)
- Keep ↓ visible while editing uncommitted files; do not override IDE folder colors

## 0.1.9

- Restore activity bar icon file; fix oversized marketplace `icon.png`

## 0.1.8

- Fix badges not showing on repo folders (path matching, refresh after Git extension)
- Show pull/push badge on all paths inside a repo (folder + changed files)
- Keep behind/ahead when editing files; fix path keys (realpath)
- Separate activity bar icon (`activitybar-icon.svg`)

## 0.1.7

- Updated `git-pull-icon.svg` / marketplace icon (transparent cutout badge on folder)

## 0.1.6

- Do not override IDE folder colors (badge only, no decoration color)
- Keep pull/push counts when editing uncommitted files (vscode.git reports 0/0)
- Refresh sync counts via git CLI on full repo update

## 0.1.5

- Only show sync badges (↓/↑/↕); leave IDE green/yellow folder dots to built-in Git
- Keep Git API fix so pull arrow stays visible while editing uncommitted files

## 0.1.4

- Show local status dot (●/✓) and sync arrows (↓/↑/↕) side by side via two decoration providers

## 0.1.3

- Keep pull/push badges when editing uncommitted files (read ahead/behind from vscode.git API)
- Show `●` instead of green checkmark when repo is in sync but has local changes

## 0.1.2

- Fix activity bar icon: use filled paths (stroke-only SVG was invisible in Cursor)
- Single activity bar icon path for better compatibility

## 0.1.1

- Fix activity bar icon (monochrome SVG for light/dark themes; was gray square)

## 0.1.0

- Git status badges in Explorer (`↓` `↑` `↕` `?` `!`)
- Repositories sidebar panel
- Multi-repo workspace scan with configurable depth
- Commands: Refresh, Fetch All, Open Repository Terminal, Show Log
- Auto-refresh on git changes, window focus, and periodic backup
