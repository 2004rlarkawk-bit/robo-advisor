import { supabase } from '../lib/supabase';
import type {
  TradeAttachment,
  TradeAttachmentDocumentType,
} from '../types/tradeFormData';

const TRADE_DOCUMENTS_BUCKET =
  (import.meta.env.VITE_SUPABASE_TRADE_DOCUMENTS_BUCKET as string | undefined)?.trim()
  || 'trade-documents';

function errorField(error: unknown, field: 'code' | 'message'): string {
  if (!error || typeof error !== 'object') return '';
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value.trim() : '';
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
    this.code = input.code || errorField(input.cause, 'code') || 'STORAGE_DOWNLOAD_FAILED';
    this.bucket = input.bucket;
    this.maskedStoragePath = maskStoragePath(input.storagePath);
    this.documentType = input.documentType || 'other';
    this.fileName = input.fileName;
    this.cause = input.cause;
  }
}

function safeFileName(fileName: string): string {
  const normalized = fileName.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'document';
}

export async function uploadTradeAttachment(input: {
  userId: string;
  scopeId: string;
  documentType: TradeAttachmentDocumentType;
  file: File;
}): Promise<TradeAttachment> {
  const id = crypto.randomUUID();
  const storagePath = [
    input.userId,
    input.scopeId,
    input.documentType,
    `${id}-${safeFileName(input.file.name)}`,
  ].join('/');
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
  const { error } = await supabase.storage
    .from(input.storageBucket)
    .remove([input.storagePath]);
  if (error) throw error;
}

export async function loadTradeAttachmentFile(
  attachment: Pick<
    TradeAttachment,
    'storageBucket' | 'storagePath' | 'fileName' | 'mimeType'
  > & Partial<Pick<TradeAttachment, 'documentType'>>,
): Promise<File> {
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError || !authData.session) {
    throw new TradeAttachmentDownloadError({
      cause: authError,
      code: 'AUTH_SESSION_REQUIRED',
      bucket: attachment.storageBucket,
      storagePath: attachment.storagePath,
      documentType: attachment.documentType,
      fileName: attachment.fileName,
      message: '인증 세션을 확인할 수 없습니다.',
    });
  }
  const { data, error } = await supabase.storage
    .from(attachment.storageBucket)
    .download(attachment.storagePath);
  if (error || !data) {
    throw new TradeAttachmentDownloadError({
      cause: error,
      bucket: attachment.storageBucket,
      storagePath: attachment.storagePath,
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
    const segments = attachment.storagePath.split('/');
    if (segments[0] !== input.userId) {
      throw new Error('첨부파일 Storage 경로의 사용자 범위가 일치하지 않습니다.');
    }
    if (segments[1] === input.scopeId) {
      moved.push(attachment);
      continue;
    }
    const fileSegment = segments[segments.length - 1];
    if (!fileSegment) throw new Error('첨부파일 Storage 경로가 올바르지 않습니다.');
    const nextPath = [
      input.userId,
      input.scopeId,
      attachment.documentType,
      fileSegment,
    ].join('/');
    const { error } = await supabase.storage
      .from(attachment.storageBucket)
      .move(attachment.storagePath, nextPath);
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
      from: attachment.storagePath,
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
    const paths = pathsByBucket.get(attachment.storageBucket) ?? new Set<string>();
    paths.add(attachment.storagePath);
    pathsByBucket.set(attachment.storageBucket, paths);
  });

  for (const [storageBucket, paths] of pathsByBucket) {
    const { error } = await supabase.storage
      .from(storageBucket)
      .remove([...paths]);
    if (error) throw error;
  }
}
