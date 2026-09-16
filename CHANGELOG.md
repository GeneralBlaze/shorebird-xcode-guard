# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-16

### Fixed

- `exec` returns a typed `spawn-error` instead of rejecting when the command cannot be spawned.
- CLI and Xcode probes accept a cancellation token; a superseded check for the same app is cancelled.
- Unreadable `shorebird.yaml` files and failed refreshes are logged instead of surfacing as unhandled rejections.
- Extension icon and gallery banner added.

### Added

- Toolchain fingerprint (Xcode version/build, Flutter revision, Shorebird version, macOS version).
- Committed ledger at `.shorebird-guard/ledger.json` recording the toolchain per release.
- Status bar item showing the active Xcode and drift against the latest recorded release.
- `Patch iOS (guarded)` command that runs the pre-flight check before spawning `shorebird patch`.
- Task guard that terminates a `shorebird patch` task when drift is blocking.
- `Switch active Xcode…` picker that runs `sudo xcode-select -s` in a visible terminal.
- Manual `Record current toolchain for release…` command.
