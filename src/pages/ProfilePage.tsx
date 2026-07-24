import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { validateUsername, winRate } from '../lib/username';
import ConfirmModal from '../components/ConfirmModal';
import { IconPencil } from '../components/icons';
import { WALLET_BALANCE_RUB, formatRub } from '../lib/wallet';
import { formatRuPhone, ruPhoneToE164 } from '../lib/phone';

export default function ProfilePage() {
  const auth = useAuth();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const [walletNote, setWalletNote] = useState<string | null>(null);

  if (!auth.ready) {
    return <section className="profile"><div className="card"><p>Загрузка…</p></div></section>;
  }

  if (!auth.user) {
    return (
      <section className="profile">
        <div className="card">
          <h1>Профиль</h1>
          <p>Войдите в аккаунт, чтобы видеть профиль, рейтинг и статистику.</p>
          <button className="btn btn--primary" onClick={() => nav('/auth')}>Войти / Зарегистрироваться</button>
        </div>
      </section>
    );
  }

  const p = auth.profile;

  function startEdit() {
    setUsername(p?.username ?? '');
    setDisplayName(p?.display_name ?? '');
    setPhone(p?.phone ? formatRuPhone(p.phone) : '');
    setError(null);
    setEditing(true);
  }

  async function save() {
    setError(null);
    const u = validateUsername(username);
    if (!u.ok) { setError(u.error ?? 'Некорректный username'); return; }
    if (!displayName.trim()) { setError('Укажите отображаемое имя'); return; }
    if (displayName.trim().length > 40) { setError('Отображаемое имя — не длиннее 40 символов'); return; }
    let phoneVal: string | null = null;
    if (phone.trim()) {
      const e164 = ruPhoneToE164(phone);
      if (!e164) { setError('Введите номер телефона полностью: +7 (XXX) XXX-XX-XX'); return; }
      phoneVal = e164;
    }
    setBusy(true);
    try {
      await auth.updateProfile({ username: username.trim(), display_name: displayName.trim(), phone: phoneVal });
      setEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения';
      setError(/duplicate|unique/i.test(msg) ? 'Этот username уже занят' : msg);
    } finally {
      setBusy(false);
    }
  }

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Файл должен быть изображением'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Размер аватара до 5 МБ'); return; }
    setError(null); setBusy(true);
    try {
      await auth.uploadAvatar(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить аватар');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const initials = (p?.display_name || auth.user.email || '?').slice(0, 1).toUpperCase();

  return (
    <section className="profile">
      <div className="card">
        <div className="profile__head">
          <button className="avatar" onClick={() => fileRef.current?.click()} disabled={busy}
            title="Сменить аватар" aria-label="Сменить аватар">
            {p?.avatar_url
              ? <img src={p.avatar_url} alt="Аватар" />
              : <span className="avatar__ph">{initials}</span>}
            <span className="avatar__edit"><IconPencil /></span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />

          <div className="profile__id">
            {!editing ? (
              <>
                <h1>{p?.display_name ?? '—'}</h1>
                <p className="profile__uname">@{p?.username ?? '—'}</p>
                <p className="profile__email">{auth.user.email}</p>
                {p?.phone && <p className="profile__phone">{formatRuPhone(p.phone)}</p>}
              </>
            ) : (
              <div className="profile__edit">
                <label className="field">
                  <span>Отображаемое имя</span>
                  <input value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} />
                </label>
                <label className="field">
                  <span>Username (латиница, цифры, _)</span>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} />
                </label>
                <label className="field">
                  <span>Телефон</span>
                  <input type="tel" inputMode="tel" value={phone} placeholder="+7 (___) ___-__-__"
                    onChange={(e) => setPhone(formatRuPhone(e.target.value))} />
                  <span className="field__hint">Нужен для вывода средств из внутриигрового кошелька.</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {error && <p className="auth__error" role="alert">{error}</p>}

        {!editing ? (
          <div className="profile__actions">
            <button className="btn" onClick={startEdit}>Редактировать</button>
            <button className="btn" onClick={() => setConfirmOut(true)}>Выйти</button>
          </div>
        ) : (
          <div className="profile__actions">
            <button className="btn btn--primary" onClick={save} disabled={busy}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button className="btn" onClick={() => setEditing(false)} disabled={busy}>Отмена</button>
          </div>
        )}

        <div className="stats">
          <div className="stat"><span className="stat__num">{p?.rating ?? 1200}</span><span className="stat__lbl">Рейтинг</span></div>
          <div className="stat"><span className="stat__num">{p?.games_played ?? 0}</span><span className="stat__lbl">Партий</span></div>
          <div className="stat"><span className="stat__num">{p?.games_won ?? 0}</span><span className="stat__lbl">Побед</span></div>
          <div className="stat"><span className="stat__num">{winRate(p?.games_played ?? 0, p?.games_won ?? 0)}%</span><span className="stat__lbl">Винрейт</span></div>
        </div>

        {/* Внутриигровой кошелёк (пока заглушка — платёжная система позже) */}
        <div className="wallet">
          <div className="wallet__top">
            <span className="wallet__label">Баланс кошелька</span>
            <span className="wallet__amount">{formatRub(WALLET_BALANCE_RUB)}</span>
          </div>
          <div className="wallet__top wallet__top--coins">
            <span className="wallet__label">Игровой баланс A-COINS</span>
            <span className="wallet__amount">{(p?.coins ?? 0).toLocaleString('ru-RU')}</span>
          </div>
          <div className="wallet__actions">
            <button className="btn btn--primary" onClick={() => setWalletNote('Пополнение баланса скоро будет доступно — платёжная система в разработке.')}>
              Пополнить баланс
            </button>
            <button className="btn" onClick={() => setWalletNote('Вывод средств скоро будет доступен — платёжная система в разработке.')}>
              Вывести средства
            </button>
          </div>
          {walletNote && <p className="wallet__note">{walletNote}</p>}
        </div>

        {!p && (
          <p className="profile__hint">
            Профиль ещё не загружен. Если вы только что применили миграцию — обновите страницу.
          </p>
        )}
      </div>

      <ConfirmModal
        open={confirmOut}
        title="Выйти из аккаунта?"
        message="Вы сможете войти снова в любой момент по email и паролю."
        confirmLabel="Выйти"
        danger
        onConfirm={() => { setConfirmOut(false); auth.signOut(); }}
        onCancel={() => setConfirmOut(false)}
      />
    </section>
  );
}
