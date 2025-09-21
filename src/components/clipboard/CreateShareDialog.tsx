"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth";

export default function CreateShareDialog({
  itemId,
  open,
  onOpenChange,
}: {
  itemId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [creatingShare, setCreatingShare] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<string>("86400");
  const [maxDownloads, setMaxDownloads] = useState<string>("");
  const [sharePassword, setSharePassword] = useState<string>("");

  useEffect(() => {
    if (!open) {
      setShareUrl(null);
      setCreatingShare(false);
      setExpiresIn("86400");
      setMaxDownloads("");
      setSharePassword("");
    }
  }, [open]);

  const createShare = async () => {
    if (!itemId) return;
    try {
      setCreatingShare(true);
      const payload: any = { itemId };
      const ei = parseInt(expiresIn, 10);
      if (!isNaN(ei) && ei > 0) payload.expiresIn = ei;
      if (maxDownloads.trim()) payload.maxDownloads = Number(maxDownloads);
      if (sharePassword.trim()) payload.password = sharePassword.trim();
      const res = await authFetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "创建失败");
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setShareUrl(origin + data.url);
    } catch (e: any) {
      toast({ title: "创建失败", description: e?.message || "请稍后重试", variant: "destructive" });
    } finally {
      setCreatingShare(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建分享链接</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!shareUrl ? (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">有效期</label>
                <select className="w-full rounded border px-2 py-1 text-sm bg-background" value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}>
                  <option value="0">永不过期</option>
                  <option value="3600">1 小时</option>
                  <option value="86400">24 小时</option>
                  <option value="604800">7 天</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">最大下载次数（可选）</label>
                <Input type="number" placeholder="不限则留空" value={maxDownloads} onChange={(e) => setMaxDownloads(e.target.value)} min={1} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">分享口令（可选）</label>
                <Input type="password" placeholder="不设置则留空" value={sharePassword} onChange={(e) => setSharePassword(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  取消
                </Button>
                <Button onClick={createShare} disabled={creatingShare}>
                  {creatingShare ? "创建中..." : "创建"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">分享链接</label>
                <div className="flex gap-2">
                  <Input readOnly value={shareUrl} />
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareUrl!);
                        toast({ title: "已复制链接" });
                      } catch {}
                    }}
                  >
                    复制
                  </Button>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">任何知道此链接的人都可访问。你可随时在管理页撤销分享。</div>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={() => onOpenChange(false)}>完成</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

