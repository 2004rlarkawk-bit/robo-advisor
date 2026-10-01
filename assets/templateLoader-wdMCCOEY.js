function n(t,a){let r=null;return async()=>{if(r)return r;const e=await fetch(t);if(!e.ok)throw new Error(`${a} 로드 실패 (${e.status})`);return r=await e.arrayBuffer(),r}}export{n as c};
