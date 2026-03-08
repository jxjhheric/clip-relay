# Mobile Shell Architecture

## Phase 0: bootstrap and handoff

Done in this commit:

- define a stable connection-bundle format on the web side
- export that bundle from the settings drawer
- add a `mobile/` workspace with a thin bootstrap screen
- support bundle import, validation, display, and local persistence

## Phase 1: Android-first shell

Target:

- add Android project with Capacitor
- show the bootstrap screen until a valid bundle exists
- after import, open an authenticated webview pointed at `serverUrl`
- inject the saved bearer token into app-managed API requests where needed

Notes:

- the shell should not own core product logic yet
- the shell should only own mobile-native entry points and stored connection state

## Phase 2: native quick actions

Target:

- choose photo from gallery
- capture photo from camera
- receive `ACTION_SEND` and `ACTION_SEND_MULTIPLE` on Android
- normalize incoming payloads into one upload pipeline

Suggested routing:

- text -> POST `/api/clipboard/text`
- file/image -> reuse the existing upload endpoint used by the web UI

## Phase 3: embedded product surface

Target:

- open the main Clip Relay interface inside the app after bundle import
- keep a native fallback screen for diagnostics and reconnection
- add a quick-action launcher before the webview is fully loaded

## Phase 4: iPhone follow-up

Target:

- add iOS Capacitor target
- keep normal in-app usage working first
- later decide whether Share Extension is worth the extra maintenance cost

## Non-goals for the first Android milestone

- full offline sync
- local SQLite mirror on device
- rewriting the full web UI as a native app
- replacing the current Rust backend contract
