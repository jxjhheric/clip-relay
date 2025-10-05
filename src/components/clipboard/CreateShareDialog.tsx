"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth";
import { safeCopyText, isSecure } from "@/lib/copy";

export default function CreateShareDialog({
  itemId,
  open,
  onOpenChange,
  ensureItemId,
  onFinished,
  initialShare,
}: {
  itemId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ensureItemId?: () => Promise<string>;
  onFinished?: () => void;
  initialShare?: { token: string; url: string } | null;
}) {
  const { toast } = useToast();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [sharePassword, setSharePassword] = useState<string>("");
  // manage mode fields (when itemId provided)
  const [manageExpiresIn, setManageExpiresIn] = useState<string>("0");
  const [manageMaxDownloads, setManageMaxDownloads] = useState<string>("");

  useEffect(() => {
    if (!open) {
      setShareUrl(null);
      setShareToken(null);
      setSharePassword("");
      return;
    }
    // If preset share provided, show result directly
    if (open && initialShare && !shareUrl && !shareToken) {
      setShareToken(initialShare.token);
      setShareUrl(initialShare.url);
    }
    // Manage existing item's share: fetch and show directly
    (async () => {
      if (!itemId || shareUrl || shareToken || initialShare) return;
      try {
        const res = await authFetch(`/api/clipboard/${itemId}/share`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'failed');
        setShareToken(data.token);
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        setShareUrl(origin + data.url);
        setManageExpiresIn('0');
        setManageMaxDownloads(typeof data.maxDownloads === 'number' ? String(data.maxDownloads) : '');
      } catch {}
    })();
  }, [open, initialShare, itemId, shareUrl, shareToken]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>分享链接</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!shareUrl ? (
            <div className="py-6 text-center text-sm text-muted-foreground">加载中...</div>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">分享链接</label>
                <div className="flex gap-2">
                  <Input readOnly value={shareUrl} ref={inputRef} />
                  <Button
                    onClick={async () => {
                      const ok = await safeCopyText(shareUrl!);
                      if (ok) {
                        toast({ title: "已复制链接" });
                        return;
                      }
                      // In insecure contexts, assist manual copy: select the input content
                      try {
                        inputRef.current?.focus();
                        inputRef.current?.select();
                      } catch {}
                      toast({ title: "请手动复制", description: isSecure() ? "浏览器限制或权限不足" : "当前为 HTTP 环境，系统复制受限", variant: "destructive" });
                    }}
                  >
                    复制
                  </Button>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">任何知道此链接的人都可访问。你可随时在管理页撤销分享。</div>
              </div>
              {shareToken && (
                <div>
                  <label className="text-sm font-medium mb-1 block">二维码</label>
                  <div className="flex items-center gap-4">
                    <img
                      src={`/api/share/${shareToken}/qr?size=240`}
                      alt="分享二维码"
                      className="border rounded bg-white p-2"
                      width={240}
                      height={240}
                    />
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" onClick={() => window.open(`/api/share/${shareToken}/qr?size=1024&download=1`, '_blank')}>下载二维码</Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            if ((navigator as any).share && shareUrl) {
                              await (navigator as any).share({ title: '分享', url: shareUrl });
                              return;
                            }
                          } catch {}
                          const ok = await safeCopyText(shareUrl!);
                          toast({ title: ok ? '已复制链接' : '请手动复制', variant: ok ? undefined : 'destructive' });
                        }}
                      >系统分享/复制</Button>
                    </div>
                  </div>
                </div>
              )}
              {itemId && shareToken && (
                <div className="pt-2 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1 block">有效期</label>
                      <select className="w-full rounded border px-2 py-1 text-sm bg-background" value={manageExpiresIn} onChange={(e) => setManageExpiresIn(e.target.value)}>
                        <option value="0">永不过期</option>
                        <option value="3600">1 小时</option>
                        <option value="86400">24 小时</option>
                        <option value="604800">7 天</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">最大下载次数（可选）</label>
                      <Input type="number" placeholder="不限则留空" value={manageMaxDownloads} onChange={(e) => setManageMaxDownloads(e.target.value)} min={1} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">分享口令（可选）</label>
                      <Input type="password" placeholder="不设置则留空" value={sharePassword} onChange={(e) => setSharePassword(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={async () => {
                      try {
                        const payload: any = {};
                        const ei = parseInt(manageExpiresIn, 10);
                        if (!isNaN(ei)) payload.expiresIn = ei;
                        if (manageMaxDownloads.trim()) payload.maxDownloads = Number(manageMaxDownloads);
                        if (sharePassword.trim()) payload.password = sharePassword.trim();
                        const res = await authFetch(`/api/clipboard/${itemId}/share`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data?.error || 'update failed');
                        setShareToken(data.token);
                        const origin = typeof window !== 'undefined' ? window.location.origin : '';
                        setShareUrl(origin + data.url);
                        setManageMaxDownloads(typeof data.maxDownloads === 'number' ? String(data.maxDownloads) : '');
                        toast({ title: '已更新分享' });
                      } catch (e:any) { toast({ title: '更新失败', description: e?.message || '请稍后重试', variant: 'destructive' }); }
                    }}>保存</Button>
                    <Button variant="outline" onClick={async () => {
                      try {
                        const payload: any = { reset: true };
                        if (sharePassword.trim()) payload.password = sharePassword.trim();
                        const res = await authFetch(`/api/clipboard/${itemId}/share`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data?.error || 'reset failed');
                        setShareToken(data.token);
                        const origin = typeof window !== 'undefined' ? window.location.origin : '';
                        setShareUrl(origin + data.url);
                        setManageMaxDownloads(typeof data.maxDownloads === 'number' ? String(data.maxDownloads) : '');
                        toast({ title: '已重置链接' });
                      } catch (e:any) { toast({ title: '重置失败', description: e?.message || '请稍后重试', variant: 'destructive' }); }
                    }}>重置链接</Button>
                  </div>
                </div>
              )}
              <div className="flex justify-end pt-2">
                <Button onClick={() => { onFinished?.(); onOpenChange(false); }}>完成</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
