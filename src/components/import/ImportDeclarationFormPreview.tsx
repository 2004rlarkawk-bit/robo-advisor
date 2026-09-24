/**
 * 수입신고서(초안) 미리보기 — 서식 원본 이미지 위에 값을 같은 좌표로 얹어 보여준다.
 *
 * docx 미리보기 렌더러는 절대 좌표 프레임을 지원하지 않아 값이 다음 쪽에 줄줄이 나온다.
 * 다운로드 docx와 같은 좌표(importDeclarationFormLayout)를 쓰므로 화면과 파일이 같은 모양이다.
 * 값이 없는 2·3쪽(작성방법·처리절차)은 화면에 띄우지 않는다.
 */
import {
  IMPORT_DECLARATION_FIELDS,
  IMPORT_DECLARATION_PAGE_PX,
} from '../../services/importDeclarationFormLayout';
import formPageUrl from '../../../templates/import-declaration/page1.png?url';

const { width: PAGE_W, height: PAGE_H } = IMPORT_DECLARATION_PAGE_PX;
const percent = (value: number, total: number) => `${(value / total) * 100}%`;

interface Props {
  /** 템플릿 placeholder 이름 → 값 */
  values: Record<string, string>;
}

export default function ImportDeclarationFormPreview({ values }: Props) {
  return (
    <div className="import-decl-form-preview">
      <img src={formPageUrl} alt="수입신고서 서식" />
      {IMPORT_DECLARATION_FIELDS.map((field) => {
        const value = values[field.name];
        if (!value) return null;
        return (
          <span
            key={field.name}
            className="import-decl-form-value"
            style={{
              left: percent(field.x, PAGE_W),
              top: percent(field.y, PAGE_H),
              width: percent(field.w, PAGE_W),
            }}
          >
            {value}
          </span>
        );
      })}
    </div>
  );
}
