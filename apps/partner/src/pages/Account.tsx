import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { CURRENCIES, LANGS, t } from '../i18n';
import { errText, supabase } from '../supabase';
import { Box, Msg, PageHead } from '../ui';
import StaffAccounts from './StaffAccounts';

// 0.3 내 계정: 담당자 정보, 비밀번호, 화면 언어, 기본 통화. 지점 대표는 직원 아이디 관리(CL-032)
export default function Account() {
  const { member, owner, reload } = useAuth();
  const [f, setF] = useState({ contact_name: member?.contact_name ?? '', phone: member?.phone ?? '', lang: member?.lang ?? 'ko', currency: member?.currency ?? 'KRW' });
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  if (!member) return <PageHead title={t('top.account')} />;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('agency_members').update(f).eq('user_id', member.user_id);
    setMsg(error ? { kind: 'err', text: errText(error) } : { kind: 'ok', text: t('common.saved') });
    if (!error) reload();
  };
  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ kind: 'err', text: '비밀번호는 8자 이상으로 정하세요.' });
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? { kind: 'err', text: errText(error) } : { kind: 'ok', text: '비밀번호를 바꿨습니다.' });
    setPw('');
  };

  return (
    <>
      <PageHead title={t('top.account')} />
      {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
      <div className="row">
        <Box title="지점 정보" className="grow-2">
          <div className="box-body">
            <table className="kv">
              <tbody>
                <tr><th>아이디</th><td>{member.email} <span className="muted">({member.role === 'staff' ? '직원' : '대표'})</span></td></tr>
                <tr><th>에이전시</th><td>{member.agency_name}</td></tr>
                <tr><th>지점</th><td>{member.branch || '-'}</td></tr>
                <tr><th>국가</th><td>{member.country || '-'}</td></tr>
              </tbody>
            </table>
            {member.role === 'staff' ? (
              <p className="muted" style={{ fontSize: 12 }}>지점 직원 아이디입니다. 지점 대표가 등록·정지합니다. 상담·자료·공지를 볼 수 있습니다.</p>
            ) : (
              <p className="muted" style={{ fontSize: 12 }}>에이전시명·지점을 바꾸려면 JIC 담당자에게 요청하세요. 담당자가 바뀌면 아래 담당자 정보만 고치고 같은 아이디를 인계합니다. 직원은 아래 '직원 아이디'에서 따로 등록합니다.</p>
            )}
          </div>
        </Box>
        <Box title="담당자·화면 설정" className="grow-2">
          <form className="form box-body" onSubmit={save}>
            <div className="form-grid">
              <label>담당자<input value={f.contact_name} onChange={set('contact_name')} /></label>
              <label>연락처<input value={f.phone} onChange={set('phone')} /></label>
              <label>
                화면 언어
                <select value={f.lang} onChange={set('lang')}>
                  {LANGS.map((l) => <option key={l.code} value={l.code} disabled={!l.ready}>{l.label}{l.ready ? '' : ` (${t('common.preparing')})`}</option>)}
                </select>
              </label>
              <label>
                기본 통화 (견적)
                <select value={f.currency} onChange={set('currency')}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div className="form-actions"><button type="submit" className="btn btn-primary">{t('common.save')}</button></div>
          </form>
        </Box>
      </div>
      {owner && <StaffAccounts />}
      <Box title="비밀번호 변경">
        <form className="form box-body" onSubmit={changePw} style={{ maxWidth: 420 }}>
          <label>새 비밀번호<input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <div className="form-actions"><button type="submit" className="btn">변경</button></div>
        </form>
      </Box>
    </>
  );
}
