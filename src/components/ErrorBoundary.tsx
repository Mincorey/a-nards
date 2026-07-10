/* =============================================================================
 * ErrorBoundary.tsx — общий предохранитель рендера (аудит L5). Ловит
 * необработанные исключения в дереве компонентов и показывает дружелюбный экран
 * вместо «белой страницы». React ловит ошибки рендера только через class-компонент
 * с getDerivedStateFromError / componentDidCatch — функциональной альтернативы нет.
 * ========================================================================== */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; message: string; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Лог для диагностики (в проде можно заменить на отправку в мониторинг).
    console.error('Необработанная ошибка UI:', error, info?.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleHome = (): void => {
    // Полный переход на главную — сбрасывает и состояние приложения.
    window.location.assign('/');
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="errboundary" role="alert">
        <div className="errboundary__card">
          <h1 className="errboundary__title">Что-то пошло не так</h1>
          <p className="errboundary__text">
            Произошла непредвиденная ошибка в приложении. Обычно помогает обновление
            страницы. Если ошибка повторяется — вернитесь на главную.
          </p>
          <div className="errboundary__actions">
            <button type="button" className="btn btn--primary" onClick={this.handleReload}>
              Обновить страницу
            </button>
            <button type="button" className="btn" onClick={this.handleHome}>
              На главную
            </button>
          </div>
          {this.state.message && (
            <details className="errboundary__details">
              <summary>Техническая информация</summary>
              <code className="errboundary__code">{this.state.message}</code>
            </details>
          )}
        </div>
      </div>
    );
  }
}
