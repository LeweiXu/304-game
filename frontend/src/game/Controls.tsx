// Your seat: what to do now, the bidding panel, calls, and your hand.
import { useState } from 'react';
import { handPoints, sortHand, suitOf, type Action, type Card as CardId, type PlayerView } from '@engine';
import { Card } from './Card';
import { bidLabel, HUMAN, SEAT_NAMES, SUIT_NAME, SUIT_SYMBOL } from './labels';

type Props = { view: PlayerView; pausing: boolean; onAct: (a: Action) => void };

export default function Controls({ view, pausing, onAct }: Props) {
  const myTurn = view.toAct === HUMAN && !pausing && view.phase !== 'over';
  const legal = myTurn ? view.legal : [];
  const has = (type: Action['type']) => legal.some((a) => a.type === type);
  // Clicking a card means: choose it as trump, show it, or play it, depending on the phase.
  const cardAction = new Map<CardId, Action>();
  for (const a of legal) if (a.type === 'trump' || a.type === 'show' || a.type === 'play') cardAction.set(a.card, a);
  const indicator = view.trump?.indicator ?? null; // only set when you're the trumper and it's on the table
  const hand = sortHand(view.hand);

  return (
    <div className="you">
      <div className="you-bar">
        <SeatTag view={view} />
        <p className="prompt">{prompt(view, myTurn, pausing)}</p>
        {has('spoilt') && (
          <button type="button" className="link-btn"
            title="Void the game if the trumping team's opponents were dealt no trumps. A wrong call costs your team 1 stone."
            onClick={() => { if (window.confirm('Call Spoilt Trumps? If the trumping team\'s opponents were dealt any trump, your team pays 1 stone.')) onAct({ type: 'spoilt' }); }}>
            Spoilt Trumps?
          </button>
        )}
      </div>
      {myTurn && (view.phase === 'bid4' || view.phase === 'bid8') && (
        <BidPanel key={`${view.phase}-${view.bidding.speeches.length}`} view={view} onAct={onAct} />
      )}
      {myTurn && view.phase === 'declare' && (
        <div className="panel">
          <button type="button" className="btn primary" onClick={() => onAct({ type: 'declare', open: false })}>Play closed trump</button>
          <button type="button" className="btn" onClick={() => onAct({ type: 'declare', open: true })}>Declare open trump</button>
          {has('absolute') && <AbsoluteButton onAct={onAct} />}
        </div>
      )}
      {myTurn && view.phase === 'show' && has('absolute') && (
        <div className="panel"><AbsoluteButton onAct={onAct} /></div>
      )}
      {myTurn && view.phase === 'play' && has('claim') && (
        <div className="panel calls">
          <button type="button" className="btn primary" onClick={() => onAct({ type: 'claim' })}
            title="Your team has the points it needs: end the game now">Claim the game</button>
        </div>
      )}
      <div className="hand-row">
        <div className={`hand${cardAction.size ? ' choosing' : ''}`} aria-label="Your hand">
          {hand.map((c) => (
            <Card key={c} card={c} size="hand" onClick={() => onAct(cardAction.get(c)!)} disabled={!cardAction.has(c)} />
          ))}
        </div>
        {indicator && (
          <div className="indicator">
            <Card card={indicator} size="hand" tag="Trump" label={`Your folded trump card, ${indicator}`}
              onClick={() => onAct(cardAction.get(indicator)!)} disabled={!cardAction.has(indicator)} />
            <small>face down on the table</small>
          </div>
        )}
      </div>
    </div>
  );
}

function AbsoluteButton({ onAct }: { onAct: (a: Action) => void }) {
  return (
    <button type="button" className="btn" onClick={() => onAct({ type: 'absolute' })}
      title="You hold all eight trumps. Declaring it in goodwill passes the deal on with no stone exchanged.">Declare absolute hand</button>
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
  if (view.pccOut === HUMAN) return `You sit this game out: ${SEAT_NAMES[view.trump!.seat]} bid PCC.`;
  if (!myTurn) return view.toAct !== null ? `Waiting for ${SEAT_NAMES[view.toAct]}` : '';
  switch (view.phase) {
    case 'bid4': return `Your bid. You hold ${handPoints(view.hand)} points in 4 cards.`;
    case 'bid8': return `Your 8-card bid. You hold ${handPoints(view.hand) + (view.trump?.indicator ? handPoints([view.trump.indicator]) : 0)} points.`;
    case 'trump4':
    case 'trump8': return 'Pick a card to place face down. Its suit becomes trump.';
    case 'declare': return 'Play closed (trump stays hidden) or declare open trump?';
    case 'show': return view.pccOut !== null
      ? 'PCC is played open: pick a trump card to show the table.'
      : 'Open trump: pick a trump card to show the table. It goes back in your hand.';
    case 'play': {
      const p = view.play!;
      if (p.trick.length === 0) return view.trump?.mustLeadTrump ? 'Your lead. You declared open with priority, so lead a trump.' : 'Your lead.';
      const led = suitOf(p.trick[0].card!); // the lead is always face up
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
      {has('pcc') && (
        <button type="button" className="btn" onClick={() => onAct({ type: 'pcc' })}
          title="Partner Closed Caps: North sits out, you play open trump alone and must win all 8 rounds. 5 stone either way.">PCC</button>
      )}
      {has('redeal') && <button type="button" className="btn" onClick={() => onAct({ type: 'redeal' })} title="Under 15 points on 4 cards">Redeal</button>}
      {has('passOn') && <button type="button" className="btn" onClick={() => onAct({ type: 'passOn' })} title="Under 25 points on 8 cards">Pass on</button>}
    </div>
  );
}
