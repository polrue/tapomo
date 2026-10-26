# Notes for certification (Partner Center)

Paste the text in the block below into "Notes for certification". Length: see the heading.

## Notes [1721/2000]

```
Tapomo is a typing-speed tracker for Windows. It measures how fast the user types, in the background, and shows speed, records and streaks, plus typing lessons.

Why the app needs runFullTrust: it is a Win32 desktop app (Tauri + WebView2) that must observe typing system-wide, in any application.

Keyboard hook: Tapomo uses a low-level keyboard hook (WH_KEYBOARD_LL) only to timestamp keystrokes and classify each one into a category (letter, space, backspace, shortcut...). It never stores or transmits characters, text or key sequences, and cannot rebuild what was typed. Injected keystrokes are ignored.

UI Automation: used only to detect password fields; measuring is paused there. Password managers (KeePass, 1Password, Bitwarden) are excluded by default.

No account, login or test credentials are needed.

How to test:
1. Install and launch Tapomo (it runs in the system tray).
2. Open Notepad and type normal text for about 15 seconds.
3. Open Tapomo from the tray icon: the speed (WPM) and the typing burst appear.
4. The Lessons tab works offline; finish a short lesson to see results and XP.

Network: nothing is sent by default. The only optional online feature is weekly anonymous stats (average speed, peak, accuracy, active minutes, app language and a random install id) sent to api.tapomo.app, plus optional friends-only leagues (nickname and weekly XP). Both are off until the user turns them on in Settings. There is no telemetry, advertising or analytics. This Store build has no self-updater.

Start with Windows is declared as a StartupTask, OFF by default; the user can enable it in Settings.

Privacy policy: https://tapomo.app/privacy.html
Source code (GPL-3.0): https://github.com/polrue/tapomo
```
