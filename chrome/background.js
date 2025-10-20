// background.js
let clipRelayUrl = 'http://localhost:8087'; // 默认服务器地址
let clipRelayPassword = ''; // 默认密码

// 读取存储的服务器配置
chrome.storage.sync.get(['clipRelayUrl', 'clipRelayPassword'], function(result) {
  if (result.clipRelayUrl) {
    clipRelayUrl = result.clipRelayUrl;
  }
  if (result.clipRelayPassword) {
    clipRelayPassword = result.clipRelayPassword;
  }
});

// 监听存储变化
chrome.storage.onChanged.addListener(function(changes, namespace) {
  for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
    if (key === 'clipRelayUrl') {
      clipRelayUrl = newValue;
    } else if (key === 'clipRelayPassword') {
      clipRelayPassword = newValue;
    }
  }
});

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sendToClipRelay',
    title: '发送到剪贴板',
    contexts: ['selection', 'link']
  });
});

// 处理右键菜单点击事件
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'sendToClipRelay') {
    // 获取选中的文本或链接
    let content = '';
    if (info.selectionText) {
      content = info.selectionText.trim();
    } else if (info.linkUrl) {
      content = info.linkUrl;
    }
    
    if (!content) {
      console.error('没有选中任何内容');
      return;
    }

    try {
      // 发送到Clip Relay服务器
      const response = await sendToServer(content);
      
      // 根据服务器响应格式，检查是否存在share信息
      if (response.id && response.share) {
        // 存储分享链接供弹窗使用 - 使用完整的服务器响应数据
        await chrome.storage.local.set({ 
          lastShare: response  // Store the full response from server
        });
        
        // 发送消息到所有popup页面以刷新内容
        // 获取所有活动的popup窗口并通知它们更新
        try {
          const tabs = await chrome.tabs.query({active: true, currentWindow: true});
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {type: 'CONTENT_SENT', data: response}).catch(() => {
              // If popup is not open, that's OK - just continue
            });
          }
        } catch (e) {
          console.log("Could not send message to popup, likely not open");
        }
        
        // 打开弹窗显示服务器页面
        chrome.action.openPopup();
      } else {
        console.error('发送到服务器失败:', response.error);
        const errorNotificationId = 'clip-relay-error-' + Date.now();
        chrome.notifications.create(errorNotificationId, {
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'Clip Relay Error',
          message: '发送到Clip Relay服务器失败: ' + (response.error || '服务器响应格式不正确')
        }).catch(error => {
          console.error('Failed to create error notification:', error);
        });
      }
    } catch (error) {
      console.error('发送到服务器时出错:', error);
      const errorNotificationId = 'clip-relay-error-' + Date.now();
      chrome.notifications.create(errorNotificationId, {
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'Clip Relay Error',
        message: '发送到Clip Relay服务器时出错: ' + error.message
      }).catch(notificationError => {
        console.error('Failed to create error notification:', notificationError);
      });
    }
  }
});

async function sendToServer(content) {
  const formData = new FormData();
  formData.append('type', 'TEXT');
  formData.append('content', content);
  
  const response = await fetch(`${clipRelayUrl}/api/clipboard`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${clipRelayPassword}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

// 根据内容类型返回相应的图标，模仿Clip Relay的UI风格
function getContentTypeIcon(contentType) {
  if (!contentType) return '📝'; // 默认为文本
  
  const type = contentType.toUpperCase();
  switch (type) {
    case 'TEXT':
      return '📝'; // Text document icon
    case 'IMAGE':
      return '🖼️'; // Image icon
    case 'FILE':
      return '📎'; // Attachment/file icon
    default:
      return '📄'; // Generic document icon
  }
}

// 格式化内容预览，模仿Clip Relay的显示风格
function formatContentPreview(content, maxLength = 60) {
  if (!content) return '(空内容)';
  
  // 对于长内容，截取前maxLength个字符并添加省略号
  if (content.length > maxLength) {
    return content.substring(0, maxLength) + '...';
  }
  
  // 对于URL，显示为链接样式
  const urlPattern = /^https?:\/\/.+/i;
  if (urlPattern.test(content)) {
    try {
      const url = new URL(content);
      return `🔗 ${url.hostname}${url.pathname}`;
    } catch (e) {
      // 如果URL无效，回退到普通文本
    }
  }
  
  // 简单的文本预览，移除多余的空白字符
  return content.replace(/\s+/g, ' ').trim();
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONFIG_UPDATE') {
    clipRelayUrl = message.url;
    clipRelayPassword = message.password;
    // 不需要返回响应，因为这是异步操作
  }
});