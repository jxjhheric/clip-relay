# Chrome Extension Test Script

## Test Cases

### 1. Successful Content Transmission
- Select text on a webpage
- Right-click and select "发送到剪贴板"
- Verify success notification appears
- Verify popup opens with QR code
- Verify share URL is displayed correctly
- Verify QR code links to correct share page

### 2. Link Transmission
- Right-click on a link
- Select "发送到剪贴板"
- Verify link URL is sent instead of page text
- Verify QR code and URL work correctly

### 3. Server Configuration
- Set custom server URL in popup
- Verify configuration is saved
- Verify it works with the configured server

### 4. Error Handling
- Try with wrong password
- Try with unreachable server
- Verify appropriate error messages appear

### 5. QR Code and Link Functionality
- Click "复制链接" - verify link is copied to clipboard
- Click "在新标签页打开" - verify link opens in new tab
- Scan QR code with phone - verify it leads to share page