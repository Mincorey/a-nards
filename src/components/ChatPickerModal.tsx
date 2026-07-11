/* =============================================================================
 * ChatPickerModal.tsx — Модалка выбора готовой фразы (мобильный ЛАНДШАФТ).
 * Открывается по иконке чата в стойке кнопок игрока и НЕ прерывает партию
 * (как и модалка настроек — без паузы). Выбор фразы отправляет её и закрывает
 * модалку; сообщение всплывает облачком под аватаром отправителя.
 * ========================================================================== */
import Modal from './Modal';
import { CHAT_PHRASES } from '../game/chat';

export interface ChatPickerModalProps {
  onPick: (text: string) => void;
  onClose: () => void;
}

export default function ChatPickerModal({ onPick, onClose }: ChatPickerModalProps) {
  return (
    <Modal className="chatpick" onClose={onClose}>
      <h2 className="gset__title">Сообщение</h2>
      <ul className="chatpick__list">
        {CHAT_PHRASES.map((p) => (
          <li key={p}>
            <button
              type="button"
              className="chatpick__option"
              onClick={() => { onPick(p); onClose(); }}
            >
              {p}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
