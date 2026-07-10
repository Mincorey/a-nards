import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

type Mode = 'signin' | 'signup' | 'reset';

const HUMAN_ERR: Record<string, string> = {
  'Invalid login credentials': 'Неверный email или пароль',
  'User already registered': 'Пользователь с таким email уже зарегистрирован',
  'Password should be at least 6 characters': 'Пароль должен быть не короче 6 символов',
  'Email not confirmed': 'Email не подтверждён — проверьте почту',
};
const humanize = (m: string) => HUMAN_ERR[m] ?? m;

export default function AuthPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!auth.configured) {
    return (
      <section className="auth">
        <div className="card">
          <h1>Вход недоступен</h1>
          <p>Не заданы переменные Supabase. Заполните <code>.env.local</code> по образцу
            <code>.env.example</code> и перезапустите приложение.</p>
        </div>
      </section>
    );
  }

  if (auth.user) {
    return (
      <section className="auth">
        <div className="card">
          <h1>Вы уже вошли</h1>
          <p>Аккаунт: <strong>{auth.user.email}</strong></p>
          <button className="btn btn--primary" onClick={() => nav('/profile')}>В профиль</button>
          <button className="btn" onClick={() => auth.signOut()}>Выйти</button>
        </div>
      </section>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    try {
      if (mode === 'signin') {
        await auth.signIn(email.trim(), password);
        nav('/profile');
      } else if (mode === 'signup') {
        const { needsEmailConfirm } = await auth.signUp(email.trim(), password, displayName.trim() || undefined);
        if (needsEmailConfirm) {
          setInfo('Регистрация принята. Проверьте почту и подтвердите email, затем войдите.');
          setMode('signin');
        } else {
          nav('/profile');
        }
      } else {
        await auth.sendPasswordReset(email.trim());
        setInfo('Если такой email существует, мы отправили ссылку для сброса пароля.');
        setMode('signin');
      }
    } catch (err) {
      setError(humanize(err instanceof Error ? err.message : 'Ошибка. Попробуйте ещё раз.'));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'signin' ? 'Вход' : mode === 'signup' ? 'Регистрация' : 'Сброс пароля';

  return (
    <section className="auth">
      <form className="card auth__form" onSubmit={submit}>
        <h1>{title}</h1>

        {mode !== 'reset' && (
          <div className="auth__tabs">
            <button type="button" className={'chip' + (mode === 'signin' ? ' is-active' : '')}
              onClick={() => { setMode('signin'); setError(null); setInfo(null); }}>Вход</button>
            <button type="button" className={'chip' + (mode === 'signup' ? ' is-active' : '')}
              onClick={() => { setMode('signup'); setError(null); setInfo(null); }}>Регистрация</button>
          </div>
        )}

        {mode === 'signup' && (
          <label className="field">
            <span>Отображаемое имя</span>
            <input type="text" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Например: Олег" autoComplete="nickname" />
          </label>
        )}

        <label className="field">
          <span>Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" autoComplete="email" />
        </label>

        {mode !== 'reset' && (
          <label className="field">
            <span>Пароль</span>
            <input type="password" required minLength={6} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="не менее 6 символов"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </label>
        )}

        {error && <p className="auth__error" role="alert">{error}</p>}
        {info && <p className="auth__info">{info}</p>}

        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? 'Подождите…' : title}
        </button>

        <div className="auth__links">
          {mode === 'signin' && (
            <button type="button" className="linkbtn" onClick={() => { setMode('reset'); setError(null); setInfo(null); }}>
              Забыли пароль?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="linkbtn" onClick={() => { setMode('signin'); setError(null); setInfo(null); }}>
              ← Назад ко входу
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
