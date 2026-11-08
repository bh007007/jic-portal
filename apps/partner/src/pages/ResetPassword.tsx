import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { errText, supabase } from '../supabase';
import { Box, Msg } from '../ui';

// 비밀번호 재설정 메일의 링크로 들어오는 화면. 링크를 누르면 임시 로그인 상태가 된다.
export default function ResetPassword() {
  const { session } = useAuth();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ kind: 'err', text: '비밀번호는 8자 이상으로 정하세요.' });
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? { kind: 'err', text: errText(error) } : { kind: 'ok', text: '새 비밀번호를 저장했습니다.' });
  };

  return (
    <div className="auth">
      <Box title="새 비밀번호">
        <form className="form box-body" onSubmit={submit}>
          {!session ? (
            <Msg kind="err">링크가 만료되었거나 잘못되었습니다. 로그인 화면의 '비밀번호 찾기'를 다시 이용하세요.</Msg>
          ) : (
            <>
              <label>새 비밀번호<input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
              <button type="submit" className="btn btn-primary btn-lg">저장</button>
            </>
          )}
          {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
          <Link to="/">처음으로</Link>
        </form>
      </Box>
    </div>
  );
}
