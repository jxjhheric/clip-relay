// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  // Load settings
  const settings = await chrome.storage.sync.get(['serverUrl', 'password', 'showNotifications']);

  if (settings.serverUrl && settings.password) {
    // Settings configured, show web interface
    showWebView(settings.serverUrl, settings.password);
  } else {
    // First time setup, show settings
    showSettingsView();
  }

  // Setup event listeners
  setupEventListeners();
});

// Show settings view
function showSettingsView() {
  document.getElementById('settingsView').classList.remove('hidden');
  document.getElementById('webView').classList.add('hidden');

  // Load existing settings if any
  chrome.storage.sync.get(['serverUrl', 'password', 'showNotifications']).then(settings => {
    if (settings.serverUrl) {
      document.getElementById('serverUrl').value = settings.serverUrl;
    }
    if (settings.password) {
      document.getElementById('password').value = settings.password;
    }
    document.getElementById('showNotifications').checked = settings.showNotifications !== false;
  });
}

// Show web interface view
function showWebView(serverUrl, password) {
  document.getElementById('settingsView').classList.add('hidden');
  document.getElementById('webView').classList.remove('hidden');

  // Always ensure iframe is loaded
  const webFrame = document.getElementById('webFrame');
  if (!webFrame.src || webFrame.src === 'about:blank') {
    // First time loading
    loadWebInterface(serverUrl, password);
  } else {
    // Already has src, make sure it's visible
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
    webFrame.classList.remove('hidden');
  }
}

// Load web interface in iframe
function loadWebInterface(serverUrl, password) {
  const loadingState = document.getElementById('loadingState');
  const webFrame = document.getElementById('webFrame');
  const errorState = document.getElementById('errorState');

  // Show loading
  loadingState.classList.remove('hidden');
  webFrame.classList.add('hidden');
  errorState.classList.add('hidden');

  // Construct URL with auth parameter if supported
  let iframeUrl = serverUrl;

  // Check if server allows query auth
  chrome.storage.sync.get(['allowQueryAuth']).then(({ allowQueryAuth }) => {
    if (allowQueryAuth) {
      iframeUrl = `${serverUrl}?auth=${encodeURIComponent(password)}`;
    }

    // Set iframe source
    webFrame.src = iframeUrl;

    // Handle iframe load
    webFrame.onload = () => {
      loadingState.classList.add('hidden');
      webFrame.classList.remove('hidden');
    };

    // Handle iframe error
    webFrame.onerror = () => {
      loadingState.classList.add('hidden');
      errorState.classList.remove('hidden');
      document.getElementById('errorMessage').textContent = 'Failed to load server interface';
    };

    // Timeout fallback
    setTimeout(() => {
      if (!webFrame.classList.contains('hidden')) {
        return; // Already loaded
      }
      if (loadingState.classList.contains('hidden')) {
        return; // Already errored
      }

      // Still loading after 10 seconds, show iframe anyway
      loadingState.classList.add('hidden');
      webFrame.classList.remove('hidden');
    }, 10000);
  });
}

// Setup event listeners
function setupEventListeners() {
  // Settings form submit
  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const serverUrl = document.getElementById('serverUrl').value.trim().replace(/\/$/, '');
    const password = document.getElementById('password').value;
    const showNotifications = document.getElementById('showNotifications').checked;

    // Test connection first
    showStatus('Testing connection...', 'info');

    try {
      const response = await fetch(`${serverUrl}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Save settings
          await chrome.storage.sync.set({
            serverUrl,
            password,
            showNotifications
          });

          showStatus('Connected successfully!', 'success');

          // Show web interface after a short delay
          setTimeout(() => {
            showWebView(serverUrl, password);
          }, 1000);
        } else {
          showStatus('Authentication failed', 'error');
        }
      } else {
        showStatus(`Connection failed: ${response.status}`, 'error');
      }
    } catch (error) {
      showStatus(`Connection error: ${error.message}`, 'error');
    }
  });

  // Settings button in web view
  document.getElementById('settingsBtn').addEventListener('click', () => {
    showSettingsView();
  });

  // Retry button
  document.getElementById('retryBtn').addEventListener('click', async () => {
    const settings = await chrome.storage.sync.get(['serverUrl', 'password']);
    if (settings.serverUrl && settings.password) {
      loadWebInterface(settings.serverUrl, settings.password);
    }
  });
}

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;

  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 3000);
}

// Auto-close timer management
let autoCloseTimer = null;
let isMouseInPopup = false;

// Setup mouse hover detection to pause auto-close
function setupAutoCloseWithHoverDetection() {
  document.body.addEventListener('mouseenter', () => {
    console.log('Mouse entered popup, pausing auto-close');
    isMouseInPopup = true;
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  });

  document.body.addEventListener('mouseleave', () => {
    console.log('Mouse left popup');
    isMouseInPopup = false;
  });
}

// Start auto-close timer
function startAutoCloseTimer() {
  // Clear any existing timer
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
  }

  // Only start timer if mouse is not in popup
  if (!isMouseInPopup) {
    console.log('Starting auto-close timer (5 seconds)');
    autoCloseTimer = setTimeout(() => {
      console.log('Closing popup after 5 seconds');
      window.close();
    }, 5000);
  } else {
    console.log('Mouse in popup, auto-close timer not started');
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'refresh') {
    console.log('Received refresh message');

    // First ensure we're showing the web view
    chrome.storage.sync.get(['serverUrl', 'password']).then(settings => {
      console.log('Settings loaded:', { hasUrl: !!settings.serverUrl, hasPassword: !!settings.password });

      if (settings.serverUrl && settings.password) {
        // Make sure web view is visible
        document.getElementById('settingsView').classList.add('hidden');
        document.getElementById('webView').classList.remove('hidden');

        // Refresh the iframe content
        const webFrame = document.getElementById('webFrame');
        if (webFrame) {
          console.log('WebFrame found, src:', webFrame.src);
          try {
            // Check if iframe is already loaded
            if (webFrame.src && webFrame.src !== 'about:blank') {
              console.log('Iframe already loaded, refreshing');
              // Hide loading/error states and show iframe
              document.getElementById('loadingState').classList.add('hidden');
              document.getElementById('errorState').classList.add('hidden');
              webFrame.classList.remove('hidden');

              // Try to reload the iframe
              try {
                webFrame.contentWindow.location.reload();
                console.log('Iframe reloaded successfully');
              } catch (e) {
                console.log('Cross-origin reload failed, reloading src');
                // If reload fails due to cross-origin, just reload the src
                const currentSrc = webFrame.src;
                webFrame.src = '';
                setTimeout(() => {
                  webFrame.src = currentSrc;
                }, 10);
              }
            } else {
              console.log('Iframe not loaded, loading now');
              // If iframe not loaded yet, load it now
              loadWebInterface(settings.serverUrl, settings.password);
            }
          } catch (error) {
            console.error('Error refreshing iframe:', error);
            // If anything fails, try loading from scratch
            loadWebInterface(settings.serverUrl, settings.password);
          }
        } else {
          console.error('WebFrame not found');
        }

        // Setup hover detection and start auto-close timer
        setupAutoCloseWithHoverDetection();
        startAutoCloseTimer();
      }
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error in refresh handler:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep the message channel open for async response
  }
  return true;
});

// Show send notification in popup
function showSendNotification(message, type = 'success') {
  const notification = document.getElementById('sendNotification');
  const textEl = document.getElementById('sendNotificationText');

  if (!notification || !textEl) {
    console.error('Notification elements not found');
    return;
  }

  // Clear any existing timeout
  if (window.notificationTimeout) {
    clearTimeout(window.notificationTimeout);
  }

  textEl.textContent = message;

  if (type === 'error') {
    notification.classList.add('error');
  } else {
    notification.classList.remove('error');
  }

  // Force reflow to restart animation
  notification.classList.add('hidden');
  void notification.offsetWidth; // Trigger reflow
  notification.classList.remove('hidden');

  // Hide after 5 seconds
  window.notificationTimeout = setTimeout(() => {
    notification.classList.add('hidden');
  }, 5000);
}
