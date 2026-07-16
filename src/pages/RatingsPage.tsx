/* =============================================================================
 * RatingsPage.tsx — таблица лидеров: все зарегистрированные игроки по убыванию
 * рейтинга (Elo). Колонки: место, игрок (аватар+имя+@логин), рейтинг, всего игр,
 * победы, процент побед. Топ-3 подсвечены (золото/серебро/бронза), строка
 * текущего пользователя выделяется. Читать профили может любой (RLS
 * profiles_select_all), так что страница работает и без входа.
 * ========================================================================== */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchLeaderboard, type LeaderboardRow } from '../lib/online';
import { useAuth } from '../lib/auth';

export default function RatingsPage() {
  const auth = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchLeaderboard()
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Не удалось загрузить рейтинги'); });
    return () => { alive = false; };
  }, []);

  return (
    <section className="ratings">
      <div className="ratings__head">
        <h1 className="ratings__title">Рейтинги игроков</h1>
        <Link className="btn btn--ghost" to="/">На главную</Link>
      </div>

      {error && <p className="auth__error" role="alert">{error}</p>}

      {!rows ? (
        <p className="ratings__hint">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="ratings__hint">Пока нет зарегистрированных игроков.</p>
      ) : (
        <div className="ratings__table-wrap">
          <table className="ratings__table">
            <thead>
              <tr>
                <th className="ratings__c-rank">#</th>
                <th className="ratings__c-player">Игрок</th>
                <th className="ratings__c-num">Рейтинг</th>
                <th className="ratings__c-num ratings__c-opt">Игры</th>
                <th className="ratings__c-num ratings__c-opt">Победы</th>
                <th className="ratings__c-num ratings__c-opt">Поражения</th>
                <th className="ratings__c-num">% побед</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rank = i + 1;
                const winPct = r.games_played > 0 ? Math.round((r.games_won / r.games_played) * 100) : 0;
                const me = auth.user?.id === r.id;
                const medal = rank <= 3 ? ` ratings__row--top${rank}` : '';
                const initial = (r.display_name || r.username || '?').charAt(0).toUpperCase();
                return (
                  <tr key={r.id} className={'ratings__row' + medal + (me ? ' is-me' : '')}>
                    <td className="ratings__c-rank"><span className="ratings__rank">{rank}</span></td>
                    <td className="ratings__c-player">
                      <Link className="ratings__player ratings__player--link" to={`/player/${r.id}`} title="Открыть профиль игрока">
                        <span className="ratings__ava">
                          {r.avatar_url ? <img src={r.avatar_url} alt="" /> : initial}
                        </span>
                        <span className="ratings__names">
                          <strong>{r.display_name}{me ? ' (вы)' : ''}</strong>
                        </span>
                      </Link>
                    </td>
                    <td className="ratings__c-num ratings__rating">{r.rating}</td>
                    <td className="ratings__c-num ratings__c-opt">{r.games_played}</td>
                    <td className="ratings__c-num ratings__c-opt">{r.games_won}</td>
                    <td className="ratings__c-num ratings__c-opt">{Math.max(0, r.games_played - r.games_won)}</td>
                    <td className="ratings__c-num">{winPct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
