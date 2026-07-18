/* =============================================================================
 * GameSettingsModal.tsx — Модалка настроек во время партии. Открывается по
 * шестерёнке у аватара и НЕ прерывает игру (партия под ботом продолжает идти).
 * Разделы: звук броска костей и фоновая музыка.
 * ========================================================================== */
import Modal from './Modal';
import {
  useDiceSoundEnabled, setDiceSoundEnabled,
  useBgMusicEnabled, setBgMusicEnabled,
  useSfxVolume, setSfxVolume,
  useMusicVolume, setMusicVolume,
} from '../lib/gameSettings';

export interface GameSettingsModalProps {
  onClose: () => void;
}

/** Ползунок громкости 0..100% в стиле проекта. Значение хранится как 0..1. */
function VolumeSlider({ label, value, onChange, disabled }: {
  label: string; value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className={'gset__slider' + (disabled ? ' is-disabled' : '')}>
      <div className="gset__slider-head">
        <span className="gset__label">{label}</span>
        <span className="gset__slider-val">{pct}%</span>
      </div>
      <input
        type="range" min={0} max={100} step={1} value={pct}
        aria-label={label}
        disabled={disabled}
        className="gset__range"
        style={{ ['--fill' as string]: pct + '%' }}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
    </div>
  );
}

export default function GameSettingsModal({ onClose }: GameSettingsModalProps) {
  const diceSound = useDiceSoundEnabled();
  const bgMusic = useBgMusicEnabled();
  const sfxVol = useSfxVolume();
  const musicVol = useMusicVolume();
  return (
    <Modal className="gset" onClose={onClose}>
      <h2 className="gset__title">Настройки игры</h2>

      <div className="gset__section">
        <h3 className="gset__section-title">Игровые звуки</h3>
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
        <VolumeSlider
          label="Громкость звуков"
          value={sfxVol}
          disabled={!diceSound}
          onChange={setSfxVolume}
        />
      </div>

      <div className="gset__section">
        <h3 className="gset__section-title">Фоновая музыка</h3>
        <label className="gset__row">
          <span className="gset__label">Фоновая музыка</span>
          <button
            type="button"
            role="switch"
            aria-checked={bgMusic}
            className={'toggle' + (bgMusic ? ' is-on' : '')}
            onClick={() => setBgMusicEnabled(!bgMusic)}
          >
            <span className="toggle__knob" />
          </button>
        </label>
        <VolumeSlider
          label="Громкость музыки"
          value={musicVol}
          disabled={!bgMusic}
          onChange={setMusicVolume}
        />
      </div>
    </Modal>
  );
}
