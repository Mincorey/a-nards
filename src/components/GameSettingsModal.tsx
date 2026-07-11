/* =============================================================================
 * GameSettingsModal.tsx — Модалка настроек во время партии. Открывается по
 * шестерёнке у аватара и НЕ прерывает игру (партия под ботом продолжает идти).
 * Пока один раздел — «Настройки звука» с тумблером звука броска костей.
 * ========================================================================== */
import Modal from './Modal';
import { useDiceSoundEnabled, setDiceSoundEnabled } from '../lib/gameSettings';

export interface GameSettingsModalProps {
  onClose: () => void;
}

export default function GameSettingsModal({ onClose }: GameSettingsModalProps) {
  const diceSound = useDiceSoundEnabled();
  return (
    <Modal className="gset" onClose={onClose}>
      <h2 className="gset__title">Настройки игры</h2>

      <div className="gset__section">
        <h3 className="gset__section-title">Настройки звука</h3>
        <label className="gset__row">
          <span className="gset__label">Бросок костей</span>
          <button
            type="button"
            role="switch"
            aria-checked={diceSound}
            className={'toggle' + (diceSound ? ' is-on' : '')}
            onClick={() => setDiceSoundEnabled(!diceSound)}
          >
            <span className="toggle__knob" />
          </button>
        </label>
      </div>
    </Modal>
  );
}
