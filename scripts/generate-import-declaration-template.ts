/**
 * 수입신고서 docx 템플릿 생성기 (영구 스크립트).
 *
 * 관세법 시행규칙 [별지 제1호의3서식] 수입신고서 **원본 서식 이미지를 그대로 깔고**,
 * 값이 들어갈 자리에만 {{placeholder}}를 좌표로 얹는다. 서식을 새로 그리지 않으므로
 * 관보 서식과 생김새가 100% 같다.
 *
 * 좌표는 원본 이미지(2480x3505px, A4 300dpi) 기준 픽셀이며, twip으로 환산해 프레임에 넣는다.
 * 칸 위치를 고칠 때는 FIELDS의 픽셀 좌표만 바꾸면 된다.
 *
 * 사용: npx tsx scripts/generate-import-declaration-template.ts
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType, Document, FrameAnchorType, HorizontalPositionRelativeFrom, ImageRun, Packer,
  Paragraph, TextRun, VerticalPositionRelativeFrom,
} from 'docx';
// 좌표는 화면 미리보기와 같은 파일을 쓴다 — 한쪽만 고쳐 어긋나는 일을 막는다.
import {
  IMPORT_DECLARATION_FIELDS as FIELDS,
  IMPORT_DECLARATION_PAGE_PX,
} from '../src/services/importDeclarationFormLayout';

const FONT = '맑은 고딕';
/** 원본 이미지 해상도 — A4 300dpi */
const PAGE_PX = IMPORT_DECLARATION_PAGE_PX;
/** A4 실제 크기(twip): 210mm × 297mm */
const PAGE_TWIP = { width: 11906, height: 16838 };
const toTwipX = (px: number) => Math.round((px * PAGE_TWIP.width) / PAGE_PX.width);
const toTwipY = (px: number) => Math.round((px * PAGE_TWIP.height) / PAGE_PX.height);



/**
 * 서식 이미지 한 장 — 글 뒤(배경)에 페이지를 가득 채우도록 띄운다.
 * 본문 흐름을 차지하면 값 프레임이 다음 쪽으로 밀리므로 반드시 floating(behindDocument)이어야 한다.
 */
function pageImage(data: Buffer): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
    alignment: AlignmentType.LEFT,
    children: [new ImageRun({
      type: 'png',
      data,
      // 96dpi 기준 픽셀 = 210mm × 297mm
      transformation: { width: 794, height: 1123 },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
        behindDocument: true,
        allowOverlap: true,
      },
    })],
  });
}

/** 값 한 칸 — 서식 이미지 위에 절대 좌표로 얹는 프레임 문단. */
function fieldFrame(field: { name: string; x: number; y: number; w: number }): Paragraph {
  return new Paragraph({
    frame: {
      type: 'absolute',
      position: { x: toTwipX(field.x), y: toTwipY(field.y) },
      width: toTwipX(field.w),
      height: toTwipY(90),
      anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
      wrap: 'none',
    },
    spacing: { before: 0, after: 0 },
    children: [new TextRun({ text: `{{${field.name}}}`, size: 16, font: FONT })],
  });
}

/** 값이 없는 쪽(2·3쪽)은 흐름 안에 그대로 넣는다. */
function pageImageRun(data: Buffer): ImageRun {
  return new ImageRun({ type: 'png', data, transformation: { width: 794, height: 1123 } });
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outIndex = process.argv.indexOf('--out');
  const outPath = outIndex >= 0
    ? process.argv[outIndex + 1]
    : path.join(root, 'templates', 'import_declaration_template.docx');
  const imageDir = path.join(root, 'templates', 'import-declaration');
  const [page1, page2, page3] = await Promise.all([
    fs.readFile(path.join(imageDir, 'page1.png')),
    fs.readFile(path.join(imageDir, 'page2.png')),
    fs.readFile(path.join(imageDir, 'page3.png')),
  ]);

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 16 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_TWIP.width, height: PAGE_TWIP.height },
          margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0, gutter: 0 },
        },
      },
      children: [
        // 1쪽 — 배경 서식 + 값 프레임(같은 쪽에 얹힌다)
        pageImage(page1),
        ...FIELDS.map(fieldFrame),
        // 2·3쪽 — 작성방법·처리절차(값 없음)
        new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0 }, children: [pageImageRun(page2)] }),
        new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0 }, children: [pageImageRun(page3)] }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buffer);
  console.log(`수입신고서 템플릿 생성: ${outPath} (${buffer.length.toLocaleString()} bytes, 값 ${FIELDS.length}칸)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
