# Testing Unified Notification Format

## Changes Implemented

1. Added content type detection with appropriate icons
2. Extended notification display time to 7 seconds for better readability
3. Added content type icons to match Clip Relay UI style:
   - 📝 for TEXT
   - 🖼️ for IMAGE  
   - 📎 for FILE
   - 📄 for default/unknown types

## Test Cases

### 1. Text Content Notification
- Select text content
- Send to Clip Relay
- Verify notification shows: "📝 [text content preview]"

### 2. URL/Link Content Notification
- Right-click on a link
- Send to Clip Relay
- Verify notification shows: "🔗 [hostname/path]" with link icon

### 3. Different Content Types
- If server responds with type information, verify proper icon is used:
  - TEXT → 📝
  - IMAGE → 🖼️
  - FILE → 📎
  - Unknown → 📄

### 4. Long Content Truncation
- Send content longer than 80 characters
- Verify notification shows: "[icon] [truncated content with ...]"

### 5. Notification Duration
- Verify notification stays visible for ~7 seconds
- Should be long enough to read the content preview

### 6. Error Notifications
- Try with wrong server details
- Verify error notifications still work properly