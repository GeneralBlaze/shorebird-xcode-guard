# Media to capture

All captures at 2× on a 1440×900 window, VS Code default dark theme, Shorebird app folder open.

| File | What | How |
| --- | --- | --- |
| `hero.gif` | Blocking modal appearing before a wasted build, with a visible clock | Record release on Xcode A, switch to Xcode B, run **Patch iOS (guarded)**. Show the terminal clock (`date`) in frame. Trim to ≤ 8 s, ≤ 3 MB. |
| `status-aligned.png` | Status bar showing `$(shield) Xcode 26.3` with default colour | Ledger entry matches active Xcode. Crop to the right half of the status bar. |
| `status-drift.png` | Status bar showing `$(shield) Xcode 26.3 ≠ 16.2` on the error background | Ledger entry for another Xcode version. Same crop. |
| `switch-picker.png` | The **Switch active Xcode…** quick pick with two Xcodes, one marked `(active)` | Two Xcodes installed. Full quick pick in frame. |
| `icon.png` | 128×128 extension icon, shield motif | Add `"icon": "icon.png"` and a `galleryBanner` colour to `package.json` once produced. |
