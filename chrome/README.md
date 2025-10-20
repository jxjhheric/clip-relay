# Clip Relay Chrome Extension

This Chrome extension allows you to send selected text or links directly to your Clip Relay server and get a QR code for easy access on other devices.

## Features

- Right-click context menu to send selected text or links to Clip Relay
- QR code generation for easy sharing
- Configurable server URL and password
- Enhanced success/failure notifications with content preview and type icons
- Copy and open functionality for share links

## Installation

### Development Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" button
4. Select the `chrome-extension` folder from your Clip Relay project directory
5. The extension should now be installed and visible in your extensions list

### Configuration

1. Click on the extension icon in the toolbar
2. In the popup, enter your Clip Relay server URL (e.g., `http://localhost:8087`)
3. Enter your Clip Relay access password
4. Click "Save Configuration"

## Usage

1. Navigate to any webpage
2. Select text or right-click on a link
3. Choose "发送到剪贴板" (Send to clipboard) from the context menu
4. The content will be sent to your Clip Relay server
5. A success notification will appear
6. A popup will appear with a QR code and share link
7. You can copy the link or scan the QR code with your mobile device

## Files Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── background.js          # Background script handling context menu
├── popup.html             # Popup UI
├── popup.js               # Popup logic
├── qrcode.min.js          # QR code generation library
├── icon*.png              # Extension icons
├── README.md              # This file
├── TESTING.md             # Manual testing instructions
└── TEST_PLAN.md           # Automated test plan
```

## Troubleshooting

- If the context menu doesn't appear, make sure the extension is enabled in `chrome://extensions/`
- Verify that your server URL and password are correctly configured
- Check that your Clip Relay server is running and accessible
- Make sure the server allows the required permissions (CORS settings)

## Security Notes

- The extension sends data to the configured server URL
- Store your password securely and don't share it
- Only use with trusted Clip Relay servers