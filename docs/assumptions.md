# §3 assumptions

Verified against Shorebird 1.6.116 on 2026-09-16 (macOS 26.6, Xcode 26.3 build 17C529).
Raw captures live in `test/fixtures/cli/<command>.<stdout|stderr>.txt`.

## §3.1 — Does Shorebird store the build toolchain in release metadata?

**Verified: no Xcode fields.** `shorebird releases list --json` returns per release:
`id`, `app_id`, `version`, `flutter_revision`, `flutter_version`, `display_name`,
`platform_statuses`, `created_at`, `updated_at`, `notes`.

Consequence: the local ledger (`.shorebird-guard/ledger.json`) is the source of truth for the
Xcode fingerprint. `flutter_revision` is read from the server response at check time and only
cached in the ledger.

Fixture: `releases-list-json.stdout.txt`.

## §3.2 — Does the CLI expose machine-readable output?

**Verified: `--json` is a global flag.** Envelope on every command tried:

```json
{ "status": "success", "data": { ... }, "meta": { "version": "1.6.116", "command": "<name>" } }
```

- `releases list --json` → `data.releases[]`
- `flutter versions list --json` → `data.current_version`, `data.versions[]`
- `--version --json` → `data.shorebird_version`, `data.flutter_version`, `data.flutter_revision`, `data.engine_revision`
- `doctor --json` → `data.shorebird_version`, `data.flutter_revision`, `data.android_toolchain`, `data.network[]`

Progress lines ("Starting Fetching releases...", "Done Fetching releases") go to **stderr**, so
stdout is pure JSON. The "A new version of shorebird is available!" banner is suppressed in
`--json` mode. `meta.version` is used for the CLI-version log line. No stdout parsing.

Fixtures: `version-json.*`, `releases-list-json.*`, `flutter-versions-list-json.*`, `doctor-json.*`.

## §3.3 — What does the mismatch error look like?

**[unverified — requires a real drift build].** `shorebird patch ios --help` and
`shorebird doctor --verbose` were captured (`patch-ios-help.stdout.txt`, `doctor-verbose.*`).
Neither mentions Xcode version checks; `doctor` reports only the Android toolchain, Flutter
revision and network reachability. Producing the real stderr requires cutting a release on one
Xcode and patching on another, which was not done. `patch-ios-mismatch.stderr.txt` is a
placeholder and must be replaced when a drift build is observed.

## §3.4 — How does Shorebird resolve the Flutter revision?

**Verified.** `shorebird flutter versions list` prints a human list with `✓` marking the
current version and the upgrade banner appended (`flutter-versions-list.stdout.txt`); the
progress spinner goes to stderr. With `--json`:

```json
{ "status": "success", "data": { "current_version": "3.44.9", "versions": ["3.44.9", "..."] }, "meta": { ... } }
```

The revision hash itself is not in that list; it comes from `shorebird --version --json`
(`data.flutter_revision`, e.g. `c2515c46c7fca511e39735a615f0f12f3dca6230`) and matches
`flutter_revision` on the release object, which is what the extension compares.

Fixtures: `flutter-versions-list.*`, `flutter-versions-list-json.*`, `version-json.*`.
