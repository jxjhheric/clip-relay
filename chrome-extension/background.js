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
    await sendToClipRelay(content, type, contentPreview);
  } else if (info.menuItemId === 'sendLinkToClipRelay' && info.linkUrl) {
    content = info.linkUrl;
    type = 'TEXT';
    contentPreview = content;
    await sendToClipRelay(content, type, contentPreview);
  } else if (info.menuItemId === 'sendImageToClipRelay' && info.srcUrl) {
    // Download image and send as file
    await sendImageToClipRelay(info.srcUrl, tab.title);
  }
});

// Send image to Clip Relay as file
async function sendImageToClipRelay(imageUrl, pageTitle) {
  try {
    // Get settings
    const settings = await chrome.storage.sync.get(['serverUrl', 'password', 'showNotifications']);

    if (!settings.serverUrl || !settings.password) {
      showNotification('Configuration Error', 'Please configure server URL and password in extension settings', 'error');
      return;
    }

    // Show downloading notification
    if (settings.showNotifications !== false) {
      showNotification('Downloading Image', 'Fetching image from URL...', 'success');
    }

    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const blob = await response.blob();

    // Generate filename using page title with timestamp for uniqueness
    let filename = 'image';
    try {
      // Clean up page title for filename (remove invalid characters)
      const cleanTitle = pageTitle
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .substring(0, 40); // Limit length to make room for timestamp

      // Use blob type to determine extension
      const extension = blob.type.split('/')[1] || 'png';

      // Add timestamp to ensure uniqueness for multiple images from same page
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 6); // Add random 4-char suffix

      if (cleanTitle && cleanTitle.trim()) {
        filename = `${cleanTitle}_${timestamp}_${randomSuffix}.${extension}`;
      } else {
        filename = `image_${timestamp}_${randomSuffix}.${extension}`;
      }
    } catch (e) {
      // Use blob type to determine extension
      const extension = blob.type.split('/')[1] || 'png';
      const timestamp = Date.now();
      filename = `image_${timestamp}.${extension}`;
    }

    // Create File object from Blob
    const file = new File([blob], filename, { type: blob.type });

    // Create API client
    const api = new ClipRelayAPI(settings.serverUrl, settings.password);

    // Send to server as FILE type
    const item = await api.createClipboardItem(file, 'FILE');

    // Show success notification
    if (settings.showNotifications !== false) {
      showNotification(
        'Sent to Clip Relay',
        `Image file: ${filename}`,
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
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'refresh' }).catch(() => {
        // Popup might not be open yet, ignore error
      });
    }, 500);

  } catch (error) {
    console.error('Error sending image to Clip Relay:', error);
    showNotification('Send Failed', error.message, 'error');
  }
}

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
