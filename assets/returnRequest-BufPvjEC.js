import{j as i}from"./index-auN9Csgu.js";const c=`안녕하세요.
수입 서류 검토 중 아래 항목의 보완을 요청드립니다.`,o=`확인 후 수정한 서류와 함께 회신 부탁드립니다.
감사합니다.`;function h(e,n,t){const s=[n.trim(),"포워더",t.trim()].filter(Boolean).join(" ");return`${c}

${e}

${o}

${s} 드림`}function d(e){const n=`

${o}

`,t=e.lastIndexOf(n);return!e.startsWith(`${c}

`)||t<c.length||!e.endsWith(" 드림")?{body:e}:{greeting:c,body:e.slice(c.length+2,t),closing:o,signature:e.slice(t+n.length)}}function f(e){const n=[];let t={kind:"note",title:"요청 내용",lines:[]};const s=()=>{t.lines.join(`
`).trim()&&n.push(t)};for(const r of e.split(/\r?\n/))if(r.trim()==="[반드시 수정]"||r.trim()==="[함께 확인 요청]"){s();const l=r.trim()==="[반드시 수정]";t={kind:l?"required":"recommended",title:l?"필수 수정":"추가 확인",lines:[]}}else r.startsWith("(추가 안내)")?(s(),t={kind:"note",title:"전달 메모",lines:[r.slice(7).trimStart()]}):t.lines.push(r);return s(),n}function b({reason:e}){const n=d(e),t=f(n.body);return i.jsxs("div",{className:"fwd-return-sections",children:[n.greeting&&i.jsx("p",{className:"fwd-return-letter-text",children:n.greeting}),t.map((s,r)=>i.jsxs("div",{className:`fwd-return-section is-${s.kind}`,children:[i.jsx("h3",{children:s.title}),i.jsx("p",{children:s.lines.join(`
`).trim()})]},r)),n.closing&&i.jsxs("div",{className:"fwd-return-letter-ending",children:[i.jsx("p",{className:"fwd-return-letter-text",children:n.closing}),i.jsx("p",{className:"fwd-return-letter-signature",children:n.signature})]})]})}const a=[{type:"commercial_invoice",label:"상업송장(C/I)"},{type:"packing_list",label:"포장명세서(P/L)"},{type:"bill_of_lading",label:"선하증권(B/L)"},{type:"certificate_of_origin",label:"원산지증명서(C/O)"},{type:"other",label:"기타 서류"}],m={missing:{label:"서류 누락",sentence:"첨부된 파일이 없습니다. 서류를 올려 주세요."},unreadable:{label:"판독 어려움",sentence:"스캔 상태가 흐려 내용을 확인하기 어렵습니다. 선명한 파일로 다시 올려 주세요."},reissue:{label:"원본·재발행 필요",sentence:"현재 파일로는 신고에 사용할 수 없습니다. 원본이나 재발행본을 보내 주세요."},check:{label:"내용 확인 필요",sentence:"기재 내용 확인이 필요합니다. 전달 메모를 참고해 수정해 주세요."}},x=["missing","unreadable","reissue","check"],p=new Map(a.map(e=>[e.type,e.label]));function u(e){return p.get(e)??e}function R(e){const n=a.map(t=>t.type);return[...e].sort((t,s)=>n.indexOf(t.type)-n.indexOf(s.type))}function E(e,n=""){const t=R(e).map(r=>{const l=m[r.reason];return`• ${u(r.type)} · ${l.label} — ${l.sentence}`}),s=n.trim();return[...t.length?["[반드시 수정]",...t]:[],...s?[`(추가 안내) ${s}`]:[]].join(`
`)}function y(e){var n,t;if((n=e.documentTypes)!=null&&n.length){const s=a.map(r=>r.type);return[...e.documentTypes].sort((r,l)=>s.indexOf(r)-s.indexOf(l)).map(u)}return((t=e.issueTitles)==null?void 0:t.filter(Boolean))??[]}export{b as F,a as R,E as a,h as b,x as c,m as d,u as e,y as r};
