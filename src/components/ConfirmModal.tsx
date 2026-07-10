/* =============================================================================
 * ConfirmModal.tsx — единая красивая модалка подтверждения (выход из партии,
 * выход из стола, выход из аккаунта и т.п.), чтобы не плодить разный код и вид
 * в каждом месте, где нужно подтверждение необратимого действия.
 * ========================================================================== */
import Modal from './Modal';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open, title, message, confirmLabel = 'Да', cancelLabel = 'Отмена', danger, onConfirm, onCancel,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <Modal onClose={onCancel}>
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      <div className="profile__actions">
        <button
          type="button"
          className={'btn ' + (danger ? 'btn--danger' : 'btn--primary')}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>
      </div>
    </Modal>
  );
}
