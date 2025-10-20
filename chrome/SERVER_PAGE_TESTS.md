# Testing Server Page in Popup

## Changes Implemented

1. Popup now displays the Clip Relay server page directly in an iframe
2. When content is sent, the popup shows the relevant share page
3. Added configuration panel that can be toggled via gear icon
4. Refreshes server page when new content is sent

## Test Cases

### 1. Initial Popup Load
- Click extension icon without sending anything
- Verify main Clip Relay server page loads in iframe
- Check that configuration panel is hidden by default

### 2. Send Content and View Share Page
- Select text/link and send to Clip Relay via context menu
- Click extension icon
- Verify popup shows the specific share page for the sent content
- Check that URL in iframe matches the share token

### 3. Configuration Panel
- Click gear icon in popup header
- Verify configuration panel appears
- Update server URL/password
- Click save and verify configuration is saved
- Close config panel and verify server page reloads

### 4. Server Authentication
- With server requiring password, verify auth page appears
- Check that user can log in through the iframe

### 5. Error Handling
- Try with unreachable server URL
- Verify appropriate error message appears in iframe
- Check that configuration can still be updated to fix the issue

### 6. Back Navigation
- After viewing a share page, verify user can navigate back to main page
- Check that other server functionality works within iframe