import { Camera, CameraResultType, CameraSource, type GalleryPhoto, type Photo } from '@capacitor/camera';
import { checkConnection, sendFiles, sendText } from './api';
import { clearBundle, loadBundle, maskToken, parseBundle, saveBundle, type MobileConnectionBundle } from './bundle';
import { ShareReceiver, type NativeSharePayload, type NativeSharedFile } from './native-share';
import { copy } from './copy';

type UploadItem = {
  label: string;
  status: 'success' | 'error' | 'pending';
  detail?: string;
};

type AppView = 'shell' | 'embedded';

const APP_VIEW_STORAGE_KEY = 'clip-relay-mobile.view';
const EMBEDDED_ACCESS_TOKEN_HASH_KEY = 'clipRelayAccessToken';
const EMBEDDED_BOOT_NONCE_HASH_KEY = 'clipRelayBootNonce';

function requireElement<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return node;
}

function getPreferredView(hasBundle: boolean): AppView {
  try {
    const raw = window.localStorage.getItem(APP_VIEW_STORAGE_KEY);
    if (raw === 'shell' || raw === 'embedded') {
      return raw;
    }
  } catch {}
  return hasBundle ? 'embedded' : 'shell';
}

function persistPreferredView(view: AppView) {
  try {
    window.localStorage.setItem(APP_VIEW_STORAGE_KEY, view);
  } catch {}
}

const appShell = requireElement<HTMLElement>('#app-shell');
const onboardingCard = requireElement<HTMLElement>('#onboarding-card');
const embeddedShell = requireElement<HTMLElement>('#embedded-shell');
const embeddedSummary = requireElement<HTMLDivElement>('#embedded-summary');
const embeddedFrame = requireElement<HTMLIFrameElement>('#embedded-frame');
const embeddedFallback = requireElement<HTMLDivElement>('#embedded-fallback');
const embeddedFallbackBadge = requireElement<HTMLSpanElement>('#embedded-fallback-badge');
const embeddedFallbackTitle = requireElement<HTMLHeadingElement>('#embedded-fallback-title');
const embeddedFallbackMessage = requireElement<HTMLParagraphElement>('#embedded-fallback-message');
const embeddedFallbackHint = requireElement<HTMLParagraphElement>('#embedded-fallback-hint');
const embeddedOpenBrowserButton = requireElement<HTMLButtonElement>('#embedded-open-browser-button');
const embeddedCopyUrlButton = requireElement<HTMLButtonElement>('#embedded-copy-url-button');
const embeddedBackShellPanelButton = requireElement<HTMLButtonElement>('#embedded-back-shell-panel-button');
const openEmbeddedButton = requireElement<HTMLButtonElement>('#open-embedded-button');
const reloadEmbeddedButton = requireElement<HTMLButtonElement>('#reload-embedded-button');
const backToShellButton = requireElement<HTMLButtonElement>('#back-to-shell-button');
const embeddedPickPhotosButton = requireElement<HTMLButtonElement>('#embedded-pick-photos-button');
const embeddedTakePhotoButton = requireElement<HTMLButtonElement>('#embedded-take-photo-button');
const embeddedImportNativeShareButton = requireElement<HTMLButtonElement>('#embedded-import-native-share-button');
const embeddedBackShellDockButton = requireElement<HTMLButtonElement>('#embedded-back-shell-dock-button');
const bundleInput = requireElement<HTMLTextAreaElement>('#bundle-input');
const bundleFile = requireElement<HTMLInputElement>('#bundle-file');
const importButton = requireElement<HTMLButtonElement>('#import-button');
const checkConnectionButton = requireElement<HTMLButtonElement>('#check-connection-button');
const openServerButton = requireElement<HTMLButtonElement>('#open-server-button');
const clearButton = requireElement<HTMLButtonElement>('#clear-button');
const bundleSummary = requireElement<HTMLDivElement>('#bundle-summary');
const nativeShareSummary = requireElement<HTMLDivElement>('#native-share-summary');
const importNativeShareButton = requireElement<HTMLButtonElement>('#import-native-share-button');
const textInput = requireElement<HTMLTextAreaElement>('#text-input');
const sendTextButton = requireElement<HTMLButtonElement>('#send-text-button');
const uploadFilesInput = requireElement<HTMLInputElement>('#upload-files');
const pickPhotosButton = requireElement<HTMLButtonElement>('#pick-photos-button');
const takePhotoButton = requireElement<HTMLButtonElement>('#take-photo-button');
const uploadList = requireElement<HTMLUListElement>('#upload-list');
const statusLog = requireElement<HTMLPreElement>('#status-log');

let pendingNativeShare: NativeSharePayload | null = null;
let nativeShareImportInFlight = false;
let nativeMediaActionInFlight = false;
let currentView: AppView = 'shell';
let embeddedLoadInFlight = false;
let embeddedLoadTimeoutId: number | null = null;
let embeddedBlockedReason: string | null = null;

function setStatus(message: string) {
  statusLog.textContent = `${new Date().toLocaleTimeString()} ${message}`;
}

function clearEmbeddedLoadTimeout() {
  if (embeddedLoadTimeoutId !== null) {
    window.clearTimeout(embeddedLoadTimeoutId);
    embeddedLoadTimeoutId = null;
  }
}

function getEmbeddedLaunchIssue(bundle: MobileConnectionBundle): string | null {
  try {
    const url = new URL(bundle.serverUrl);
    if (url.protocol !== 'https:') {
      return copy.embedded.targetNeedsHttps(bundle.serverUrl);
    }
  } catch {
    return copy.errors.invalidServerUrl;
  }
  return null;
}

function getActiveBundle(): MobileConnectionBundle | null {
  return loadBundle();
}

function setView(view: AppView) {
  currentView = view;
  persistPreferredView(view);
  appShell.classList.toggle('embedded-mode', view === 'embedded');
  embeddedShell.classList.toggle('hidden', view !== 'embedded');
  syncActionState();
}

function syncActionState() {
  const configured = Boolean(getActiveBundle());
  const nativeBusy = nativeShareImportInFlight || nativeMediaActionInFlight;
  const hasPendingSharedFiles = Boolean(pendingNativeShare?.uris?.length);
  const showEmbeddedActions = currentView === 'embedded';
  const showFallbackActions = showEmbeddedActions && Boolean(embeddedBlockedReason);
  checkConnectionButton.disabled = !configured || nativeBusy;
  openServerButton.disabled = !configured || nativeBusy;
  clearButton.disabled = !configured || nativeBusy;
  sendTextButton.disabled = !configured || nativeBusy;
  uploadFilesInput.disabled = !configured || nativeBusy;
  pickPhotosButton.disabled = !configured || nativeBusy;
  takePhotoButton.disabled = !configured || nativeBusy;
  embeddedPickPhotosButton.disabled = !configured || nativeBusy || !showEmbeddedActions;
  embeddedTakePhotoButton.disabled = !configured || nativeBusy || !showEmbeddedActions;
  importNativeShareButton.disabled = !configured || nativeBusy || !hasPendingSharedFiles;
  embeddedImportNativeShareButton.disabled = !configured || nativeBusy || !hasPendingSharedFiles || !showEmbeddedActions;
  openEmbeddedButton.disabled = !configured || nativeBusy || currentView === 'embedded';
  reloadEmbeddedButton.disabled = !configured || nativeBusy || currentView !== 'embedded' || embeddedLoadInFlight;
  backToShellButton.disabled = nativeBusy || currentView !== 'embedded';
  embeddedBackShellDockButton.disabled = nativeBusy || currentView !== 'embedded';
  embeddedOpenBrowserButton.disabled = !configured || nativeBusy || !showFallbackActions;
  embeddedCopyUrlButton.disabled = !configured || nativeBusy || !showFallbackActions;
  embeddedBackShellPanelButton.disabled = nativeBusy || !showFallbackActions;
}

function renderOnboarding(bundle: MobileConnectionBundle | null) {
  onboardingCard.classList.toggle('hidden', Boolean(bundle));
}

function renderShareImportButtons() {
  const count = pendingNativeShare?.uris?.length ?? 0;
  importNativeShareButton.textContent = count > 0 ? `${copy.buttons.importSharedFiles} (${count})` : copy.buttons.importSharedFiles;
  embeddedImportNativeShareButton.textContent = count > 0 ? `${copy.buttons.importSharedFilesShort} (${count})` : copy.buttons.importSharedFilesShort;
}

function applyEmbeddedFallbackCopy() {
  embeddedFallbackBadge.textContent = copy.embedded.fallbackBadge;
  embeddedFallbackTitle.textContent = copy.embedded.fallbackTitle;
  embeddedFallbackHint.textContent = copy.embedded.fallbackHint;
  embeddedOpenBrowserButton.textContent = copy.buttons.openInBrowser;
  embeddedCopyUrlButton.textContent = copy.buttons.copyAddress;
  embeddedBackShellPanelButton.textContent = copy.buttons.backToShell;
}

function renderEmbeddedFallback(bundle: MobileConnectionBundle | null, reason: string | null) {
  embeddedBlockedReason = reason;
  embeddedFallback.classList.toggle('hidden', !reason);
  embeddedFallbackMessage.textContent = reason ?? '';
  if (!bundle || !reason) {
    embeddedOpenBrowserButton.disabled = true;
    embeddedCopyUrlButton.disabled = true;
    embeddedBackShellPanelButton.disabled = true;
  }
  syncActionState();
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', 'true');
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    const success = document.execCommand('copy');
    document.body.removeChild(input);
    return success;
  }
}

function openBundleServer(bundle: MobileConnectionBundle) {
  window.open(bundle.serverUrl, '_blank', 'noopener,noreferrer');
}

function renderBundle(bundle: MobileConnectionBundle | null) {
  renderOnboarding(bundle);
  if (!bundle) {
    bundleSummary.className = 'summary-card empty-state';
    bundleSummary.textContent = copy.shell.noBundleImported;
    syncActionState();
    return;
  }

  bundleSummary.className = 'summary-card';
  bundleSummary.innerHTML = [
    `<span class="status-badge">${escapeHtml(copy.badges.configured)}</span>`,
    field(copy.fields.serverUrl, bundle.serverUrl),
    field(copy.fields.apiBase, bundle.apiBase),
    field(copy.fields.deviceToken, maskToken(bundle.accessToken)),
    field(copy.fields.generatedAt, new Date(bundle.generatedAt).toLocaleString()),
  ].join('');
  syncActionState();
}

function renderEmbeddedSummary(bundle: MobileConnectionBundle | null, status: string, badge = copy.embedded.badge.ready) {
  if (!bundle) {
    embeddedSummary.className = 'summary-card empty-state compact-card';
    embeddedSummary.textContent = copy.embedded.defaultEmpty;
    renderEmbeddedFallback(null, null);
    return;
  }

  renderEmbeddedFallback(bundle, null);
  embeddedSummary.className = 'summary-card compact-card';
  embeddedSummary.innerHTML = [
    `<span class="status-badge">${escapeHtml(badge)}</span>`,
    field(copy.fields.target, bundle.serverUrl),
    field(copy.fields.apiBase, bundle.apiBase),
    field(copy.fields.status, status),
  ].join('');
}

function renderNativeShare(payload: NativeSharePayload | null) {
  pendingNativeShare = payload;

  if (!payload) {
    nativeShareSummary.className = 'summary-card empty-state compact-card';
    nativeShareSummary.textContent = copy.shell.noNativeShareYet;
    renderShareImportButtons();
    syncActionState();
    return;
  }

  const uriCount = payload.uris?.length ?? 0;
  nativeShareSummary.className = 'summary-card compact-card';
  nativeShareSummary.innerHTML = [
    `<span class="status-badge">${escapeHtml(copy.badges.shareReceived)}</span>`,
    payload.action ? field(copy.fields.action, payload.action) : '',
    payload.mimeType ? field(copy.fields.mimeType, payload.mimeType) : '',
    payload.subject ? field(copy.fields.subject, payload.subject) : '',
    payload.text ? field(copy.fields.text, payload.text) : '',
    field(copy.fields.uriCount, String(uriCount)),
  ].join('');

  if (!textInput.value && payload.text) {
    textInput.value = payload.text;
  }

  renderShareImportButtons();
  syncActionState();
}

function renderUploadList(items: UploadItem[]) {
  if (!items.length) {
    uploadList.className = 'upload-list empty-list';
    uploadList.innerHTML = `<li>${escapeHtml(copy.shell.noUploadsYet)}</li>`;
    return;
  }

  uploadList.className = 'upload-list';
  uploadList.innerHTML = items
    .map((item) => {
      const className = item.status === 'success' ? 'upload-success' : item.status === 'error' ? 'upload-error' : '';
      const detail = item.detail ? ` - ${escapeHtml(item.detail)}` : '';
      return `<li class="${className}">${escapeHtml(item.label)}${detail}</li>`;
    })
    .join('');
}

function field(label: string, value: string): string {
  return `
    <div class="bundle-field">
      <span class="bundle-field-label">${escapeHtml(label)}</span>
      <span class="bundle-field-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmbeddedUrl(bundle: MobileConnectionBundle, forceReload = false): string {
  const url = new URL(bundle.serverUrl);
  const hash = new URLSearchParams();
  hash.set(EMBEDDED_ACCESS_TOKEN_HASH_KEY, bundle.accessToken);
  if (forceReload) {
    hash.set(EMBEDDED_BOOT_NONCE_HASH_KEY, String(Date.now()));
  }
  url.hash = hash.toString();
  return url.toString();
}

function openEmbeddedView(forceReload = false) {
  const bundle = getActiveBundle();
  if (!bundle) {
    return;
  }

  const launchIssue = getEmbeddedLaunchIssue(bundle);
  if (launchIssue) {
    embeddedFrame.removeAttribute('src');
    embeddedLoadInFlight = false;
    clearEmbeddedLoadTimeout();
    renderEmbeddedSummary(bundle, launchIssue, copy.embedded.badge.loadError);
    renderEmbeddedFallback(bundle, launchIssue);
    setView('embedded');
    setStatus(copy.status.embeddedBlocked(launchIssue));
    return;
  }

  const src = buildEmbeddedUrl(bundle, forceReload);
  renderEmbeddedFallback(bundle, null);
  clearEmbeddedLoadTimeout();
  embeddedLoadInFlight = true;
  renderEmbeddedSummary(bundle, copy.embedded.booting, copy.embedded.badge.launching);
  embeddedLoadTimeoutId = window.setTimeout(() => {
    embeddedLoadTimeoutId = null;
    if (!embeddedLoadInFlight) {
      return;
    }
    embeddedLoadInFlight = false;
    renderEmbeddedSummary(bundle, copy.embedded.loadTimeout, copy.embedded.badge.loadError);
    renderEmbeddedFallback(bundle, copy.embedded.loadTimeout);
    setStatus(copy.status.embeddedBlocked(copy.embedded.loadTimeout));
    syncActionState();
  }, 8000);
  if (embeddedFrame.src !== src) {
    embeddedFrame.src = src;
  } else if (forceReload) {
    embeddedFrame.src = src;
  }
  setView('embedded');
  setStatus(copy.status.openingEmbedded(bundle.serverUrl));
}

function closeEmbeddedView() {
  clearEmbeddedLoadTimeout();
  embeddedLoadInFlight = false;
  renderEmbeddedFallback(getActiveBundle(), null);
  setView('shell');
  const bundle = getActiveBundle();
  renderEmbeddedSummary(bundle, copy.embedded.standby, copy.embedded.badge.standby);
  setStatus(copy.status.returnedToShell);
}

function importRawBundle(raw: string) {
  const bundle = parseBundle(raw.trim());
  if (!bundle) {
    setStatus(copy.status.importFailed);
    return;
  }

  saveBundle(bundle);
  renderBundle(bundle);
  renderEmbeddedSummary(bundle, copy.embedded.imported, copy.embedded.badge.ready);
  bundleInput.value = JSON.stringify(bundle, null, 2);
  setStatus(copy.status.importedBundle(bundle.apiBase));
  openEmbeddedView(true);
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function createFileFromNativeShare(file: NativeSharedFile): File {
  const bytes = decodeBase64(file.base64);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy], file.name, {
    type: file.mimeType ?? 'application/octet-stream',
    lastModified: Date.now(),
  });
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

function getImageExtension(format?: string): string {
  const normalized = (format ?? 'jpeg').toLowerCase();
  if (normalized === 'jpeg') {
    return 'jpg';
  }
  return normalized.replace(/[^a-z0-9]/g, '') || 'jpg';
}

function getImageMimeType(extension: string): string {
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    default:
      return `image/${extension}`;
  }
}

function inferFileName(source: string | undefined, fallbackBase: string, extension: string): string {
  if (source) {
    try {
      const url = new URL(source);
      const segment = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      if (segment && segment.includes('.')) {
        return sanitizeFileName(segment);
      }
    } catch {
      const segment = decodeURIComponent(source.split('?')[0].split('#')[0].split('/').pop() ?? '');
      if (segment && segment.includes('.')) {
        return sanitizeFileName(segment);
      }
    }
  }

  return `${fallbackBase}.${extension}`;
}

async function createFileFromCameraAsset(asset: Pick<Photo, 'webPath' | 'path' | 'format'>, fallbackBase: string): Promise<File> {
  const sourceUrl = asset.webPath ?? asset.path;
  if (!sourceUrl) {
    throw new Error(copy.errors.noReadableCameraUrl);
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(copy.errors.unableToReadCapturedMedia(response.status));
  }

  const blob = await response.blob();
  const extension = getImageExtension(asset.format || blob.type.split('/')[1]);
  const fileName = inferFileName(sourceUrl, fallbackBase, extension);
  const mimeType = blob.type || getImageMimeType(extension);
  return new File([blob], fileName, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

function isProbablyCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel/i.test(message);
}

async function uploadFilesWithProgress(
  bundle: MobileConnectionBundle,
  files: FileList | File[],
  startMessage = copy.status.uploadBatchStart(Array.from(files).length),
  finishedMessage = copy.status.uploadBatchFinished,
): Promise<{ failedCount: number }> {
  const list = Array.from(files);
  const items: UploadItem[] = list.map((file) => ({
    label: file.name,
    status: 'pending',
    detail: copy.uploadDetail.waiting,
  }));

  renderUploadList(items);
  setStatus(startMessage);

  for (let index = 0; index < list.length; index += 1) {
    const file = list[index];
    items[index] = { label: file.name, status: 'pending', detail: copy.uploadDetail.uploading };
    renderUploadList(items);

    try {
      await sendFiles(bundle, [file]);
      items[index] = { label: file.name, status: 'success', detail: copy.uploadDetail.uploaded };
    } catch (error) {
      items[index] = {
        label: file.name,
        status: 'error',
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    renderUploadList(items);
  }

  const failedCount = items.filter((item) => item.status === 'error').length;
  if (failedCount > 0) {
    setStatus(copy.status.uploadBatchFinishedWithFailures(finishedMessage, failedCount));
  } else {
    setStatus(finishedMessage);
  }

  return { failedCount };
}

async function handlePhotoPicker() {
  const bundle = getActiveBundle();
  if (!bundle) {
    return;
  }

  nativeMediaActionInFlight = true;
  syncActionState();

  try {
    setStatus(copy.status.openingPhotoPicker);
    const result = await Camera.pickImages({
      quality: 90,
      limit: 12,
    });
    if (!result.photos.length) {
      setStatus(copy.status.noPhotosSelected);
      return;
    }

    const files = await Promise.all(
      result.photos.map((photo: GalleryPhoto, index) => createFileFromCameraAsset(photo, `gallery-${Date.now()}-${index + 1}`)),
    );
    await uploadFilesWithProgress(bundle, files, copy.status.galleryUploading(files.length), copy.status.galleryFinished);
  } catch (error) {
    if (isProbablyCancelled(error)) {
      setStatus(copy.status.photoPickerCancelled);
    } else {
      setStatus(copy.status.photoPickerFailed(error instanceof Error ? error.message : String(error)));
    }
  } finally {
    nativeMediaActionInFlight = false;
    syncActionState();
  }
}

async function handleCameraCapture() {
  const bundle = getActiveBundle();
  if (!bundle) {
    return;
  }

  nativeMediaActionInFlight = true;
  syncActionState();

  try {
    setStatus(copy.status.openingCamera);
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      allowEditing: false,
    });
    const file = await createFileFromCameraAsset(photo, `camera-${Date.now()}`);
    await uploadFilesWithProgress(bundle, [file], copy.status.cameraUploading, copy.status.cameraFinished);
  } catch (error) {
    if (isProbablyCancelled(error)) {
      setStatus(copy.status.cameraCancelled);
    } else {
      setStatus(copy.status.cameraFailed(error instanceof Error ? error.message : String(error)));
    }
  } finally {
    nativeMediaActionInFlight = false;
    syncActionState();
  }
}

async function bootstrapNativeShare() {
  try {
    const existing = await ShareReceiver.getPendingShare();
    if (existing) {
      renderNativeShare(existing);
      const uriCount = existing.uris?.length ?? 0;
      setStatus(copy.status.nativeShareDetected(uriCount));
    }

    await ShareReceiver.addListener('shareReceived', (payload) => {
      renderNativeShare(payload);
      const uriCount = payload.uris?.length ?? 0;
      setStatus(copy.status.nativeShareReceived(uriCount));
    });
  } catch {
    renderNativeShare(null);
  }
}

embeddedFrame.addEventListener('load', () => {
  clearEmbeddedLoadTimeout();
  embeddedLoadInFlight = false;
  const bundle = getActiveBundle();
  if (bundle) {
    renderEmbeddedSummary(bundle, copy.embedded.loadedAt(new Date().toLocaleTimeString()), copy.embedded.badge.live);
    renderEmbeddedFallback(bundle, null);
  }
  syncActionState();
});

embeddedFrame.addEventListener('error', () => {
  clearEmbeddedLoadTimeout();
  embeddedLoadInFlight = false;
  const bundle = getActiveBundle();
  if (bundle) {
    renderEmbeddedSummary(bundle, copy.embedded.loadError, copy.embedded.badge.loadError);
    renderEmbeddedFallback(bundle, copy.embedded.loadError);
    setStatus(copy.status.embeddedBlocked(copy.embedded.loadError));
  }
  syncActionState();
});

openEmbeddedButton.addEventListener('click', () => {
  openEmbeddedView(true);
});

reloadEmbeddedButton.addEventListener('click', () => {
  openEmbeddedView(true);
});

backToShellButton.addEventListener('click', () => {
  closeEmbeddedView();
});

importButton.addEventListener('click', () => {
  importRawBundle(bundleInput.value);
});

bundleFile.addEventListener('change', async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const raw = await file.text();
  importRawBundle(raw);
  input.value = '';
});

checkConnectionButton.addEventListener('click', async () => {
  const bundle = getActiveBundle();
  if (!bundle) return;
  setStatus(copy.status.checkingConnection(bundle.apiBase));
  const result = await checkConnection(bundle);
  if (result.ok) {
    setStatus(copy.status.connectionOk(result.detail));
  } else {
    setStatus(copy.status.connectionFailed(result.detail));
  }
});

openServerButton.addEventListener('click', () => {
  const bundle = getActiveBundle();
  if (!bundle) return;
  openBundleServer(bundle);
});

embeddedOpenBrowserButton.addEventListener('click', () => {
  const bundle = getActiveBundle();
  if (!bundle) return;
  openBundleServer(bundle);
});

embeddedCopyUrlButton.addEventListener('click', async () => {
  const bundle = getActiveBundle();
  if (!bundle) return;
  const copied = await copyText(bundle.serverUrl);
  setStatus(copied ? copy.status.copiedAddress : copy.status.copyAddressFailed);
});

embeddedBackShellPanelButton.addEventListener('click', () => {
  closeEmbeddedView();
});

clearButton.addEventListener('click', () => {
  clearBundle();
  clearEmbeddedLoadTimeout();
  embeddedFrame.removeAttribute('src');
  embeddedLoadInFlight = false;
  renderEmbeddedFallback(null, null);
  setView('shell');
  renderBundle(null);
  renderEmbeddedSummary(null, '');
  renderUploadList([]);
  setStatus(copy.status.bundleCleared);
});

sendTextButton.addEventListener('click', async () => {
  const bundle = getActiveBundle();
  if (!bundle) return;

  sendTextButton.disabled = true;
  try {
    await sendText(bundle, textInput.value);
    setStatus(copy.status.textSent);
    textInput.value = '';
  } catch (error) {
    setStatus(copy.status.textSendFailed(error instanceof Error ? error.message : String(error)));
  } finally {
    syncActionState();
  }
});

uploadFilesInput.addEventListener('change', async (event) => {
  const bundle = getActiveBundle();
  const input = event.currentTarget as HTMLInputElement;
  const files = input.files;
  if (!bundle || !files?.length) return;

  await uploadFilesWithProgress(bundle, files);
  input.value = '';
});

pickPhotosButton.addEventListener('click', () => {
  void handlePhotoPicker();
});

embeddedPickPhotosButton.addEventListener('click', () => {
  void handlePhotoPicker();
});

takePhotoButton.addEventListener('click', () => {
  void handleCameraCapture();
});

embeddedTakePhotoButton.addEventListener('click', () => {
  void handleCameraCapture();
});

async function handleImportNativeShare() {
  const bundle = getActiveBundle();
  const payload = pendingNativeShare;
  const uriCount = payload?.uris?.length ?? 0;
  if (!bundle || !payload || uriCount === 0) {
    return;
  }

  nativeShareImportInFlight = true;
  syncActionState();

  try {
    setStatus(copy.status.resolvingSharedFiles(uriCount));
    const result = await ShareReceiver.resolvePendingShareUris();
    const files = result.files.map(createFileFromNativeShare);
    if (!files.length) {
      setStatus(copy.status.noSharedFilesReturned);
      return;
    }

    const uploadResult = await uploadFilesWithProgress(
      bundle,
      files,
      copy.status.sharedUploading(files.length),
      copy.status.sharedFinished,
    );

    if (uploadResult.failedCount === 0) {
      await ShareReceiver.clearPendingShare().catch(() => undefined);
      renderNativeShare(null);
    }
  } catch (error) {
    setStatus(copy.status.sharedImportFailed(error instanceof Error ? error.message : String(error)));
  } finally {
    nativeShareImportInFlight = false;
    syncActionState();
  }
}

importNativeShareButton.addEventListener('click', () => {
  void handleImportNativeShare();
});

embeddedImportNativeShareButton.addEventListener('click', () => {
  void handleImportNativeShare();
});

embeddedBackShellDockButton.addEventListener('click', () => {
  closeEmbeddedView();
});

applyEmbeddedFallbackCopy();

const existing = loadBundle();
currentView = getPreferredView(Boolean(existing));
renderBundle(existing);
renderNativeShare(null);
renderShareImportButtons();
renderUploadList([]);
renderEmbeddedSummary(existing, existing ? copy.embedded.ready : '');
renderEmbeddedFallback(existing, null);
setView(currentView);
if (existing) {
  bundleInput.value = JSON.stringify(existing, null, 2);
  setStatus(copy.status.loadedSavedBundle(existing.apiBase));
  if (currentView === 'embedded') {
    openEmbeddedView(false);
  }
} else {
  setStatus(copy.status.readyForImport);
}

void bootstrapNativeShare();