# Changelog

All notable changes to the Clip Relay Chrome Extension will be documented in this file.

## [1.0.6] - 2025-01-06

### Changed
- **Image Naming Strategy**: Images uploaded from web pages now use the page title as the filename instead of the original image filename
- Enhanced filename generation with timestamp and random suffix to ensure uniqueness when uploading multiple images from the same page
- Improved filename sanitization by removing invalid characters and replacing spaces with underscores
- Reduced page title length limit from 50 to 40 characters to accommodate timestamp and suffix

### Fixed
- Multiple images uploaded from the same page now have unique filenames to prevent file overwrites
- Filenames are properly sanitized for filesystem compatibility

## [1.0.5] - 2025-01-04

### Added
- **Image File Upload**: Right-click images now sends actual image files instead of just URLs
- Auto-download images from web pages and upload as FILE type
- Automatic filename extraction from image URL
- Auto-close popup after 5 seconds when content is sent successfully
- Mouse hover detection to pause auto-close timer
- Popup stays open when mouse is over it
- Downloading notification when fetching images

### Changed
- "Send image to Clip Relay" now uploads image files instead of image URLs
- Removed "Content sent successfully!" notification display
- Improved popup loading logic with better error handling
- Increased background script delay from 200ms to 500ms for better popup initialization

### Fixed
- Popup now correctly loads and displays iframe when auto-opened
- Fixed iframe refresh logic with better cross-origin handling

## [1.0.4] - 2025-01-04

### Changed
- **Major Simplification**: Complete redesign to embed backend web interface directly in popup
- Removed 70% of extension code for better maintainability
- Popup now displays backend web interface in iframe (800x600)
- Removed complex features in favor of backend functionality

### Removed
- Extension-internal history list
- Extension-internal QR code display
- Notification action buttons
- Auto-QR functionality
- Local data storage
- Complex view switching

### Added
- iframe embedding of backend web interface
- Auto-refresh after sending content
- Direct access to all backend features
- Auto-open popup after successful send
- Login state persistence via cookies

### Fixed
- Popup width adjusted from 800px to 400px
- iframe only loads once to maintain login state
- Popup automatically opens after sending content

## [1.0.3] - 2025-01-04

### Added
- History-first default view showing recent 10 items
- Automatic history saving (stores up to 50 items)
- Quick action buttons (QR and Copy) on each history item
- Intelligent relative time formatting
- Content type icons (📝 Text, 🔗 Link, 🖼️ Image)

### Changed
- Complete interface redesign with history as default view
- Settings moved to collapsible icon in top-right corner
- Removed tab navigation in favor of view-based navigation
- Three separate views: History, Settings, QR Code

### Improved
- Faster access to recent items
- Cleaner, card-based layout
- Better user experience with less clutter

## [1.0.2] - 2025-01-04

### Added
- QR codes now display directly in extension popup
- Tab-based interface with "Settings" and "QR Code" tabs
- Auto-QR opens popup automatically and switches to QR Code tab
- QR code actions: Copy, Open, Download, New Tab

### Changed
- Popup width increased from 380px to 450px
- QR codes no longer open in new browser tabs
- Improved notification actions to open popup instead of new tab

### Improved
- Faster QR code access
- Cleaner browser experience without tab clutter
- Seamless user experience

## [1.0.1] - 2025-01-04

### Fixed
- Notification buttons now work correctly
- QR codes generate properly with automatic share link creation
- Copy to clipboard functionality in Chrome's service worker environment
- Better error handling with more informative messages

### Added
- `getShareLink()` and `createShareLink()` methods in api.js
- Automatic share link creation after creating clipboard items
- Share link information storage in local storage

## [1.0.0] - 2025-01-04

### Added
- Initial release
- Context menu integration for sending text, links, and images
- QR code generation for shared content
- Enhanced notifications with content preview
- Configurable settings (server URL and password)
- Share link management
- Chrome extension manifest v3 support

### Features
- Right-click to send selected text, links, or images to Clip Relay
- Automatic QR code generation
- Success/failure notifications
- Easy server configuration
- Copy and open share links from notifications

---

## Version History Summary

- **v1.0.6**: Image naming using page title with unique timestamp suffix
- **v1.0.5**: Auto-close popup with hover detection
- **v1.0.4**: Major simplification - iframe backend integration
- **v1.0.3**: History-first interface redesign
- **v1.0.2**: QR codes in popup with tabs
- **v1.0.1**: Bug fixes for notifications and QR codes
- **v1.0.0**: Initial release

## Compatibility

All versions require:
- Chrome 88+ (or Chromium-based browsers)
- Clip Relay server with proper CORS configuration
- Server password for authentication

## Migration Notes

### Upgrading to v1.0.6
- All settings preserved
- No data migration needed
- Image naming behavior changed to use page titles instead of original filenames
- Simply reload the extension

### Upgrading to v1.0.5
- All settings preserved
- No data migration needed
- Simply reload the extension

### Upgrading to v1.0.4
- Settings automatically preserved
- Local history cleared (no longer needed)
- QR code cache cleared (no longer needed)
- Server must support iframe embedding (CORS configuration)

### Upgrading to v1.0.3
- All settings preserved
- History starts fresh (old items not migrated)
- Only items sent after v1.0.3 appear in history

### Upgrading to v1.0.2
- All settings and stored data remain compatible
- No data migration needed

## Known Issues

### v1.0.5
- Auto-close timer only pauses when mouse enters popup, doesn't resume when mouse leaves

### v1.0.4
- iframe may show blank if server blocks embedding
- Manual login required in iframe if ALLOW_QUERY_AUTH not enabled

### v1.0.3
- History only shows items sent after v1.0.3
- No search functionality for history
- Cannot delete individual history items

### v1.0.2
- Popup auto-open may not work in all contexts
- Falls back to new tab if popup can't open

## Future Enhancements

Potential improvements for future versions:
- Resume auto-close timer when mouse leaves popup
- History search functionality
- Delete individual history items
- Usage statistics
- Tags/categories for items
- Favorites system
- Export history
- Sync across devices
- Customizable QR code size and colors
- Keyboard shortcuts
