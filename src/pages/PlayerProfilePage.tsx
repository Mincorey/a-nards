/* =============================================================================
 * PlayerProfilePage.tsx — просмотр публичного профиля другого игрока (открывается
 * кликом по имени в таблице рейтингов). Только для чтения: аватар, имя, рейтинг и
 * статистика. Кнопка «← К рейтингам» возвращает к таблице.
 * ========================================================================== */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchProfileById, type LeaderboardRow } from '../lib/online';
import { useAuth } from '../lib/auth';
import { winRate } from '../lib/username';

export default function PlayerProfilePage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const [p, setP] = useState<LeaderboardRow | null | undefined>(undefined); // undefined = загрузка
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setP(undefined); setError(null);
    fetchProfileById(id)
      .then((r) => { if (alive) setP(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Не удалось загрузить профиль'); });
    return () => { alive = false; };
  }, [id]);

  const me = auth.user?.id === id;
  const initials = (p?.display_name || p?.username || '?').slice(0, 1).toUpperCase();

  return (
    <section className="profile">
      <Link className="btn btn--back" to="/ratings">← К рейтингам</Link>
      <div className="card">
        {error ? (
          <p className="auth__error" role="alert">{error}</p>
        ) : p === undefined ? (
          <p>Загрузка…</p>
        ) : p === null ? (
          <p>Игрок не найден.</p>
        ) : (
          <>
            <div className="profile__head">
              <div className="avatar" aria-hidden>
                {p.avatar_url ? <img src={p.avatar_url} alt="" /> : <span className="avatar__ph">{initials}</span>}
              </div>
              <div className="profile__id">
                <h1>{p.display_name}{me ? ' (вы)' : ''}</h1>
                <p className="profile__uname">@{p.username}</p>
              </div>
            </div>

            <div className="stats">
              <div className="stat"><span className="stat__num">{p.rating}</span><span className="stat__lbl">Рейтинг</span></div>
              <div className="stat"><span className="stat__num">{p.games_played}</span><span className="stat__lbl">Партий</span></div>
              <div className="stat"><span className="stat__num">{p.games_won}</span><span className="stat__lbl">Побед</span></div>
              <div className="stat"><span className="stat__num">{winRate(p.games_played, p.games_won)}%</span><span className="stat__lbl">Винрейт</span></div>
            </div>

            {me && (
              <div className="profile__actions">
                <Link className="btn" to="/profile">Мой профиль</Link>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
