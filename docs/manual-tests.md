# Manual test matrix (§9.5)

Run before every minor release on a machine with two Xcode versions installed (for example 16.2 and 26.3). Tick every box.

Setup per row: open a real Shorebird app folder, make the named Xcode active with `sudo xcode-select -s`, and prepare the ledger as described.

## Xcode A active (matches the recorded release)

- [ ] Aligned — ledger entry for the latest release records Xcode A. Status bar `$(shield) Xcode A`, default colour. **Patch iOS (guarded)** spawns the terminal without a modal.
- [ ] Minor drift — ledger entry records Xcode A with a different minor (edit `xcodeVersion`/`xcodeBuild`). Status bar `≠`, error background. **Patch iOS (guarded)** shows the modal with **Switch to Xcode …**, **Build anyway**, **Details**.
- [ ] Major drift — ledger entry records a different major. Modal has no **Build anyway** button.
- [ ] No ledger entry — delete `.shorebird-guard/ledger.json`. Status bar `?`. **Patch iOS (guarded)** warns once and still launches; second run in the same session does not warn again.
- [ ] No Shorebird CLI — set `shorebirdGuard.shorebirdPath` to `/nonexistent`. Status bar `?`, tooltip says CLI unavailable, no error notification on activation.

## Xcode B active

- [ ] Aligned — record a release with Xcode B active; status bar shows Xcode B, default colour.
- [ ] Minor drift — ledger records Xcode A (same major, different minor). Choose **Switch to Xcode A**: a terminal opens with `sudo xcode-select -s`, password prompt visible. After entering it, **Check toolchain alignment** reports aligned.
- [ ] Major drift — ledger records a different major. Task guard: run a task whose command is `shorebird patch ios`; the task is terminated and the modal names the task.
- [ ] No ledger entry — **Record current toolchain for release…** lists releases from the server, writes the ledger with sorted keys, status bar turns aligned.
- [ ] No Shorebird CLI — **Record current toolchain for release…** still records the Xcode fields with empty Shorebird/Flutter fields and reports success.

## Cross-cutting

- [ ] Corrupt ledger (`{ not json`) — status bar `Ledger !`, warning background, commands do not throw.
- [ ] Two Xcodes with identical marketing version — **Switch active Xcode…** lists both with distinct build numbers.
- [ ] `xcode-select` pointing at CommandLineTools — status bar `Xcode ?`, log names `command-line-tools-only`.
- [ ] CLI timeout — set `shorebirdGuard.cliTimeoutMs` to `1000` on a slow network; log shows `timed out`, status bar `?`, no hung spinner.
- [ ] Multi-root — two Shorebird apps open; switching the active editor between them updates the status bar label.
- [ ] Windows/Linux — extension activates, status bar `Xcode n/a`, every command shows "only checks Xcode on macOS".
