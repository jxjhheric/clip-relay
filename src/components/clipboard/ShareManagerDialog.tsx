"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth";
import { safeCopyText, isSecure } from "@/lib/copy";

export default function ShareManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [shares, setShares] = useState<Array<{
    token: string;
    url: string;
    item: { id: string; type: "TEXT" | "IMAGE" | "FILE"; fileName?: string | null; fileSize?: number | null };
    expiresAt?: string | null;
    maxDownloads?: number | null;
    downloadCount: number;
    revoked: boolean;
    requiresPassword: boolean;
    createdAt: string;
  }>>([]);
  const [hasMore, setHasMore] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (includeRevoked) params.set("includeRevoked", "1");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await authFetch(`/api/share?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "加载失败");
      setShares(json.data);
      setHasMore(json.hasMore);
    } catch (e: any) {
      toast({ title: "加载失败", description: e?.message || "请稍后重试", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, includeRevoked, page]);

  const revoke = async (token: string) => {
    try {
      const res = await authFetch(`/api/share/${token}/revoke`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "撤销失败");
      toast({ title: "已撤销" });
      await load();
    } catch (e: any) {
      toast({ title: "撤销失败", description: e?.message || "请稍后重试", variant: "destructive" });
    }
  };

  const removeShare = async (token: string) => {
    try {
      const res = await authFetch(`/api/share/${token}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "删除失败");
      toast({ title: "已删除" });
      await load();
    } catch (e: any) {
      toast({ title: "删除失败", description: e?.message || "请稍后重试", variant: "destructive" });
    }
  };

  const copy = async (url: string) => {
    const full = (window?.location?.origin || "") + url;
    const ok = await safeCopyText(full);
    if (ok) {
      toast({ title: "已复制" });
      return;
    }
    // Fallback UX for HTTP or restricted browsers
    try {
      const promptText = isSecure() ? "浏览器限制或权限不足，请手动复制：" : "当前为 HTTP 环境，系统复制受限，请手动复制：";
      // eslint-disable-next-line no-alert
      window.prompt(promptText, full);
    } catch {}
    toast({ title: "请手动复制", variant: "destructive" });
  };

  const expired = (s: any) => s.expiresAt && new Date(s.expiresAt).getTime() < Date.now();
  const exhausted = (s: any) => typeof s.maxDownloads === "number" && s.maxDownloads >= 0 && s.downloadCount >= s.maxDownloads;
  const invalid = (s: any) => s.revoked || expired(s) || exhausted(s);
  const statusText = (s: any) => {
    if (s.revoked) return "已撤销";
    if (expired(s)) return "已过期";
    if (exhausted(s)) return "已用尽";
    return "有效";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>分享管理</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-muted-foreground">共有 {shares.length} 条分享链接（第 {page} 页）</div>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={includeRevoked} onChange={(e) => { setIncludeRevoked(e.target.checked); setPage(1); }} />
            显示已失效（撤销/过期/用尽）
          </label>
        </div>
        <div className="overflow-x-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2">条目</th>
                <th className="text-left p-2">链接</th>
                <th className="text-left p-2">限制</th>
                <th className="text-left p-2">状态</th>
                <th className="text-right p-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-4">加载中...</td>
                </tr>
              ) : shares.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4">暂无分享</td>
                </tr>
              ) : (
                shares.map((s) => (
                  <tr key={s.token} className="border-t">
                    <td className="p-2">
                      <div className="text-xs text-muted-foreground">{s.item.type}</div>
                      <div className="max-w-[16rem] truncate">{s.item.fileName || s.item.id}</div>
                    </td>
                    <td className="p-2">
                      <div className="truncate max-w-[20rem] text-xs">{s.url}</div>
                    </td>
                    <td className="p-2">
                      <div className="text-xs text-muted-foreground">
                        {s.expiresAt ? `有效期至 ${new Date(s.expiresAt).toLocaleString("zh-CN")}` : "无有效期"}
                        {typeof s.maxDownloads === "number" && (
                          <> · 下载：{s.downloadCount}/{s.maxDownloads}</>
                        )}
                        {s.requiresPassword && <> · 口令保护</>}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className={`text-xs ${invalid(s) ? "text-destructive" : "text-foreground"}`}>{statusText(s)}</div>
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => copy(s.url)}>复制</Button>
                        {!s.revoked && <Button variant="outline" size="sm" onClick={() => revoke(s.token)}>撤销</Button>}
                        <Button variant="outline" size="sm" onClick={() => removeShare(s.token)}>删除</Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center mt-3">
          <div className="text-xs text-muted-foreground">每页 {pageSize} 条</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              上一页
            </Button>
            <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
