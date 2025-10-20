# Testing Clip Relay Chrome Extension

## Manual Testing Steps

### 1. Setup
- Make sure Clip Relay server is running (default: http://localhost:8087)
- Have your access password ready
- Install the Chrome extension in developer mode

### 2. Configuration Test
- Click the extension icon in Chrome toolbar
- Enter server URL (e.g., http://localhost:8087) 
- Enter your Clip Relay password
- Click "Save Configuration"
- Verify "配置已保存" (Configuration saved) message appears

### 3. Context Menu Test
- Go to any webpage
- Select some text
- Right-click to open context menu
- Verify "发送到剪贴板" (Send to clipboard) option appears
- Right-click on a link
- Verify the same menu option appears

### 4. Content Sending Test
- Select text on a webpage
- Click "发送到剪贴板"
- If successful, the extension popup should open automatically
- The popup should show:
  - A QR code
  - The share URL
  - Copy and open buttons

### 5. Link Sending Test
- Right-click on any link
- Click "发送到剪贴板"
- Verify the link URL was sent correctly
- Check the share URL in the popup contains the link

### 6. QR Code Test
- Verify QR code is generated correctly
- Scan the QR code with a QR reader app
- Verify it redirects to the correct share page

### 7. Copy and Open Test
- Click "复制链接" (Copy link) button
- Verify the URL is copied to clipboard
- Click "在新标签页打开" (Open in new tab) button
- Verify the share page opens in a new tab

### 8. Error Handling Test
- Try with wrong server password
- Try with invalid server URL
- Try sending without selecting content
- Verify appropriate error messages appear

## Expected Behavior

- Context menu should appear for text selection and links
- Content should be successfully sent to Clip Relay server
- Share URL and QR code should be generated correctly
- Configuration should persist between sessions
- All UI elements should be responsive and intuitive

## Common Issues

- If the popup doesn't open, check if the content was successfully sent to the server
- If QR code doesn't appear, verify that the correct share URL was returned
- If configuration doesn't save, check Chrome's storage API permissions
- If context menu doesn't appear, verify the extension is enabled