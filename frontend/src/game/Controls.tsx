// Your seat: what to do now, the bidding panel, calls, and your hand.
import { useEffect, useState } from 'react';
import { handPoints, sortHand, suitOf, type Action, type Card as CardId, type PlayerView } from '@engine';
import { Card } from './Card';
import { bidLabel, HUMAN, SEAT_NAMES, SUIT_NAME, SUIT_SYMBOL } from './labels';

type Props = { view: PlayerView; pausing: boolean; hints: boolean; onAct: (a: Action) => void };

export default function Controls({ view, pausing, hints, onAct }: Props) {
  const myTurn = view.toAct === HUMAN && !pausing && view.phase !== 'over';
  const legal = myTurn ? view.legal : [];
  const has = (type: Action['type']) => legal.some((a) => a.type === type);
  const indicator = view.trump?.indicator ?? null; // only set when you're the trumper and it's on the table
  const hand = sortHand(view.hand);
  const allMine = indicator ? [...hand, indicator] : hand;

  // Declaring caps: click your cards in the order you'll play them, then confirm.
  const [capsOrder, setCapsOrder] = useState<CardId[] | null>(null);
  useEffect(() => { if (!has('caps')) setCapsOrder(null); }); // the chance is gone (or it's not your turn)

  // Clicking a card means: choose it as trump, show it, play it, or add it to a caps order.
  const cardAction = new Map<CardId, Action>();
  for (const a of legal) if (a.type === 'trump' || a.type === 'show' || a.type === 'play') cardAction.set(a.card, a);
  const clickable = (c: CardId) => (capsOrder ? !capsOrder.includes(c) : cardAction.has(c));
  const click = (c: CardId) => {
    if (capsOrder) setCapsOrder([...capsOrder, c]);
    else onAct(cardAction.get(c)!);
  };
  const badge = (c: CardId) => (capsOrder && capsOrder.includes(c) ? capsOrder.indexOf(c) + 1 : undefined);

  return (
    <div className="you">
      <div className="you-bar">
        <SeatTag view={view} />
        <p className="prompt">{capsOrder ? 'Click your cards in the order you will play them.' : prompt(view, myTurn, pausing, hints)}</p>
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
      {myTurn && view.phase === 'play' && capsOrder && (
        <div className="panel calls">
          <button type="button" className="btn primary" disabled={capsOrder.length !== allMine.length}
            onClick={() => { onAct({ type: 'caps', order: capsOrder }); setCapsOrder(null); }}>Confirm caps</button>
          <button type="button" className="btn" disabled={!capsOrder.length} onClick={() => setCapsOrder(capsOrder.slice(0, -1))}>Undo</button>
          <button type="button" className="btn subtle" onClick={() => setCapsOrder(null)}>Cancel</button>
        </div>
      )}
      {myTurn && view.phase === 'play' && !capsOrder && (has('claim') || has('caps') || has('balance')) && (
        <div className="panel calls">
          {has('caps') && (
            <button type="button" className="btn" onClick={() => setCapsOrder([])}
              title="Your team wins every remaining round, whatever the others hold. Declare the order you'll play your cards.">Call caps</button>
          )}
          {has('balance') && (
            <button type="button" className="btn" onClick={() => onAct({ type: 'balance' })}
              title="Your team wins every remaining round. A wrong claim costs your team 1 stone.">Claim balance</button>
          )}
          {has('claim') && (
            <button type="button" className="btn primary" onClick={() => onAct({ type: 'claim' })}
              title="Your team has the points it needs: end the game now">Claim the game</button>
          )}
        </div>
      )}
      <div className="hand-row">
        <div className={`hand${capsOrder ? ' ordering' : cardAction.size ? ' choosing' : ''}`} aria-label="Your hand">
          {hand.map((c) => (
            <Card key={c} card={c} size="hand" onClick={() => click(c)} disabled={!clickable(c)} badge={badge(c)} />
          ))}
        </div>
        {indicator && (
          <div className="indicator">
            <Card card={indicator} size="hand" tag="Trump" label={`Your folded trump card, ${indicator}`}
              onClick={() => click(indicator)} disabled={!clickable(indicator)} badge={badge(indicator)} />
            {hints && <small>face down on the table</small>}
          </div>
        )}
      </div>
    </div>
  );
}

function AbsoluteButton({ onAct }: { onAct: (a: Action) => void }) {
  return (
    <button type="button" className="btn" onClick={() => onAct({ type: 'absolute' })}
      title="Your hand wins every round whatever happens. Declaring it in goodwill passes the deal on with no stone exchanged.">Declare absolute hand</button>
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

function prompt(view: PlayerView, myTurn: boolean, pausing: boolean, hints: boolean): string {
  if (view.phase === 'over') return '';
  if (view.pccOut === HUMAN) return `You sit this game out (PCC).`;
  if (pausing) return hints ? 'Have a look at the trick, then click Continue.' : '';
  if (!myTurn) return hints && view.toAct !== null ? `Waiting for ${SEAT_NAMES[view.toAct]}` : '';
  if (!hints) {
    switch (view.phase) {
      case 'bid4':
      case 'bid8': return 'Your bid';
      case 'trump4':
      case 'trump8': return 'Choose trump';
      case 'declare': return 'Open or closed?';
      case 'show': return 'Show a trump';
      default: return 'Your turn';
    }
  }
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
