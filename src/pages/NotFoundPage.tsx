import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="page">
      <h1 className="page__title">404</h1>
      <p>Страница не найдена.</p>
      <Link className="btn" to="/">На главную</Link>
    </section>
  );
}
