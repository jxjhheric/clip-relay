'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Search, Github, Bug, Menu, LogOut } from 'lucide-react';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { authFetch, verifyPassword, getStoredPassword, logout } from '@/lib/auth';
import ThemeSelect from '@/components/ThemeSelect';
import { Sheet, SheetContent, SheetFooter, SheetHeader } from '@/components/ui/sheet';
import { CLIPBOARD_CREATED_EVENT, CLIPBOARD_DELETED_EVENT, CLIPBOARD_REORDERED_EVENT } from '@/lib/socket-events';
import type { ClipboardItem as GridItem } from '@/components/clipboard/ClipboardGrid';

const ClipboardGrid = dynamic(() => import('@/components/clipboard/ClipboardGrid'), { ssr: false });
const ClipboardList = dynamic(() => import('@/components/clipboard/ClipboardList'), { ssr: false });
const AddItemDialog = dynamic(() => import('@/components/clipboard/AddItemDialog'), { ssr: false });
const ItemDetailDialog = dynamic(() => import('@/components/clipboard/ItemDetailDialog'), { ssr: false });
const ShareManagerDialog = dynamic(() => import('@/components/clipboard/ShareManagerDialog'), { ssr: false });
const CreateShareDialog = dynamic(() => import('@/components/clipboard/CreateShareDialog'), { ssr: false });

type ClipboardItem = GridItem;

export default function Home() {
  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');
  const REPO_URL = 'https://github.com/paopaoandlingyia/clip-relay';
  const ISSUES_URL = 'https://github.com/paopaoandlingyia/clip-relay/issues';
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ClipboardItem | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [shareMgrOpen, setShareMgrOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareItemId, setShareItemId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [nextCursor, setNextCursor] = useState<{ id: string; createdAt: string; sortWeight?: number } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { toast } = useToast();

  // 追踪最新的搜索关键字，供 WebSocket 事件回调使用
  const searchTermRef = useRef(searchTerm);
  useEffect(() => {
    searchTermRef.current = searchTerm;
  }, [searchTerm]);

  // DnD moved into ClipboardGrid

  // 静默鉴权：若已有 Cookie，则自动进入，无需再次输入
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/health', { credentials: 'include' });
        if (res.ok) {
          setAuthenticated(true);
        }
      } catch {}
      setCheckingAuth(false);
    })();
  }, []);

  // 读取并持久化视图模式
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('clipboard_view_mode') : null;
      if (saved === 'grid' || saved === 'list') {
        setViewMode(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('clipboard_view_mode', viewMode);
      }
    } catch {}
  }, [viewMode]);

  // 预加载详情弹窗组件，避免首次点击时的分包加载延迟
  useEffect(() => {
    import('@/components/clipboard/ItemDetailDialog').catch(() => {});
  }, []);

  // 获取剪贴板条目数据
  const fetchItems = async (searchTerm = '') => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.set('take', '12');
      if (searchTerm) params.set('search', searchTerm);
      const url = `/api/clipboard?${params.toString()}`;
      const response = await authFetch(url);
      if (response.ok) {
        const data = await response.json();
        const list: ClipboardItem[] = Array.isArray(data) ? data : data.items;
        setItems(list);
        setNextCursor(data?.nextCursor ?? null);
      } else {
        toast({
          title: "获取数据失败",
          description: "无法获取剪贴板内容",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "获取数据失败",
        description: "网络错误，请检查连接",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 手动触发搜索
  const handleSearch = () => {
    setNextCursor(null);
    fetchItems(searchTerm);
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    try {
      setLoadingMore(true);
      const params = new URLSearchParams();
      params.set('take', '24');
      params.set('cursorCreatedAt', nextCursor.createdAt);
      params.set('cursorId', nextCursor.id);
      if (typeof nextCursor.sortWeight === 'number') params.set('cursorSortWeight', String(nextCursor.sortWeight));
      if (searchTermRef.current) params.set('search', searchTermRef.current);
      const res = await authFetch(`/api/clipboard?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '加载失败');
      const list: ClipboardItem[] = Array.isArray(data) ? data : data.items;
      setItems(prev => [...prev, ...list]);
      setNextCursor(data?.nextCursor ?? null);
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message || '请稍后重试', variant: 'destructive' });
    } finally {
      setLoadingMore(false);
    }
  };

  // 打开详情：先用现有列表数据即时打开，再并发拉取最新详情
  const openItemById = async (id: string) => {
    try {
      const res = await authFetch(`/api/clipboard/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedItem(data);
      } else {
        toast({
          title: '加载失败',
          description: '无法加载条目详情',
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({
        title: '网络错误',
        description: '请检查连接后重试',
        variant: 'destructive',
      });
    }
  };

  // 点击卡片时，优先显示已有数据，提升响应速度
  const handleSelectItem = (id: string) => {
    const local = items.find(i => i.id === id) || null;
    if (local) setSelectedItem(local);
    // 后台刷新详情（含 contentType/filePath 等）
    openItemById(id);
  };

  useEffect(() => {
    if (authenticated) {
      fetchItems(); // 初始加载
    }
  }, [authenticated]);

  // SSE 实时同步：监听创建与删除事件
  useEffect(() => {
    if (!authenticated) return;
    let es: EventSource | null = null;
    try {
      // include credentials so auth cookie works on cross-origin if configured
      const useQueryAuth = (process.env.NEXT_PUBLIC_SSE_AUTH_IN_QUERY || '') === '1';
      const pwd = getStoredPassword();
      const url = useQueryAuth && pwd ? `${API_BASE}/api/events?auth=${encodeURIComponent(pwd)}` : `${API_BASE}/api/events`;
      es = new EventSource(url, { withCredentials: true } as any);
      es.addEventListener(CLIPBOARD_CREATED_EVENT, (ev: MessageEvent) => {
        const newItem = JSON.parse((ev as MessageEvent).data) as ClipboardItem;
        if (searchTermRef.current) {
          fetchItems(searchTermRef.current);
        } else {
          setItems(prev => {
            // Insert by sortWeight desc, then createdAt desc, then id desc
            if (prev.find(i => i.id === newItem.id)) return prev;
            const arr = [...prev];
            const keyOf = (x: ClipboardItem) => [x.sortWeight ?? 0, new Date(x.createdAt).getTime(), x.id] as const;
            const newKey = keyOf(newItem);
            let idx = 0;
            while (idx < arr.length) {
              const k = keyOf(arr[idx]);
              if (
                newKey[0] > (k[0] ?? 0) ||
                (newKey[0] === (k[0] ?? 0) && (newKey[1] > k[1] || (newKey[1] === k[1] && newKey[2] > k[2])))
              ) {
                break;
              }
              idx++;
            }
            arr.splice(idx, 0, newItem);
            return arr;
          });
        }
      });
      es.addEventListener(CLIPBOARD_DELETED_EVENT, (ev: MessageEvent) => {
        const { id } = JSON.parse((ev as MessageEvent).data) as { id: string };
        setItems(prev => prev.filter(i => i.id !== id));
      });
      es.addEventListener(CLIPBOARD_REORDERED_EVENT, (ev: MessageEvent) => {
        const data = JSON.parse((ev as MessageEvent).data) as { ids: string[] };
        const order = data?.ids || [];
        if (!order.length) return;
        setItems(prev => {
          const idIndex = new Map(order.map((id, idx) => [id, idx] as const));
          const a = [...prev];
          a.sort((x, y) => {
            const ix = idIndex.has(x.id) ? idIndex.get(x.id)! : Number.POSITIVE_INFINITY;
            const iy = idIndex.has(y.id) ? idIndex.get(y.id)! : Number.POSITIVE_INFINITY;
            if (ix !== iy) return ix - iy; // items in payload first, by given order
            // fallback: keep existing relative order
            return 0;
          });
          return a;
        });
      });
    } catch {}
    return () => { try { es?.close(); } catch {} };
  }, [authenticated]);

  const copyToClipboard = async (content: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(content);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast({
        title: "已复制到剪贴板",
        description: "内容已成功复制到剪贴板",
      });
    } catch (err) {
      toast({
        title: "复制失败",
        description: "无法访问剪贴板，请手动复制",
        variant: "destructive",
      });
    }
  };

  // formatting moved to grid/utilities

  const handleDelete = async (id: string) => {
    try {
      const response = await authFetch(`/api/clipboard/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setItems(prev => prev.filter(i => i.id !== id));
        toast({
          title: "已删除",
          description: "条目已成功删除",
        });
      } else {
        toast({
          title: "删除失败",
          description: "无法删除条目",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "删除失败",
        description: "网络错误，请检查连接",
        variant: "destructive",
      });
    }
  };

  if (!authenticated) {
    if (checkingAuth) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
        </div>
      );
    }
    return (
      <AuthDialog
        onSuccess={() => {
          setAuthenticated(true);
          fetchItems();
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="relative flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
          {/* Mobile-only: single settings button at top-right */}
          <div className="sm:hidden absolute top-2 right-2 flex items-center gap-1">
            <Button variant="ghost" size="icon" title="设置" onClick={() => setSettingsOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
          </div>
          <div>
            <h1 className="text-3xl font-bold">Clip Relay</h1>
            <p className="text-muted-foreground mt-1">管理您的剪贴板内容</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="flex w-full sm:w-auto gap-2">
              <Input
                placeholder="搜索内容..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64"
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
              />
              <Button onClick={handleSearch} disabled={isLoading}>
                <Search className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">搜索</span>
              </Button>
            </div>
            <div className="flex gap-2 items-center">
              <AddItemDialog onItemAdded={() => fetchItems(searchTerm)} />
              <Button variant="outline" onClick={() => setShareMgrOpen(true)}>
                分享管理
              </Button>
              {/* Desktop settings */}
              <Button variant="ghost" size="icon" title="设置" className="hidden sm:inline-flex" onClick={() => setSettingsOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Settings Drawer */}
        <SettingsDrawer
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          repoUrl={REPO_URL}
          issuesUrl={ISSUES_URL}
          onLogout={() => { setAuthenticated(false); setSelectedItem(null); }}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
        />

        {/* Clipboard Items (grid or list) */}
        {viewMode === 'grid' ? (
          <ClipboardGrid
            items={items}
            onReorder={async (newItems) => {
              // Optimistic update
              setItems(newItems);
              try {
                const ids = newItems.map(i => i.id);
                const res = await authFetch('/api/clipboard/reorder', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ids })
                });
                if (!res.ok) {
                  throw new Error('reorder failed');
                }
              } catch {
                toast({ title: '排序保存失败', description: '稍后将自动恢复', variant: 'destructive' });
                // Best-effort refresh to reflect server state
                fetchItems(searchTermRef.current || '');
              }
            }}
            onSelectItem={(id: string) => handleSelectItem(id)}
            onCopy={copyToClipboard}
            onRequestDelete={(id: string) => { setPendingDeleteId(id); setDeleteOpen(true); }}
            onRequestShare={(id: string) => { setShareItemId(id); setShareOpen(true); }}
          />
        ) : (
          <ClipboardList
            items={items}
            onReorder={async (newItems) => {
              // Optimistic update
              setItems(newItems);
              try {
                const ids = newItems.map(i => i.id);
                const res = await authFetch('/api/clipboard/reorder', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ids })
                });
                if (!res.ok) {
                  throw new Error('reorder failed');
                }
              } catch {
                toast({ title: '排序保存失败', description: '稍后将自动恢复', variant: 'destructive' });
                // Best-effort refresh to reflect server state
                fetchItems(searchTermRef.current || '');
              }
            }}
            onSelectItem={(id: string) => handleSelectItem(id)}
            onCopy={copyToClipboard}
            onRequestDelete={(id: string) => { setPendingDeleteId(id); setDeleteOpen(true); }}
            onRequestShare={(id: string) => { setShareItemId(id); setShareOpen(true); }}
          />
        )}

        {items.length === 0 && (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无剪贴板内容</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? '没有找到匹配的内容' : '点击上方按钮添加新的剪贴板内容'}
            </p>
            {!searchTerm && <AddItemDialog onItemAdded={() => fetchItems(searchTerm)} />}
          </div>
        )}

        {items.length > 0 && nextCursor && (
          <div className="flex justify-center mt-6">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? '加载中...' : '加载更多'}
            </Button>
          </div>
        )}
      </div>
      
      {/* 统一删除确认弹窗 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>删除后将无法恢复。确定要删除该条目吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingDeleteId) handleDelete(pendingDeleteId); setDeleteOpen(false); }}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 创建分享链接（单例） */}
      <CreateShareDialog itemId={shareItemId} open={shareOpen} onOpenChange={(o) => { setShareOpen(o); if (!o) setShareItemId(null); }} />

      {/* 详情对话框 */}
      <ItemDetailDialog
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        onDelete={(id) => { handleDelete(id); setSelectedItem(null); }}
      />

      {/* 分享管理 */}
      <ShareManagerDialog open={shareMgrOpen} onOpenChange={setShareMgrOpen} />
    </div>
  );
}

// moved into components/clipboard/ClipboardGrid

// 分享管理对话框
// moved into components/clipboard/ShareManagerDialog

// 认证对话框组件
function AuthDialog({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { toast } = useToast();

  const handleUnlock = async () => {
    const isValid = await verifyPassword(password);
    if (isValid) {
      toast({
        title: "认证成功",
        description: "欢迎使用 Clip Relay",
      });
      onSuccess();
    } else {
      setError('密码错误，请重试');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="text-2xl font-semibold">需要认证</div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            请输入访问密码以继续。
          </p>
          <Input
            type="password"
            placeholder="输入密码..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleUnlock} className="w-full">
            解锁
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// 设置抽屉
function SettingsDrawer({
  open,
  onOpenChange,
  repoUrl,
  issuesUrl,
  onLogout,
  viewMode,
  onChangeViewMode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  repoUrl: string;
  issuesUrl: string;
  onLogout: () => void;
  viewMode: 'grid' | 'list';
  onChangeViewMode: (m: 'grid' | 'list') => void;
}) {
  const { toast } = useToast();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <div className="text-lg font-semibold">设置</div>
        </SheetHeader>
        <div className="px-4 py-2 space-y-2">
          <Button variant="ghost" className="w-full justify-start" asChild>
            <a href={repoUrl} target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4 mr-2" /> GitHub 仓库
            </a>
          </Button>
          <Button variant="ghost" className="w-full justify-start" asChild>
            <a href={issuesUrl} target="_blank" rel="noopener noreferrer">
              <Bug className="h-4 w-4 mr-2" /> 提交问题
            </a>
          </Button>
          <div className="flex items-center justify-between py-2">
            <div className="text-sm">视图模式</div>
            <div>
              <Select value={viewMode} onValueChange={(v) => onChangeViewMode((v as 'grid' | 'list'))}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">网格</SelectItem>
                  <SelectItem value="list">列表</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="text-sm">主题</div>
            <ThemeSelect />
          </div>
        </div>
        <SheetFooter>
          <Button
            variant="destructive"
            className="w-full justify-center"
            onClick={async () => {
              try {
                await logout();
                toast({ title: '已退出登录' });
                onLogout();
              } catch {}
              onOpenChange(false);
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> 退出登录
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// 详情对话框组件
// moved into components/clipboard/ItemDetailDialog

// 添加条目对话框组件已拆分为独立动态组件（见 components/clipboard/AddItemDialog）
