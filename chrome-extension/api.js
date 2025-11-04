// API client for Clip Relay backend
class ClipRelayAPI {
  constructor(serverUrl, password) {
    this.serverUrl = serverUrl;
    this.password = password;
  }

  async authenticate() {
    const response = await fetch(`${this.serverUrl}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: this.password })
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error('Invalid password');
    }

    return true;
  }

  async createClipboardItem(content, type = 'TEXT') {
    const formData = new FormData();

    if (type === 'TEXT') {
      formData.append('content', content);
      formData.append('type', 'TEXT');
    } else if (type === 'FILE') {
      formData.append('file', content);
      formData.append('type', 'FILE');
    }

    const response = await fetch(`${this.serverUrl}/api/clipboard`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.password}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create clipboard item: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  async getClipboardItems(search = '', limit = 24) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    params.append('take', limit.toString());

    const response = await fetch(`${this.serverUrl}/api/clipboard?${params}`, {
      headers: {
        'Authorization': `Bearer ${this.password}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch clipboard items: ${response.status}`);
    }

    return await response.json();
  }

  async getShareLink(itemId) {
    // Get or create share link for the item
    const response = await fetch(`${this.serverUrl}/api/clipboard/${itemId}/share`, {
      headers: {
        'Authorization': `Bearer ${this.password}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get share link: ${response.status}`);
    }

    const shareData = await response.json();

    // Return the share URL with token
    if (shareData.token) {
      return {
        url: `${this.serverUrl}/share/${shareData.token}`,
        token: shareData.token,
        shareData: shareData
      };
    }

    return null;
  }

  async createShareLink(itemId, options = {}) {
    // Create or update share link with options
    const response = await fetch(`${this.serverUrl}/api/clipboard/${itemId}/share`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.password}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(options)
    });

    if (!response.ok) {
      throw new Error(`Failed to create share link: ${response.status}`);
    }

    const shareData = await response.json();

    if (shareData.token) {
      return {
        url: `${this.serverUrl}/share/${shareData.token}`,
        token: shareData.token,
        shareData: shareData
      };
    }

    return null;
  }

  getQRCodeUrl(shareToken) {
    return `${this.serverUrl}/api/share/${shareToken}/qr`;
  }
}
