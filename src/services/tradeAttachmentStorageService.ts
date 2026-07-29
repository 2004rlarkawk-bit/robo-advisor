import { supabase } from '../lib/supabase';
import type {
  TradeAttachment,
  TradeAttachmentDocumentType,
} from '../types/tradeFormData';

const TRADE_DOCUMENTS_BUCKET =
  (import.meta.env.VITE_SUPABASE_TRADE_DOCUMENTS_BUCKET as string | undefined)?.trim()
  || 'trade-documents';

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
