// Your seat: what to do now, the bidding panel, and your hand.
import { useState } from 'react';
import { handPoints, sortHand, suitOf, type Action, type Card as CardId, type PlayerView } from '@engine';
import { Card } from './Card';
import { bidLabel, HUMAN, SEAT_NAMES, SUIT_NAME, SUIT_SYMBOL } from './labels';

type Props = { view: PlayerView; pausing: boolean; onAct: (a: Action) => void };

export default function Controls({ view, pausing, onAct }: Props) {
  const myTurn = view.toAct === HUMAN && !pausing && view.phase !== 'over';
  const legal = myTurn ? view.legal : [];
  const playable = new Set(legal.flatMap((a) => (a.type === 'play' || a.type === 'trump' ? [a.card] : [])));
  const picking = legal.some((a) => a.type === 'trump');
  const t = view.trump;
  const indicator = t?.indicator ?? null; // only set when you're the trumper and it's on the table
  const hand = sortHand(view.hand);

  const cardAction = (card: CardId): Action => (picking ? { type: 'trump', card } : { type: 'play', card });

  return (
    <div className="you">
      <div className="you-bar">
        <SeatTag view={view} />
        <p className="prompt">{prompt(view, myTurn, pausing)}</p>
      </div>
      {myTurn && (view.phase === 'bid4' || view.phase === 'bid8') && (
        <BidPanel key={`${view.phase}-${view.bidding.speeches.length}`} view={view} onAct={onAct} />
      )}
      {myTurn && view.phase === 'declare' && (
        <div className="panel">
          <button type="button" className="btn primary" onClick={() => onAct({ type: 'declare', open: false })}>Play closed trump</button>
          <button type="button" className="btn" onClick={() => onAct({ type: 'declare', open: true })}>Declare open trump</button>
        </div>
      )}
      <div className="hand-row">
        <div className={`hand${playable.size ? " choosing" : ""}`} aria-label="Your hand">
          {hand.map((c) => (
            <Card key={c} card={c} size="hand" onClick={() => onAct(cardAction(c))} disabled={!playable.has(c)} />
          ))}
        </div>
        {indicator && (
          <div className="indicator">
            <Card card={indicator} size="hand" tag="Trump" label={`Your folded trump card, ${indicator}`}
              onClick={() => onAct({ type: 'play', card: indicator })} disabled={!playable.has(indicator)} />
            <small>face down on the table</small>
          </div>
        )}
      </div>
    </div>
  );
}

function SeatTag({ view }: { view: PlayerView }) {
  const trumper = view.trump?.seat === HUMAN || (view.phase === 'trump4' && view.bid4?.seat === HUMAN) || (view.phase === 'trump8' && view.bid8?.seat === HUMAN);
  const active = view.toAct === HUMAN && view.phase !== 'over';
  return (
    <div className={`seat-tag team-0${active ? ' active' : ''}`}>
      <span>You</span>
      {view.dealer === HUMAN && <b className="badge" title="Dealer">D</b>}
      {trumper && <b className="badge trump" title="Trumper">T</b>}
    </div>
  );
}

function prompt(view: PlayerView, myTurn: boolean, pausing: boolean): string {
  if (view.phase === 'over') return '';
  if (pausing) return 'Have a look at the trick, then click Continue.';
  if (!myTurn) return view.toAct !== null ? `Waiting for ${SEAT_NAMES[view.toAct]}` : '';
  switch (view.phase) {
    case 'bid4': return `Your bid. You hold ${handPoints(view.hand)} points in 4 cards.`;
    case 'bid8': return `Your 8-card bid. You hold ${handPoints(view.hand) + (view.trump?.indicator ? handPoints([view.trump.indicator]) : 0)} points.`;
    case 'trump4':
    case 'trump8': return 'Pick a card to place face down. Its suit becomes trump.';
    case 'declare': return 'Play closed (trump stays hidden) or declare open trump?';
    case 'play': {
      const p = view.play!;
      if (p.trick.length === 0) return 'Your lead.';
      const led = suitOf(p.trick[0].card!);
      const canFollow = view.hand.some((c) => suitOf(c) === led);
      if (canFollow) return `Follow suit: ${SUIT_SYMBOL[led]} ${SUIT_NAME[led]}.`;
      if (!view.trump?.open && view.hand.length > 0) return "You can't follow suit, so your card goes face down: cut with a trump or throw away a minus.";
      return "You can't follow suit. Play any card.";
    }
    default: return '';
  }
}

function BidPanel({ view, onAct }: { view: PlayerView; onAct: (a: Action) => void }) {
  const values = view.legal.flatMap((a) => (a.type === 'bid' ? [a.value] : [])).sort((a, b) => a - b);
  const [i, setI] = useState(0);
  const has = (type: Action['type']) => view.legal.some((a) => a.type === type);
  const value = values[i];
  return (
    <div className="panel bid-panel">
      {values.length > 0 && (
        <div className="stepper">
          <button type="button" aria-label="Lower bid" disabled={i === 0} onClick={() => setI(i - 1)}>−</button>
          <output aria-live="polite">{bidLabel(value)}</output>
          <button type="button" aria-label="Raise bid" disabled={i === values.length - 1} onClick={() => setI(i + 1)}>+</button>
        </div>
      )}
      {values.length > 0 && <button type="button" className="btn primary" onClick={() => onAct({ type: 'bid', value })}>Bid {value}</button>}
      <button type="button" className="btn" onClick={() => onAct({ type: 'pass' })}>Pass</button>
      {has('partner') && <button type="button" className="btn" onClick={() => onAct({ type: 'partner' })} title="North bids or passes in your seat">Partner</button>}
      {has('redeal') && <button type="button" className="btn" onClick={() => onAct({ type: 'redeal' })} title="Under 15 points on 4 cards">Redeal</button>}
      {has('passOn') && <button type="button" className="btn" onClick={() => onAct({ type: 'passOn' })} title="Under 25 points on 8 cards">Pass on</button>}
    </div>
  );
}
