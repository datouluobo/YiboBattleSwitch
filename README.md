# YiboBattleSwitch

YiboBattleSwitch is a standalone Electron desktop app for switching between multiple Battle.net accounts on one Windows machine.

The project is intentionally positioned as an independent local tool. The current app already supports saving the active login state into its own account library, switching to a saved account, exporting and importing the library, restoring recent backups, and collecting diagnostic snapshots when a switch fails.

## What It Does

- Save the current Battle.net login state into the local account library
- Switch from one saved account to another with explicit confirmation
- Export and import the account library for migration and backup
- Restore the latest recommended backup when the local state needs to be rolled back
- Launch Battle.net directly from the app
- Show current state, recent logs, and diagnostic actions in a built-in debug area
- Run from the tray with optional auto-start and minimized launch behavior

## Product Boundary

YiboBattleSwitch is not trying to be a generic registry editor, reverse-engineering console, or a thin wrapper around another tool.

Its product boundary is:

- keep the common path simple for players who only want to switch accounts;
- isolate technical complexity behind secondary diagnostics;
- preserve a recoverable workflow with backup, restore, and verification steps;
- gradually move all account storage into the app's own data model.

## Current Status

Current version: `v0.5.1`

Implemented in the current desktop build:

- account save, delete, reorder, and note editing;
- local account library import and export;
- Battle.net launch and game directory detection;
- backup and restore actions;
- switch profile selection with `D` as the formal profile;
- tray integration and startup preferences;
- diagnostic snapshot and latest comparison actions.

Not yet completed for Microsoft Store technical submission:

- the repository now provides an unsigned `msix` packaging flow for Store submission, but the final Partner Center package identity still needs to be filled in;
- support URL and final publisher-facing store metadata still need to be finalized in Partner Center;
- final screenshots should still be captured from a release-candidate build before submission.

## Project Layout

```text
app/
  domain/      business actions such as switch, save, backup, restore
  infra/       Battle.net, storage, filesystem, logger integrations
  main/        Electron main process, windowing, IPC, tray
  renderer/    desktop UI and interaction logic
  shared/      app-wide constants and shared types
assets/
  icons/       application icons
  plugins/     linked project artwork shown in the UI
  store/       Microsoft Store copy masters and image source files
docs/
  product and technical notes
scripts/
  packaging and workspace helper scripts
```

## Development

Requirements:

- Windows
- Node.js
- npm

Commands:

```bash
npm install
npm run typecheck
npm run build
npm run start
```

Packaging:

```bash
npm run dist:win
npm run dist:msix
```

## Release Material

Store copy, screenshot captions, cleanup plan, and promotional image masters are tracked in:

- [`docs/发布准备与微软商店素材.md`](/E:/Program/YiboBattleSwitch/docs/发布准备与微软商店素材.md)
- [`docs/仓库清理计划.md`](/E:/Program/YiboBattleSwitch/docs/仓库清理计划.md)
- [`docs/EULA.md`](/E:/Program/YiboBattleSwitch/docs/EULA.md)
- [`docs/PRIVACY.md`](/E:/Program/YiboBattleSwitch/docs/PRIVACY.md)
- [`docs/法律与发布风险审查.md`](/E:/Program/YiboBattleSwitch/docs/法律与发布风险审查.md)
- [`assets/store/README.md`](/E:/Program/YiboBattleSwitch/assets/store/README.md)

## License and third-party notices

Project-owned source code is licensed under the [MIT License](LICENSE).
Release packages include the project license and [third-party notices](THIRD-PARTY-NOTICES.txt), including the notices supplied with Electron and Chromium.

## Repository Notes

This repository may contain temporary build output such as `dist/` and `release/`. They are disposable artifacts and should be deleted only after explicit confirmation.
