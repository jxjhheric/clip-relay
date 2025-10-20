// popup.js
let isIframeLoading = false; // 标志iframe是否正在加载

document.addEventListener('DOMContentLoaded', async function() {
  // 绑定配置面板切换事件
  document.getElementById('config-toggle').addEventListener('click', toggleConfigPanel);
  
  // 绑定配置保存事件
  document.getElementById('save-config').addEventListener('click', saveConfig);
  
  // 监听来自background script的消息
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'CONTENT_SENT' && message.data) {
      refreshServerPageWithNewContent(message.data);
    }
  });
  
  // 显示服务器页面
  await showServerPage();
});

async function showServerPage() {
  const iframe = document.getElementById('server-iframe');
  const config = await chrome.storage.sync.get(['clipRelayUrl']);
  const serverUrl = config.clipRelayUrl || 'http://localhost:8087';
  
  // 避免重复加载相同的URL
  if (iframe.src !== serverUrl) {
    isIframeLoading = true;
    // 尝试加载服务器页面
    iframe.src = serverUrl;
    
    // 检查是否可以访问服务器
    iframe.onload = function() {
      // 加载成功 - 现在检查是否需要根据最新分享重定向
      setTimeout(() => {
        checkAuthAndRedirect();
        isIframeLoading = false;
      }, 100); // 添加短暂延迟，确保iframe完全加载后再重定向
    };
    
    iframe.onerror = function() {
      isIframeLoading = false;
      iframe.src = 'data:text/html,<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">无法连接到服务器</div>';
    };
  }
}

async function refreshServerPageWithNewContent(newContentData) {
  // 当新内容发送时，更新iframe显示分享页面
  const config = await chrome.storage.sync.get(['clipRelayUrl']);
  const serverUrl = config.clipRelayUrl || 'http://localhost:8087';
  
  if (newContentData && newContentData.share) {
    const shareToken = newContentData.share.token;
    const shareUrl = `${serverUrl}/s/?token=${shareToken}`;
    const iframe = document.getElementById('server-iframe');
    
    // 只有当URL不同时才更新，避免不必要的重载
    if (iframe.src !== shareUrl) {
      isIframeLoading = true;
      iframe.src = shareUrl;
      // 等待iframe加载完成
      iframe.onload = function() {
        isIframeLoading = false;
      };
    }
  }
}

async function checkAuthAndRedirect() {
  // 避免在iframe加载过程中进行重定向
  if (isIframeLoading) {
    return;
  }
  
  // 获取最近的分享链接，如果有的话，重定向到那个页面
  const result = await chrome.storage.local.get(['lastShare']);
  const config = await chrome.storage.sync.get(['clipRelayUrl']);
  const serverUrl = config.clipRelayUrl || 'http://localhost:8087';
  
  if (result.lastShare && result.lastShare.share) {
    // 如果有最近的分享，导航到分享页面
    const shareToken = result.lastShare.share.token;
    const shareUrl = `${serverUrl}/s/?token=${shareToken}`;
    const iframe = document.getElementById('server-iframe');
    
    // 只有当URL不同时才更新，避免不必要的重载
    if (iframe.src !== shareUrl) {
      isIframeLoading = true;
      iframe.src = shareUrl;
      // 等待iframe加载完成
      iframe.onload = function() {
        isIframeLoading = false;
      };
    }
  }
}

function toggleConfigPanel() {
  const panel = document.getElementById('config-panel');
  const isVisible = panel.style.display !== 'none';
  
  if (isVisible) {
    panel.style.display = 'none';
    // Refresh the server page when hiding config
    showServerPage();
  } else {
    panel.style.display = 'block';
    // Load config into the form
    loadConfig();
  }
}

function loadConfig() {
  chrome.storage.sync.get(['clipRelayUrl', 'clipRelayPassword'], function(result) {
    if (result.clipRelayUrl) {
      document.getElementById('server-url').value = result.clipRelayUrl;
    }
    if (result.clipRelayPassword) {
      document.getElementById('server-password').value = result.clipRelayPassword;
    }
  });
}

async function saveConfig() {
  const statusEl = document.getElementById('config-status');
  const serverUrl = document.getElementById('server-url').value.trim();
  const serverPassword = document.getElementById('server-password').value.trim();
  
  if (!serverUrl) {
    showConfigStatus('请填写服务器地址', 'error');
    return;
  }
  
  try {
    // 验证配置
    const response = await fetch(`${serverUrl}/api/health`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error(`服务器不可达: ${response.status} ${response.statusText}`);
    }
    
    // 保存配置
    await chrome.storage.sync.set({
      clipRelayUrl: serverUrl,
      clipRelayPassword: serverPassword
    });
    
    showConfigStatus('配置已保存', 'success');
    
    // 更新background脚本中的配置
    chrome.runtime.sendMessage({
      type: 'CONFIG_UPDATE',
      url: serverUrl,
      password: serverPassword
    });
    
    // 切换回服务器页面后刷新
    setTimeout(() => {
      document.getElementById('config-panel').style.display = 'none';
      showServerPage();
    }, 1000);
  } catch (error) {
    console.error('保存配置失败:', error);
    showConfigStatus(`保存失败: ${error.message}`, 'error');
  }
}

function showConfigStatus(message, type) {
  const statusEl = document.getElementById('config-status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}