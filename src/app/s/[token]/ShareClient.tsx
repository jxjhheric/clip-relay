"use client";
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

type ShareMeta = {
  token: string;
  item: {
    id: string;
    type: 'TEXT' | 'IMAGE' | 'FILE';
    fileName?: string | null;
    fileSize?: number | null;
    contentType?: string | null;
    content?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  expiresAt?: string | null;
  maxDownloads?: number | null;
  downloadCount: number;
  requiresPassword: boolean;
  authorized: boolean;
};

export default function ShareClient({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [pwd, setPwd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchMeta = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/share/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed');
      setMeta(data);
    } catch (e) {
      toast({ title: '链接不可用', description: '该分享已过期或被撤销', variant: 'destructive' });
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeta();
  }, [token]);

  const verify = async () => {
    try {
      setSubmitting(true);
      const res = await fetch(`/api/share/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'verify failed');
      setPwd('');
      await fetchMeta();
    } catch (e) {
      toast({ title: '口令错误', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="text-xl font-semibold">分享无效</div>
          </CardHeader>
          <CardContent>该分享链接已失效或被撤销。</CardContent>
        </Card>
      </div>
    );
  }

  if (meta.requiresPassword && !meta.authorized) {
    return (
      <div className="max-w-sm mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="text-xl font-semibold">请输入口令</div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Input type="password" placeholder="输入分享口令" value={pwd} onChange={(e) => setPwd(e.target.value)} />
              <Button onClick={verify} disabled={submitting || !pwd.trim()}>
                {submitting ? '验证中...' : '验证'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fileSize = (n?: number | null) => {
    if (!n || n <= 0) return '';
    const k = 1024; const sizes = ['B','KB','MB','GB']; const i = Math.floor(Math.log(n)/Math.log(k));
    return `${(n/Math.pow(k,i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">共享条目</div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {meta.expiresAt ? `有效期至：${new Date(meta.expiresAt).toLocaleString('zh-CN')}` : '无明确有效期'}
            {typeof meta.maxDownloads === 'number' && (
              <>
                {' '}· 下载：{meta.downloadCount}/{meta.maxDownloads}
              </>
            )}
          </div>

          {meta.item.type === 'TEXT' && (
            <div>
              <div className="bg-muted p-4 rounded">
                <pre className="whitespace-pre-wrap text-sm">{meta.item.content}</pre>
              </div>
              <div className="mt-3">
                <a className="underline" href={`/api/share/${token}/download`}>下载为文本文件</a>
              </div>
            </div>
          )}

          {meta.item.type === 'IMAGE' && (
            <div>
              <img
                src={`/api/share/${token}/file`}
                alt={meta.item.fileName || 'image'}
                className="max-h-[60vh] rounded"
                loading="lazy"
                decoding="async"
              />
              <div className="mt-2 text-sm text-muted-foreground">
                {meta.item.fileName} {fileSize(meta.item.fileSize)}
              </div>
              <div className="mt-3">
                <a className="underline" href={`/api/share/${token}/download`}>下载图片</a>
              </div>
            </div>
          )}

          {meta.item.type === 'FILE' && (
            <div>
              <div className="text-sm">{meta.item.fileName} {fileSize(meta.item.fileSize)}</div>
              <div className="mt-3">
                <a className="underline" href={`/api/share/${token}/download`}>下载文件</a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
