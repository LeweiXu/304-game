import { rankOf, suitOf, type Card as CardId } from '@engine';
import { isRed, SUIT_SYMBOL } from './labels';

type Props = {
  card: CardId;
  size?: 'hand' | 'table' | 'small';
  onClick?: () => void;
  disabled?: boolean;
  /** Extra marker, e.g. the folded trump card. */
  tag?: string;
  label?: string;
  /** Number shown on the card, e.g. its place in a declared caps order. */
  badge?: number;
};

export function Card({ card, size = 'table', onClick, disabled, tag, label, badge }: Props) {
  const suit = suitOf(card);
  const cls = `card card-${size}${isRed(suit) ? ' red' : ''}${tag ? ' tagged' : ''}`;
  const face = (
    <>
      <span className="corner"><b>{rankOf(card)}</b><i>{SUIT_SYMBOL[suit]}</i></span>
      <span className="pip" aria-hidden="true">{SUIT_SYMBOL[suit]}</span>
      {tag && <span className="card-tag">{tag}</span>}
      {badge !== undefined && <span className="card-badge">{badge}</span>}
    </>
  );
  const name = label ?? `${rankOf(card)} of ${{ c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' }[suit]}`;
  if (onClick !== undefined || disabled !== undefined) {
    return (
      <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-label={name}>{face}</button>
    );
  }
  return <span className={cls} role="img" aria-label={name}>{face}</span>;
}

export function CardBack({ size = 'small', tag, label = 'Face-down card' }: { size?: 'hand' | 'table' | 'small'; tag?: string; label?: string }) {
  return (
    <span className={`card card-${size} back${tag ? ' tagged' : ''}`} role="img" aria-label={label}>
      {tag && <span className="card-tag">{tag}</span>}
    </span>
  );
}
