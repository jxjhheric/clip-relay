'use client';

import { useState, useEffect, useRef } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Copy, Trash2, FileText, Image, File } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { authFetch, verifyPassword, clearPassword } from '@/lib/auth';
import { io } from 'socket.io-client';
import { CLIPBOARD_CREATED_EVENT, CLIPBOARD_DELETED_EVENT } from '@/lib/socket-events';

interface ClipboardItem {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'FILE';
  content?: string;
  fileName?: string;
  fileSize?: number;
  fileData?: string;
  createdAt: string;
  updatedAt: string;
}

export default function Home() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ClipboardItem | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const { toast } = useToast();

  // 追踪最新的搜索关键字，供 WebSocket 事件回调使用
  const searchTermRef = useRef(searchTerm);
  useEffect(() => {
    searchTermRef.current = searchTerm;
  }, [searchTerm]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 100,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over) return;

    if (active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  // 首次加载清除残留密码，避免自动登录
  useEffect(() => {
    clearPassword();
  }, []);

  // 获取剪贴板条目数据
  const fetchItems = async (searchTerm = '') => {
    try {
      setIsLoading(true);
      const url = searchTerm ? `/api/clipboard?search=${encodeURIComponent(searchTerm)}` : '/api/clipboard';
      const response = await authFetch(url);
      if (response.ok) {
        const data = await response.json();
        setItems(data);
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
    fetchItems(searchTerm);
  };

  useEffect(() => {
    if (authenticated) {
      fetchItems(); // 初始加载
    }
  }, [toast, authenticated]);

  // WebSocket 实时同步：监听创建与删除事件
  useEffect(() => {
    if (!authenticated) return;

    const socketInstance = io({
      path: '/api/socketio',
    });

    socketInstance.on(CLIPBOARD_CREATED_EVENT, (newItem: ClipboardItem) => {
      // 若当前处于搜索模式，直接重新拉取保证过滤逻辑一致
      if (searchTermRef.current) {
        fetchItems(searchTermRef.current);
      } else {
        // 非搜索状态下，前置插入（与后端 createdAt desc 排序一致）
        setItems(prev => {
          if (prev.find(i => i.id === newItem.id)) return prev;
          return [newItem, ...prev];
        });
      }
    });

    socketInstance.on(CLIPBOARD_DELETED_EVENT, ({ id }: { id: string }) => {
      setItems(prev => prev.filter(i => i.id !== id));
    });

    return () => {
      socketInstance.disconnect();
    };
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'TEXT':
        return <FileText className="h-4 w-4" />;
      case 'IMAGE':
        return <Image className="h-4 w-4" />;
      case 'FILE':
        return <File className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

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
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">私人云剪贴板</h1>
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
            <AddItemDialog onItemAdded={() => fetchItems(searchTerm)} />
          </div>
        </div>

        {/* Clipboard Items Grid */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map(item => item.id)}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((item) => (
                <SortableItem
                  key={item.id}
                  id={item.id}
                  item={item}
                  onSelectItem={setSelectedItem}
                  onCopy={copyToClipboard}
                  onDelete={handleDelete}
                  getTypeIcon={getTypeIcon}
                  formatFileSize={formatFileSize}
                  formatDate={formatDate}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

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
      </div>
      
      {/* 详情对话框 */}
      <ItemDetailDialog 
        item={selectedItem} 
        open={!!selectedItem} 
        onOpenChange={(open) => !open && setSelectedItem(null)}
        onDelete={(id) => {
          handleDelete(id);
          setSelectedItem(null);
        }}
      />
    </div>
  );
}

function SortableItem({ id, item, onSelectItem, onCopy, onDelete, getTypeIcon, formatFileSize, formatDate }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({id});
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="group relative hover:shadow-md transition-shadow cursor-pointer h-52"
        onClick={() => {
          if (!isDragging) {
            onSelectItem(item);
          }
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getTypeIcon(item.type)}
              <Badge variant="secondary">{item.type}</Badge>
            </div>
            <div className="flex gap-1 items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  item.content && onCopy(item.content);
                }}
                disabled={!item.content}
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-12">
          <div className="space-y-2">
            {(item.type === 'FILE' || item.type === 'IMAGE') && (
              <p className="text-sm font-medium truncate">
                {item.fileName || (item.type === 'IMAGE' ? '图片' : '文件')}
              </p>
            )}
            {item.content && (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {item.content}
              </p>
            )}
          </div>
          <div className="absolute bottom-3 right-3 text-right text-xs text-muted-foreground">
            {item.fileSize && (
              <div>
                大小: {formatFileSize(item.fileSize)}
              </div>
            )}
            <div>
              {formatDate(item.createdAt)}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
        description: "欢迎使用云剪贴板",
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

// 详情对话框组件
function ItemDetailDialog({
  item, 
  open, 
  onOpenChange, 
  onDelete 
}: { 
  item: ClipboardItem | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  onDelete: (id: string) => void; 
}) {
  const { toast } = useToast();

  if (!item) return null;

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

  const downloadFile = () => {
    if (!item.fileData) return;
    
    const link = document.createElement('a');
    link.href = item.fileData;
    link.download = item.fileName || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'TEXT':
        return <FileText className="h-5 w-5" />;
      case 'IMAGE':
        return <Image className="h-5 w-5" />;
      case 'FILE':
        return <File className="h-5 w-5" />;
      default:
        return <File className="h-5 w-5" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {getTypeIcon(item.type)}
            <div>
              <DialogTitle className="text-xl">
                条目详情
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{item.type}</Badge>
                {item.fileSize && (
                  <span className="text-sm text-muted-foreground">
                    {formatFileSize(item.fileSize)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* 内容区域 */}
          {item.content && (
            <div>
              <h3 className="text-sm font-medium mb-2">内容</h3>
              <div className="bg-muted p-4 rounded-lg">
                <pre className="whitespace-pre-wrap text-sm">{item.content}</pre>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => copyToClipboard(item.content!)}
              >
                <Copy className="h-4 w-4 mr-2" />
                复制内容
              </Button>
            </div>
          )}

          {/* 图片预览 */}
          {item.type === 'IMAGE' && item.fileData && (
            <div>
              <h3 className="text-sm font-medium mb-2">图片预览</h3>
              <div className="bg-muted p-4 rounded-lg flex justify-center">
                <img
                  src={item.fileData}
                  alt={item.fileName || '图片'}
                  className="max-w-full max-h-96 object-contain rounded"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadFile}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  下载图片
                </Button>
              </div>
            </div>
          )}

          {/* 文件信息 */}
          {item.type === 'FILE' && item.fileData && (
            <div>
              <h3 className="text-sm font-medium mb-2">文件信息</h3>
              <div className="bg-muted p-4 rounded-lg">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">文件名:</span>
                    <span className="text-sm">{item.fileName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">大小:</span>
                    <span className="text-sm">{formatFileSize(item.fileSize!)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">类型:</span>
                    <span className="text-sm">{item.type}</span>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={downloadFile}
              >
                <Copy className="h-4 w-4 mr-2" />
                下载文件
              </Button>
            </div>
          )}

          {/* 元数据 */}
          <div>
            <h3 className="text-sm font-medium mb-2">元数据</h3>
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">创建时间:</span>
                <span className="text-sm">{new Date(item.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">更新时间:</span>
                <span className="text-sm">{new Date(item.updatedAt).toLocaleString('zh-CN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">ID:</span>
                <span className="text-sm font-mono">{item.id}</span>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-between pt-4 border-t">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 添加条目对话框组件
function AddItemDialog({ onItemAdded }: { onItemAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  // 粘贴图片（Ctrl+V）支持
  const handlePaste = (e: React.ClipboardEvent) => {
    try {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'file' || (it.type && it.type.startsWith('image/'))) {
          const pastedFile = it.getAsFile?.();
          if (pastedFile) {
            setFile(pastedFile);
            // 给予轻提示
            toast({
              title: '已获取粘贴的图片',
              description: `${pastedFile.name || 'image'} (${(pastedFile.size / 1024 / 1024).toFixed(2)} MB)`,
            });
            break;
          }
        }
      }
    } catch {}
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async () => {
    try {
      if (!content.trim() && !file) {
        toast({
          title: "请输入内容或上传文件",
          description: "内容和文件不能同时为空",
          variant: "destructive",
        });
        return;
      }

      let fileData: string | undefined;
      let fileName: string | undefined;
      let fileSize: number | undefined;
      let itemType: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT';

      if (file) {
        fileData = await readFileAsBase64(file);
        fileName = file.name;
        fileSize = file.size;
        itemType = file.type.startsWith('image/') ? 'IMAGE' : 'FILE';
      }

      // 调用API创建新条目
      const response = await authFetch('/api/clipboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: itemType,
          content: content,
          fileName,
          fileSize,
          fileData,
        }),
      });

      if (response.ok) {
        const newItem = await response.json();
        toast({
          title: "添加成功",
          description: "新条目已成功添加到剪贴板",
        });
        
        // 重置表单
        setContent('');
        setFile(null);
        setOpen(false);
        onItemAdded();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create item');
      }
    } catch (error) {
      toast({
        title: "添加失败",
        description: "文件处理失败，请重试",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setContent('');
    setFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          添加条目
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col" onPaste={handlePaste}>
        <DialogHeader>
          <DialogTitle>添加新条目</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* 内容输入区域 */}
          <div>
            <label className="text-sm font-medium mb-2 block">内容</label>
            <div className="relative">
              <Textarea
                placeholder="输入文本内容..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="resize-none max-h-48"
              />
            </div>
          </div>

          {/* 文件上传区域 */}
          <div>
            <label className="text-sm font-medium mb-2 block">上传文件</label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : file
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onPaste={handlePaste}
              tabIndex={0}
            >
              {file ? (
                <div className="space-y-2">
                  <File className="h-8 w-8 text-green-600 mx-auto" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFile(null)}
                  >
                    重新选择
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <File className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    拖拽文件到此处、点击选择，或在此处按 Ctrl+V 粘贴图片
                  </p>
                  <input
                    type="file"
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0];
                      if (selectedFile) handleFileSelect(selectedFile);
                    }}
                    className="hidden"
                    id="file-upload"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('file-upload')?.click()}
                  >
                    选择文件
                  </Button>
                </div>
              )}
            </div>
          </div>
          
          {/* 底部操作按钮 - 固定位置 */}
          <div className="flex justify-between items-center pt-4 border-t bg-background">
            <div className="text-xs text-muted-foreground">
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSubmit}>
                添加
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}