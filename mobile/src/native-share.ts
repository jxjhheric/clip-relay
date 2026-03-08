import { registerPlugin } from '@capacitor/core';

export type NativeSharePayload = {
  action?: string;
  mimeType?: string;
  subject?: string;
  text?: string;
  uris?: string[];
};

export type NativeSharedFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  base64: string;
};

type ShareReceiverPlugin = {
  getPendingShare(): Promise<NativeSharePayload | null>;
  clearPendingShare(): Promise<void>;
  resolvePendingShareUris(): Promise<{ files: NativeSharedFile[] }>;
  addListener(
    eventName: 'shareReceived',
    listenerFunc: (payload: NativeSharePayload) => void,
  ): Promise<{ remove: () => Promise<void> }>;
};

export const ShareReceiver = registerPlugin<ShareReceiverPlugin>('ShareReceiver');
