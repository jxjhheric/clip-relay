# Clip Relay Chrome Extension

A Chrome extension that allows you to send selected text, links, and images directly to your Clip Relay server. The extension provides a seamless interface to your Clip Relay backend, displaying the full web interface directly in the popup.

## Features

- **Context Menu Integration**: Right-click to send selected text, links, or images to Clip Relay
- **Image File Upload**: Automatically downloads and uploads images as files (not just URLs)
- **Backend Web Interface**: Full Clip Relay web interface embedded in popup (400x600)
- **Auto-Open Popup**: Popup automatically opens after sending content
- **Smart Auto-Close**: Popup closes after 5 seconds, pauses when mouse hovers
- **Enhanced Notifications**: Success/failure notifications with content preview
- **Configurable Settings**: Easy setup with server URL and password
- **Login State Persistence**: Maintains login state via cookies

## Installation

### From Source

1. **Clone or download this repository**
   ```bash
   git clone <repository-url>
   cd clip-relay-main/chrome-extension
   ```

2. **Generate Icons** (Required before loading)
   - Open `icons/generate-icons.html` in your browser
   - Click "Download All Icons" button
   - Save all four PNG files (icon16.png, icon32.png, icon48.png, icon128.png) to the `icons/` directory

   Alternatively, see `icons/ICON_GENERATION.md` for other methods.

3. **Load the extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

4. **Configure the extension**
   - Click the extension icon in the toolbar
   - Enter your Clip Relay server URL (e.g., `http://localhost:8087`)
   - Enter your server password (the `CLIPBOARD_PASSWORD` from your server config)
   - Click "Save Settings"
   - Optionally click "Test Connection" to verify

## Usage

### Sending Content to Clip Relay

1. **Send Selected Text**
   - Select any text on a webpage
   - Right-click and choose "Send to Clip Relay"

2. **Send Links**
   - Right-click on any link
   - Choose "Send link to Clip Relay"

3. **Send Images**
   - Right-click on any image
   - Choose "Send image to Clip Relay"
   - The extension will download and upload the image file (not just the URL)

### Using the Backend Interface

After sending content:
1. The popup automatically opens (if not already open)
2. The backend web interface is displayed in the popup
3. Access all backend features: history, QR codes, search, etc.
4. The popup auto-closes after 5 seconds (pauses when mouse hovers)
5. Login state is maintained via cookies

## Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| Server URL | Your Clip Relay server address | `http://localhost:8087` |
| Password | Server authentication password | (required) |
| Show notifications | Display success/failure notifications | `true` |

## Server Requirements

This extension requires a running Clip Relay server. The server must:

- Be accessible from your browser (same network or public URL)
- Have the `CLIPBOARD_PASSWORD` configured
- Support CORS and allow iframe embedding (set `CORS_ALLOW_ORIGIN`)
- Not block iframe embedding with X-Frame-Options

### Server Setup

1. **Start your Clip Relay server**
   ```bash
   # Set environment variables
   export CLIPBOARD_PASSWORD="your-secure-password"
   export PORT=8087

   # Run the server
   ./clip-relay
   ```

2. **Configure CORS** (required for iframe embedding):
   ```bash
   export CORS_ALLOW_ORIGIN="chrome-extension://*"
   ```

3. **For automatic login** (optional):
   ```bash
   export ALLOW_QUERY_AUTH=1
   ```

4. **Ensure X-Frame-Options allows embedding**:
   - Set to `SAMEORIGIN` or don't set this header
   - Do not use `DENY` as it will block iframe embedding

## API Integration

The extension communicates with the following Clip Relay API endpoints:

- `POST /api/auth/verify` - Authentication (settings verification)
- `POST /api/clipboard` - Create clipboard items (when sending content)

All other features (history, QR codes, search, etc.) are accessed through the embedded backend web interface.

## Troubleshooting

### Connection Issues

**Problem**: "Connection failed" error when testing connection

**Solutions**:
- Verify the server URL is correct and accessible
- Check that the Clip Relay server is running
- Ensure the password matches your server's `CLIPBOARD_PASSWORD`
- Check browser console for CORS errors

### CORS Errors

**Problem**: CORS policy blocking requests

**Solutions**:
- Add `CORS_ALLOW_ORIGIN` to your server environment variables
- For Chrome extensions: `export CORS_ALLOW_ORIGIN="chrome-extension://*"`
- For specific origin: `export CORS_ALLOW_ORIGIN="https://yourdomain.com"`

### Authentication Errors

**Problem**: "Invalid password" or "Authentication failed"

**Solutions**:
- Verify the password in extension settings matches server config
- Check server logs for authentication attempts
- Try re-saving the settings in the extension

### iframe Not Loading

**Problem**: Popup shows blank or loading state

**Solutions**:
- Ensure server is running and accessible
- Check CORS configuration allows chrome-extension origin
- Verify X-Frame-Options doesn't block embedding
- Check browser console for errors
- Try enabling ALLOW_QUERY_AUTH for automatic login

### Icons Not Showing

**Problem**: Extension icons appear broken or missing

**Solutions**:
- Generate the PNG icons using `icons/generate-icons.html`
- Ensure all four icon sizes are present in the `icons/` directory
- Reload the extension after adding icons

## Development

### Project Structure

```
chrome-extension/
├── manifest.json           # Extension manifest (v3)
├── background.js           # Service worker (context menu, API calls)
├── api.js                  # Clip Relay API client
├── popup.html              # Popup UI (settings + iframe)
├── popup.css               # Popup styles
├── popup.js                # Popup logic (settings, iframe management)
├── CHANGELOG.md            # Version history and changes
├── README.md               # This file
└── icons/                  # Extension icons
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    ├── icon128.png
    ├── icon16.svg          # Source SVG
    ├── icon128.svg         # Source SVG
    ├── generate-icons.html # Icon generator tool
    └── ICON_GENERATION.md  # Icon generation guide
```

### Building from Source

1. Clone the repository
2. Generate icons (see Installation section)
3. Load as unpacked extension in Chrome
4. Make changes and reload the extension to test

### Testing

1. **Test Authentication**
   - Open extension popup
   - Enter server details
   - Click "Save & Continue"
   - Verify backend interface loads

2. **Test Context Menu**
   - Right-click on text/links/images
   - Verify menu items appear
   - Test sending content

3. **Test Auto-Open Popup**
   - Send content via context menu
   - Verify popup opens automatically
   - Verify iframe refreshes

4. **Test Auto-Close**
   - Send content and wait 5 seconds
   - Verify popup closes automatically
   - Test mouse hover to pause auto-close

5. **Test Backend Interface**
   - Click extension icon
   - Verify backend interface displays
   - Test all backend features (history, QR, search)

## Privacy & Security

- **Local Storage**: Settings are stored locally using Chrome's sync storage
- **No Tracking**: This extension does not collect or transmit any analytics
- **Password Storage**: Passwords are stored in Chrome's secure storage
- **HTTPS Recommended**: Use HTTPS for your Clip Relay server in production

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This extension is part of the Clip Relay project. See the main project repository for license information.

## Support

For issues, questions, or feature requests:
- Open an issue on GitHub
- Check the Clip Relay server documentation
- Review the troubleshooting section above

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

### Version 1.0.5 (Current)
- **Added**: Image file upload - sends actual image files instead of URLs
- **Added**: Auto-close popup after 5 seconds when content is sent
- **Added**: Mouse hover detection to pause auto-close timer
- **Improved**: Better popup loading logic with error handling
- **Fixed**: Popup now correctly loads and displays iframe when auto-opened
- **Changed**: Removed "Content sent successfully!" notification display

### Version 1.0.4
- **Major**: Complete simplification - extension now displays backend web interface directly
- **Removed**: 70% of code - all complex features moved to backend
- **Added**: iframe embedding of backend web interface (400x600)
- **Added**: Auto-open popup after sending content
- **Added**: Login state persistence via cookies

### Previous Versions
- **v1.0.3**: History-first interface redesign
- **v1.0.2**: QR codes in popup with tabs
- **v1.0.1**: Bug fixes for notifications and QR codes
- **v1.0.0**: Initial release
