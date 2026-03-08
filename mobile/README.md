# Clip Relay Mobile Shell

This folder is the starting point for the thin mobile app.

## Goal

Reuse the existing web product, but move the mobile-only entry points into native code:

- import a connection bundle exported from the web app
- persist server URL, API base, and device token locally
- add Android share-intent handling for text, images, and files
- add camera and photo-picker shortcuts
- keep the existing Clip Relay web UI as the main surface

## Why this folder exists now

The PWA path is already good enough for install experiments, but system share-sheet integration is still unreliable across mobile browsers. This shell gives us a more controllable Android path first, then leaves room for iPhone support later.

## Current contents

- `package.json`: Capacitor + Vite workspace definition
- `capacitor.config.ts`: shell metadata
- `src/`: bootstrap UI that can import the exported `clip-relay-connection.json`
- `src/api.ts`: direct text/file upload helpers against the current Rust API
- `android/`: generated Capacitor Android project
- `scripts/run-gradle.ps1`: workspace-local Gradle launcher with bundled JDK/SDK env
- `docs/architecture.md`: implementation phases and native integration plan

## What already works

- import the connection bundle exported by the web app
- save that bundle locally inside the shell
- test the remote server connection
- send plain text directly to `/api/clipboard`
- send files/images directly to `/api/clipboard`
- receive Android share-intent metadata into the shell UI
- sync the built mobile assets into the generated Android project

## Local prerequisites

- Node.js 20+
- Android Studio / Android SDK for device debugging if you want emulator tooling
- The workspace now also contains a local JDK 21 + Android command-line SDK setup for Gradle

## Useful commands

```bash
cd mobile
npm install
npm run dev
npm run build
npx cap sync android
npm run android:help
npm run android:assembleDebug
npx cap open android
```

## Notes on the Windows setup here

- local JDK path: `F:\Clipboard\tools\jdk-21`
- local Android SDK path: `F:\Clipboard\mobile\android-sdk`
- local Gradle home/cache path: `F:\Clipboard\tools\gradle-home`
- local Gradle launcher wrapper: `F:\Clipboard\mobile\scripts\run-gradle.ps1`

The Gradle bootstrap now gets past the earlier `JAVA_HOME` / SDK missing issues. If a full Android build still stalls on this machine, run `npm run android:help` or `npm run android:assembleDebug` in a normal PowerShell window outside Codex as the next verification step.

## Expected next steps

1. confirm `assembleDebug` completes in a normal PowerShell / Android Studio session
2. resolve shared `content://` URIs into uploadable file bytes on Android
3. route native incoming file payloads into the same `src/api.ts` upload helpers
4. add camera and gallery shortcuts
5. embed the main Clip Relay interface once connection bootstrap is complete

## Bundle contract

The shell expects the JSON exported by the web app settings drawer. Current format:

```json
{
  "schemaVersion": 1,
  "app": "clip-relay",
  "serverUrl": "https://example.com",
  "apiBase": "https://example.com",
  "accessToken": "...",
  "generatedAt": "2026-03-08T00:00:00.000Z"
}
```

The web side now produces this shape from `F:\Clipboard\src\lib\mobile-connection.ts`.

