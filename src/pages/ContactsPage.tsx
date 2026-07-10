import { Link } from 'react-router-dom';

export default function ContactsPage() {
  return (
    <section className="legal">
      <Link className="btn btn--back" to="/">← На главную</Link>
      <div className="card legal__card">
        <h1 className="page__title">Контакты</h1>
        <p>
          Есть вопрос, предложение или нашли баг — напишите нам, будем рады
          обратной связи.
        </p>
        <p>
          Электронная почта:{' '}
          <a className="legal__mail" href="mailto:support@a-nards.ru">support@a-nards.ru</a>
        </p>
        <p className="legal__hint">
          Мы стараемся отвечать в течение нескольких рабочих дней. Пожалуйста,
          опишите проблему как можно подробнее — это поможет нам разобраться
          быстрее.
        </p>
      </div>
    </section>
  );
}
