// 시제품 HTML(V74 등)에서 데이터 상수(const 이름 = [...] / {...})를 **실행하지 않고** 읽는다(CL-056: 콘텐츠 시트 전에는 시제품 콘텐츠로 시험).
// @babel/parser 로 문법 트리만 만들고, 글자·숫자·배열·객체로 된 값만 꺼낸다. 함수·변수·계산식이 섞인 값은 건너뛴다(null).
// 쓰기: import { readConstants } from './prototype-constants.mjs'; readConstants(html, ['HOLI_2026', 'AROUND'])
import { parse } from '@babel/parser';

/** 문법 트리 값 → JS 값. 글자·숫자·불·null·배열·객체·식 없는 템플릿 글자만 */
function literal(node) {
  if (!node) return undefined;
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'TemplateLiteral':
      return node.expressions.length ? undefined : node.quasis.map((q) => q.value.cooked).join('');
    case 'UnaryExpression':
      return node.operator === '-' && node.argument.type === 'NumericLiteral' ? -node.argument.value : undefined;
    case 'ArrayExpression': {
      const out = [];
      for (const el of node.elements) {
        const v = literal(el);
        if (v === undefined) return undefined;
        out.push(v);
      }
      return out;
    }
    case 'ObjectExpression': {
      const out = {};
      for (const p of node.properties) {
        if (p.type !== 'ObjectProperty' || p.computed) return undefined;
        const key = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' || p.key.type === 'NumericLiteral' ? String(p.key.value) : undefined;
        if (key === undefined) return undefined;
        const v = literal(p.value);
        if (v === undefined) return undefined;
        out[key] = v;
      }
      return out;
    }
    default:
      return undefined;
  }
}

/** HTML 안 <script> 들의 최상위 const 중 이름이 names 에 있는 것. 값이 글자·배열·객체만으로 된 것만 돌려준다 */
export function readConstants(html, names) {
  const want = new Set(names);
  const out = {};
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const code of scripts) {
    let ast;
    try {
      ast = parse(code, { sourceType: 'script', plugins: ['jsx'], errorRecovery: true });
    } catch {
      continue;
    }
    for (const st of ast.program.body) {
      if (st.type !== 'VariableDeclaration') continue;
      for (const d of st.declarations) {
        if (d.id.type === 'Identifier' && want.has(d.id.name)) {
          const v = literal(d.init);
          out[d.id.name] = v === undefined ? null : v;
        }
      }
    }
  }
  return out;
}
