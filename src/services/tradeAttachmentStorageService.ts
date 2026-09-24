import { supabase } from '../lib/supabase';
import type {
  TradeAttachment,
  TradeAttachmentDocumentType,
} from '../types/tradeFormData';

const TRADE_DOCUMENTS_BUCKET =
  (import.meta.env.VITE_SUPABASE_TRADE_DOCUMENTS_BUCKET as string | undefined)?.trim()
  || 'trade-documents';

function errorField(
  error: unknown,
  field: 'code' | 'error' | 'message' | 'status' | 'statusCode',
): string {
  if (!error || typeof error !== 'object') return '';
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

export function maskStoragePath(storagePath: string): string {
  const segments = storagePath.split('/');
  if (segments.length === 0 || !segments[0]) return storagePath;
  return ['<user>', ...segments.slice(1)].join('/');
}

export class TradeAttachmentDownloadError extends Error {
  readonly cause?: unknown;
  readonly code: string;
  readonly bucket: string;
  readonly maskedStoragePath: string;
  readonly documentType: string;
  readonly fileName: string;
  readonly status: string;

  constructor(input: {
    cause?: unknown;
    code?: string;
    bucket: string;
    storagePath: string;
    documentType?: string;
    fileName: string;
    message?: string;
  }) {
    const detail = input.message
      || errorField(input.cause, 'message')
      || '알 수 없는 Storage 오류';
    super(`저장된 파일 내용을 불러오지 못했습니다. 파일 정보는 유지되며 필요하면 다시 업로드할 수 있습니다. (${detail})`);
    this.name = 'TradeAttachmentDownloadError';
    this.code = input.code
      || errorField(input.cause, 'code')
      || errorField(input.cause, 'error')
      || 'STORAGE_DOWNLOAD_FAILED';
    this.bucket = input.bucket;
    this.maskedStoragePath = maskStoragePath(input.storagePath);
    this.documentType = input.documentType || 'other';
    this.fileName = input.fileName;
    this.status = errorField(input.cause, 'statusCode') || errorField(input.cause, 'status');
    this.cause = input.cause;
  }
}

function safeFileName(fileName: string): string {
  const normalized = fileName.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'document';
}

export function normalizeStorageObjectPath(bucket: string, storagePath: string): string {
  const normalizedBucket = bucket.trim();
  const normalizedPath = storagePath.trim().replace(/^\/+/, '');
  if (!normalizedBucket || !normalizedPath) {
    throw new Error('첨부파일 Storage bucket 또는 경로가 비어 있습니다.');
  }
  if (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedPath)
    || normalizedPath.startsWith(`${normalizedBucket}/`)
    || normalizedPath.includes('\\')
    || normalizedPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('첨부파일 Storage 경로는 bucket 내부 상대 경로여야 합니다.');
  }
  return normalizedPath;
}

function storagePathOwner(storagePath: string): string {
  return storagePath.split('/')[0] ?? '';
}

/** 파일을 옮기는 작업은 올린 화주 본인만 한다 — 포워더에게는 열람만 허용한다. */
function assertStoragePathOwner(storagePath: string, userId: string): void {
  if (storagePathOwner(storagePath) !== userId) {
    throw new Error('첨부파일 Storage 경로의 사용자 범위가 일치하지 않습니다.');
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 이 파일이 "내가 배정받은 거래"의 첨부인지 확인한다.
 *
 * trades는 RLS로 본인 거래와 배정된 거래만 읽히므로(trades_select_assigned_forwarder),
 * 조회에서 내 uid가 forwarder_user_id로 확인되면 그 거래의 첨부를 열 권한이 있다.
 * 포워더 역할이라는 이유만으로는 통과하지 않는다 — 그 거래의 배정자여야 한다.
 */
async function isAssignedForwarderAttachment(
  storagePath: string,
  authenticatedUserId: string,
): Promise<boolean> {
  const scope = storagePath.split('/')[1] ?? '';
  try {
    // 거래 저장 후 올린 파일: 경로 두 번째 칸이 거래 id다.
    if (UUID_PATTERN.test(scope)) {
      const { data, error } = await supabase
        .from('trades')
        .select('forwarder_user_id')
        .eq('id', scope)
        .maybeSingle();
      if (error) return false;
      return data?.forwarder_user_id === authenticatedUserId;
    }
    // 거래 저장 전(draft) 올린 파일: 배정받은 거래의 첨부 목록에 실려 있는지 본다.
    const { data, error } = await supabase
      .from('trades')
      .select('form_data')
      .eq('forwarder_user_id', authenticatedUserId);
    if (error || !data) return false;
    return data.some((row) => {
      const attachments = (row as { form_data?: { attachments?: unknown } }).form_data?.attachments;
      return Array.isArray(attachments)
        && attachments.some((item) => (item as { storagePath?: string })?.storagePath === storagePath);
    });
  } catch {
    return false;
  }
}

/**
 * 첨부파일을 열 수 있는 사람 — 올린 화주 본인, 또는 그 거래에 배정된 포워더.
 * 최종 차단은 Storage RLS가 하고, 여기서는 같은 기준으로 미리 걸러 낸다.
 */
async function assertStoragePathAccess(
  storagePath: string,
  authenticatedUserId: string,
): Promise<void> {
  // 본인이 올린 파일은 그대로 열린다.
  if (storagePathOwner(storagePath) === authenticatedUserId) return;
  if (await isAssignedForwarderAttachment(storagePath, authenticatedUserId)) return;
  throw new Error('첨부파일 Storage 경로의 사용자 범위가 일치하지 않습니다.');
}

async function resolveAuthenticatedStorageUserId(): Promise<string> {
  let sessionFailure: unknown;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error && data.session?.user.id) return data.session.user.id;
    sessionFailure = error;
  } catch (error) {
    sessionFailure = error;
  }

  // 새로고침 직후 getSession의 로컬 세션 판독이 일시적으로 실패해도,
  // 서버 검증이 가능한 세션이면 getUser가 토큰 복원을 완료할 수 있습니다.
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user?.id) return data.user.id;
    sessionFailure = error ?? sessionFailure;
  } catch (error) {
    sessionFailure = error;
  }

  throw new TradeAttachmentDownloadError({
    cause: sessionFailure,
    code: 'AUTH_SESSION_REQUIRED',
    bucket: TRADE_DOCUMENTS_BUCKET,
    storagePath: '<unknown>',
    fileName: '<unknown>',
    message: '인증 세션을 확인할 수 없습니다.',
  });
}

export async function uploadTradeAttachment(input: {
  userId: string;
  scopeId: string;
  documentType: TradeAttachmentDocumentType;
  file: File;
}): Promise<TradeAttachment> {
  const id = crypto.randomUUID();
  const storagePath = normalizeStorageObjectPath(TRADE_DOCUMENTS_BUCKET, [
    input.userId,
    input.scopeId,
    input.documentType,
    `${id}-${safeFileName(input.file.name)}`,
  ].join('/'));
  const mimeType = input.file.type || 'application/octet-stream';
  const { error } = await supabase.storage
    .from(TRADE_DOCUMENTS_BUCKET)
    .upload(storagePath, input.file, {
      contentType: mimeType,
      upsert: false,
    });
  if (error) throw error;

  return {
    id,
    documentType: input.documentType,
    fileName: input.file.name,
    storageBucket: TRADE_DOCUMENTS_BUCKET,
    storagePath,
    mimeType,
    sizeBytes: input.file.size,
    uploadedAt: new Date().toISOString(),
  };
}

export async function removeTradeAttachment(input: {
  storageBucket: string;
  storagePath: string;
}): Promise<void> {
  const storagePath = normalizeStorageObjectPath(input.storageBucket, input.storagePath);
  const { error } = await supabase.storage
    .from(input.storageBucket)
    .remove([storagePath]);
  if (error) throw error;
}

export async function loadTradeAttachmentFile(
  attachment: Pick<
    TradeAttachment,
    'storageBucket' | 'storagePath' | 'fileName' | 'mimeType'
  > & Partial<Pick<TradeAttachment, 'documentType'>>,
  expectedUserId?: string,
): Promise<File> {
  const bucket = attachment.storageBucket.trim();
  let storagePath: string;
  try {
    storagePath = normalizeStorageObjectPath(bucket, attachment.storagePath);
  } catch (error) {
    throw new TradeAttachmentDownloadError({
      cause: error,
      code: 'INVALID_STORAGE_PATH',
      bucket,
      storagePath: attachment.storagePath,
      documentType: attachment.documentType,
      fileName: attachment.fileName,
    });
  }

  let authenticatedUserId: string;
  try {
    authenticatedUserId = await resolveAuthenticatedStorageUserId();
  } catch (error) {
    if (error instanceof TradeAttachmentDownloadError) {
      throw new TradeAttachmentDownloadError({
        cause: error.cause,
        code: error.code,
        bucket,
        storagePath,
        documentType: attachment.documentType,
        fileName: attachment.fileName,
        message: '인증 세션을 확인할 수 없습니다.',
      });
    }
    throw error;
  }
  if (expectedUserId && authenticatedUserId !== expectedUserId) {
    throw new TradeAttachmentDownloadError({
      code: 'AUTH_USER_MISMATCH',
      bucket,
      storagePath,
      documentType: attachment.documentType,
      fileName: attachment.fileName,
      message: '현재 사용자와 첨부파일 사용자가 일치하지 않습니다.',
    });
  }
  try {
    await assertStoragePathAccess(storagePath, authenticatedUserId);
  } catch (error) {
    throw new TradeAttachmentDownloadError({
      cause: error,
      code: 'STORAGE_PATH_USER_MISMATCH',
      bucket,
      storagePath,
      documentType: attachment.documentType,
      fileName: attachment.fileName,
    });
  }
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(storagePath);
  if (error || !data) {
    throw new TradeAttachmentDownloadError({
      cause: error,
      bucket,
      storagePath,
      documentType: attachment.documentType,
      fileName: attachment.fileName,
    });
  }
  return new File([data], attachment.fileName, {
    type: attachment.mimeType || data.type || 'application/octet-stream',
  });
}

export async function moveTradeAttachmentsToScope(input: {
  userId: string;
  scopeId: string;
  attachments: TradeAttachment[];
}): Promise<TradeAttachment[]> {
  const moved: TradeAttachment[] = [];
  const completedMoves: Array<{ bucket: string; from: string; to: string }> = [];
  for (const attachment of input.attachments) {
    const currentPath = normalizeStorageObjectPath(
      attachment.storageBucket,
      attachment.storagePath,
    );
    const segments = currentPath.split('/');
    assertStoragePathOwner(currentPath, input.userId);
    if (segments[1] === input.scopeId) {
      moved.push({ ...attachment, storagePath: currentPath });
      continue;
    }
    const fileSegment = segments[segments.length - 1];
    if (!fileSegment) throw new Error('첨부파일 Storage 경로가 올바르지 않습니다.');
    const nextPath = normalizeStorageObjectPath(attachment.storageBucket, [
      input.userId,
      input.scopeId,
      attachment.documentType,
      fileSegment,
    ].join('/'));
    const { error } = await supabase.storage
      .from(attachment.storageBucket)
      .move(currentPath, nextPath);
    if (error) {
      const rollbackFailures: string[] = [];
      for (const completed of [...completedMoves].reverse()) {
        const { error: rollbackError } = await supabase.storage
          .from(completed.bucket)
          .move(completed.to, completed.from);
        if (rollbackError) rollbackFailures.push(maskStoragePath(completed.to));
      }
      if (rollbackFailures.length > 0) {
        throw new Error(`첨부파일 경로 이동과 복구에 실패했습니다: ${rollbackFailures.join(', ')}`);
      }
      throw error;
    }
    completedMoves.push({
      bucket: attachment.storageBucket,
      from: currentPath,
      to: nextPath,
    });
    moved.push({ ...attachment, storagePath: nextPath });
  }
  return moved;
}

export async function removeTradeAttachments(
  attachments: TradeAttachment[],
): Promise<void> {
  const pathsByBucket = new Map<string, Set<string>>();
  attachments.forEach((attachment) => {
    if (!attachment.storageBucket?.trim() || !attachment.storagePath?.trim()) return;
    const storagePath = normalizeStorageObjectPath(
      attachment.storageBucket,
      attachment.storagePath,
    );
    const paths = pathsByBucket.get(attachment.storageBucket) ?? new Set<string>();
    paths.add(storagePath);
    pathsByBucket.set(attachment.storageBucket, paths);
  });

  for (const [storageBucket, paths] of pathsByBucket) {
    const { error } = await supabase.storage
      .from(storageBucket)
      .remove([...paths]);
    if (error) throw error;
  }
}
