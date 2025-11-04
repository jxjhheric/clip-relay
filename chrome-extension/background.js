// Import API client
importScripts('api.js');

// Initialize context menu on install
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu items
  chrome.contextMenus.create({
    id: 'sendToClipRelay',
    title: 'Send to Clip Relay',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'sendLinkToClipRelay',
    title: 'Send link to Clip Relay',
    contexts: ['link']
  });

  chrome.contextMenus.create({
    id: 'sendImageToClipRelay',
    title: 'Send image to Clip Relay',
    contexts: ['image']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let content = '';
  let type = 'TEXT';
  let contentPreview = '';

  if (info.menuItemId === 'sendToClipRelay' && info.selectionText) {
    content = info.selectionText;
    type = 'TEXT';
    contentPreview = content.length > 100 ? content.substring(0, 100) + '...' : content;
  } else if (info.menuItemId === 'sendLinkToClipRelay' && info.linkUrl) {
    content = info.linkUrl;
    type = 'TEXT';
    contentPreview = content;
  } else if (info.menuItemId === 'sendImageToClipRelay' && info.srcUrl) {
    content = info.srcUrl;
    type = 'TEXT';
    contentPreview = 'Image URL: ' + content;
  }

  if (content) {
    await sendToClipRelay(content, type, contentPreview);
  }
});

// Send content to Clip Relay
async function sendToClipRelay(content, type, contentPreview) {
  try {
    // Get settings
    const settings = await chrome.storage.sync.get(['serverUrl', 'password', 'showNotifications']);

    if (!settings.serverUrl || !settings.password) {
      showNotification('Configuration Error', 'Please configure server URL and password in extension settings', 'error');
      return;
    }

    // Create API client
    const api = new ClipRelayAPI(settings.serverUrl, settings.password);

    // Send to server
    const item = await api.createClipboardItem(content, type);

    // Show success notification
    if (settings.showNotifications !== false) {
      showNotification(
        'Sent to Clip Relay',
        contentPreview,
        'success'
      );
    }

    // Auto-open popup to show the result
    try {
      await chrome.action.openPopup();
    } catch (error) {
      // openPopup() may fail in some contexts, that's okay
      console.log('Could not auto-open popup:', error.message);
    }

    // Notify popup to refresh (if open)
    // Wait longer to ensure popup is fully loaded
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'refresh' }).catch(() => {
        // Popup might not be open yet, ignore error
      });
    }, 500);

  } catch (error) {
    console.error('Error sending to Clip Relay:', error);
    showNotification('Send Failed', error.message, 'error');
  }
}

// Show notification
function showNotification(title, message, type) {
  const notificationOptions = {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: title,
    message: message,
    priority: 2,
    requireInteraction: false
  };

  chrome.notifications.create('clipRelay_' + Date.now(), notificationOptions, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.error('Notification error:', chrome.runtime.lastError);
    } else {
      console.log('Notification created:', notificationId);
    }
  });
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendToClipRelay') {
    sendToClipRelay(request.content, request.type || 'TEXT', request.preview || request.content)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }
});
