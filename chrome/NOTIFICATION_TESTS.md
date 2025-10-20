# Testing Enhanced Notifications

## Test Cases

### 1. Text Content Preview
- Select a short text (less than 60 characters)
- Send to Clip Relay
- Verify notification shows: "Clip Relay - 发送成功" with the full text

### 2. Long Text Content
- Select a long text (more than 60 characters)
- Send to Clip Relay
- Verify notification shows: "Clip Relay - 发送成功" with truncated text + "..."

### 3. URL Content
- Right-click on a URL link
- Send to Clip Relay
- Verify notification shows: "Clip Relay - 发送成功" with "🔗 [hostname][path]" format

### 4. Whitespace Handling
- Select text with multiple spaces/tabs/newlines
- Send to Clip Relay
- Verify notification shows: normalized single spaces only

### 5. Empty Content (Edge Case)
- Try to send empty content (if possible)
- Verify notification gracefully handles this case

### 6. Notification Icon and Behavior
- Verify the notification shows the Clip Relay icon
- Verify notification disappears automatically after a short time
- Verify clicking notification doesn't have unexpected behavior