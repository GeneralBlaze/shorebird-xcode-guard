`shorebird patch ios` runs a ten-minute release build and only then tells you the active Xcode is not the one that built the release — Shorebird Xcode Guard tells you before the build starts.

![Hero: blocking modal appears before a wasted build](docs/media/hero.gif)

## What it does

- Records the toolchain that cut each Shorebird release (Xcode version and build number, Flutter revision, Shorebird version, macOS version) in a ledger you commit: `.shorebird-guard/ledger.json`.
- Compares the active `xcode-select` toolchain against the recorded one for the release you are about to patch.
- Shows the result passively in the status bar and blocks the patch build when the drift is serious.
- Offers a one-click switch that runs `sudo xcode-select -s …` in a visible terminal. Your password never passes through the extension.

## Quick start

1. Open a folder that contains `shorebird.yaml`. The extension activates on nothing else.
2. After `shorebird release ios`, run **Shorebird Guard: Record current toolchain for release…** and pick the release. Commit `.shorebird-guard/ledger.json`.
3. Patch with **Shorebird Guard: Patch iOS (guarded)** instead of typing `shorebird patch ios`. The pre-flight check runs, then the real command is spawned in a terminal.

If you keep a VS Code task whose command line contains `shorebird patch … ios`, the task guard checks it as well and terminates the task process with an explanation when the drift is blocking.

## Status bar

| State | Appearance |
| --- | --- |
| Aligned | `$(shield) Xcode 16.2` |
| Drift, warning | `$(shield) Xcode 16.2 ≠ 16.1` on a warning background |
| Drift, blocking | same text on an error background |
| No record for the target release | `$(shield) Xcode 16.2 ?` |
| Shorebird CLI not found | `$(shield) Xcode 16.2 ?` — tooltip explains |
| Not a Shorebird workspace | hidden |

![Status bar aligned](docs/media/status-aligned.png)
![Status bar drift](docs/media/status-drift.png)
![Xcode switch picker](docs/media/switch-picker.png)

## Drift severity

| Severity | Meaning | Default action |
| --- | --- | --- |
| `ok` | Same Xcode build number | allow |
| `patch-drift` | Same major.minor, different build (beta vs GM) | warn |
| `minor-drift` | Same major, different minor (16.1 → 16.2) | block |
| `major-drift` | Different major (15.x → 16.x) | block, no soft override |
| `unknown` | Nothing recorded for the target release | warn once, offer to record |

A differing Flutter revision (checked against the Shorebird server's release record) blocks regardless of Xcode severity.

## Commands

| Command | Title |
| --- | --- |
| `shorebirdGuard.checkNow` | Check toolchain alignment |
| `shorebirdGuard.patchIos` | Patch iOS (guarded) |
| `shorebirdGuard.recordRelease` | Record current toolchain for release… |
| `shorebirdGuard.switchXcode` | Switch active Xcode… |
| `shorebirdGuard.showLedger` | Open toolchain ledger |
| `shorebirdGuard.showLogs` | Show logs |

## Settings

All settings are resource-scoped so a monorepo can vary them per folder.

| Setting | Default | Purpose |
| --- | --- | --- |
| `shorebirdGuard.enabled` | `true` | Master switch |
| `shorebirdGuard.blockOn` | `minor-drift` | Lowest severity that blocks |
| `shorebirdGuard.warnOn` | `patch-drift` | Lowest severity that warns |
| `shorebirdGuard.ledgerPath` | `.shorebird-guard/ledger.json` | Ledger location relative to the app folder |
| `shorebirdGuard.shorebirdPath` | `shorebird` | Path to the CLI when it is not on VS Code's PATH |
| `shorebirdGuard.checkFlutterRevision` | `true` | Also compare the Flutter revision |
| `shorebirdGuard.statusBar.enabled` | `true` | Show the status bar item |
| `shorebirdGuard.cliTimeoutMs` | `15000` | Timeout for every subprocess |
| `shorebirdGuard.trace` | `off` | Log verbosity |

## Requirements

- macOS with at least one Xcode under `/Applications/Xcode*.app`. On Windows and Linux the extension activates and reports "not applicable".
- Shorebird CLI 1.6.116 or later with `--json` support. If `shorebird` is not on the PATH VS Code sees, set `shorebirdGuard.shorebirdPath`.

## Privacy

No telemetry. Nothing leaves your machine except the calls the Shorebird CLI already makes.

## Contributing

`npm ci && npm run lint && npm run typecheck && npm run test:unit && npm run test:integration`. See `docs/assumptions.md` for the CLI behaviour the extension relies on and `docs/manual-tests.md` for the pre-release matrix.

## License

MIT
