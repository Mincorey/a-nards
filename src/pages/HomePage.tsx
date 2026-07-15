import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function HomePage() {
  const auth = useAuth();
  const profileLabel = auth.profile?.display_name || 'Профиль';
  return (
    <section className="home">
      {/* Полупрозрачная «стеклянная» панель отделяет текст и меню от фона
          и делает пункты читаемыми. Заголовок A-NARDS убран — он уже
          нарисован на самом фоновом изображении (lobby-bg.jpg). */}
      <div className="home__panel">
        <p className="home__subtitle">Классические и длинные нарды — онлайн и с ботом</p>
        <nav className="home__actions" aria-label="Основная навигация">
          <Link className="btn btn--ghost" to="/">Главная</Link>
          <Link className="btn btn--ghost" to="/ratings">Рейтинги</Link>
          <Link className="btn btn--primary" to="/play">Быстрая игра с ботом</Link>
          <Link className="btn" to="/lobby">Играть онлайн</Link>
          {auth.user ? (
            <Link className="btn" to="/profile">{profileLabel}</Link>
          ) : (
            <Link className="btn" to="/auth">Вход / Регистрация</Link>
          )}
        </nav>
      </div>
    </section>
  );
}
