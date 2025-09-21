"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/auth";
import axios from "axios";
import { File as FileIcon, Plus } from "lucide-react";

export default function AddItemDialog({ onItemAdded }: { onItemAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
  };

  const resetForm = () => {
    setContent("");
    setFile(null);
    setIsDragging(false);
    setUploadProgress(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    try {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" || (it.type && it.type.startsWith("image/"))) {
          const pastedFile = it.getAsFile?.();
          if (pastedFile) {
            setFile(pastedFile);
            toast({ title: "已获取粘贴的图片", description: `${pastedFile.name || "image"} (${(pastedFile.size / 1024 / 1024).toFixed(2)} MB)` });
            break;
          }
        }
      }
    } catch {}
  };

  const handleSubmit = async () => {
    if (!content.trim() && !file) {
      toast({ title: "请输入内容或上传文件", description: "内容和文件不能同时为空", variant: "destructive" });
      return;
    }

    setUploadProgress(0);
    abortControllerRef.current = new AbortController();

    try {
      const formData = new FormData();
      formData.append("content", content);
      let itemType: "TEXT" | "IMAGE" | "FILE" = "TEXT";
      if (file) {
        itemType = file.type.startsWith("image/") ? "IMAGE" : "FILE";
        formData.append("file", file);
      }
      formData.append("type", itemType);

      await axios.post("/api/clipboard", formData, {
        headers: { ...(getAuthHeaders() as Record<string, string>), "Content-Type": "multipart/form-data" },
        signal: abortControllerRef.current.signal,
        onUploadProgress(progressEvent) {
          const progress = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setUploadProgress(progress);
        },
      });

      toast({ title: "添加成功" });
      resetForm();
      setOpen(false);
      onItemAdded();
    } catch (error: any) {
      if (axios.isCancel(error)) {
        toast({ title: "已取消上传" });
      } else {
        toast({ title: "上传失败", description: error?.message || "请稍后重试", variant: "destructive" });
      }
    } finally {
      setUploadProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (uploadProgress !== null) {
      abortControllerRef.current?.abort();
    } else {
      setOpen(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (!newOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          添加条目
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h[80vh] flex flex-col" onPaste={handlePaste}>
        <DialogHeader>
          <DialogTitle>添加新条目</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">内容</label>
            <div className="relative">
              <Textarea placeholder="输入文本内容..." value={content} onChange={(e) => setContent(e.target.value)} rows={6} className="resize-none max-h-48" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">上传文件</label>
            <div
              className={`cursor-pointer border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragging ? "border-primary bg-primary/5" : file ? "border-green-500 bg-green-50" : "border-gray-300 hover:border-gray-400"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onPaste={handlePaste}
              tabIndex={0}
            >
              {file ? (
                <div className="space-y-2">
                  <FileIcon className="h-8 w-8 text-green-600 mx-auto" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  <Button variant="outline" size="sm" onClick={() => setFile(null)}>
                    重新选择
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <FileIcon className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">拖拽文件到此处、点击选择，或在此处按 Ctrl+V 粘贴图片</p>
                  <input
                    type="file"
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0];
                      if (selectedFile) handleFileSelect(selectedFile);
                    }}
                    className="hidden"
                    id="file-upload"
                  />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById("file-upload")?.click()}>
                    选择文件
                  </Button>
                </div>
              )}
            </div>
            {uploadProgress !== null && (
              <div className="space-y-2">
                <Progress value={uploadProgress} className="w-full" />
                <p className="text-sm text-center text-muted-foreground">
                  {uploadProgress < 100 ? `上传中... ${uploadProgress}%` : "处理中..."}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t bg-background">
            <div className="text-xs text-muted-foreground"></div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel}>
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={uploadProgress !== null}>
                {uploadProgress !== null ? "上传中..." : "添加"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

