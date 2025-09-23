"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { File as FileIcon, FileText, Image as ImageIcon, Copy } from "lucide-react";
import { formatFileSize } from "@/lib/format";
import CreateShareDialog from "@/components/clipboard/CreateShareDialog";

type ClipboardItem = {
  id: string;
  type: "TEXT" | "IMAGE" | "FILE";
  content?: string;
  fileName?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt: string;
};

export default function ItemDetailDialog({
  item,
  open,
  onOpenChange,
  onDelete,
}: {
  item: ClipboardItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  if (!item) return null;

  const copyToClipboard = async (content: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast({ title: "已复制到剪贴板", description: "内容已成功复制到剪贴板" });
    } catch {
      toast({ title: "复制失败", description: "无法访问剪贴板，请手动复制", variant: "destructive" });
    }
  };

  const downloadFile = () => {
    const link = document.createElement("a");
    link.href = `/api/files/${item.id}?download=1`;
    link.download = item.fileName || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "TEXT":
        return <FileText className="h-5 w-5" />;
      case "IMAGE":
        return <ImageIcon className="h-5 w-5" />;
      case "FILE":
      default:
        return <FileIcon className="h-5 w-5" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {getTypeIcon(item.type)}
            <div>
              <DialogTitle className="text-xl">条目详情</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{item.type}</Badge>
                {typeof item.fileSize === "number" && (
                  <span className="text-sm text-muted-foreground">{formatFileSize(item.fileSize)}</span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {item.content && (
            <div>
              <h3 className="text-sm font-medium mb-2">内容</h3>
              <div className="bg-muted p-4 rounded-lg">
                <pre className="whitespace-pre-wrap text-sm">{item.content}</pre>
              </div>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => copyToClipboard(item.content!)}>
                <Copy className="h-4 w-4 mr-2" /> 复制内容
              </Button>
            </div>
          )}

          {item.type === "IMAGE" && (
            <div>
              <h3 className="text-sm font-medium mb-2">图片预览</h3>
              <div className="bg-muted p-4 rounded-lg flex justify-center">
                <img
                  src={`/api/files/${item.id}`}
                  alt={item.fileName || "图片"}
                  className="max-w-full max-h-96 object-contain rounded"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={downloadFile}>
                  <Copy className="h-4 w-4 mr-2" /> 下载图片
                </Button>
              </div>
            </div>
          )}

          {item.type === "FILE" && (
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
                    <span className="text-sm">{formatFileSize(item.fileSize || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">类型:</span>
                    <span className="text-sm">{item.type}</span>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-2" onClick={downloadFile}>
                <Copy className="h-4 w-4 mr-2" /> 下载文件
              </Button>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium mb-2">元数据</h3>
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">创建时间:</span>
                <span className="text-sm">{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
              </div>
              {item.updatedAt !== item.createdAt && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">更新时间:</span>
                  <span className="text-sm">{new Date(item.updatedAt).toLocaleString("zh-CN")}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm font-medium">ID:</span>
                <span className="text-sm font-mono">{item.id}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  删除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认删除</AlertDialogTitle>
                  <AlertDialogDescription>删除后将无法恢复。确定要删除该条目吗？</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(item.id)}>确认删除</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShareOpen(true)}>
                分享
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
      {/* 创建分享链接（详情内快捷入口） */}
      <CreateShareDialog itemId={item.id} open={shareOpen} onOpenChange={setShareOpen} />
    </Dialog>
  );
}
