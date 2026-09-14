import { loadTradeAttachmentFile } from '../services/tradeAttachmentStorageService';
import type { TradeAttachment } from '../types/tradeFormData';

/**
 * 첨부파일을 새 탭으로 열거나 다운로드한다.
 * 포워더 수입 워크스페이스(ForwarderImportWorkspace)의 원본 서류 열기/도착통지서 다운로드와
 * 동일한 방식 — Storage에서 내려받아 blob URL을 새 탭 또는 다운로드 링크로 연다.
 */
export async function openOrDownloadTradeAttachment(
  attachment: TradeAttachment,
  userId: string,
  download: boolean,
): Promise<void> {
  const file = await loadTradeAttachmentFile(attachment, userId);
  const url = URL.createObjectURL(file);
  if (download) {
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
