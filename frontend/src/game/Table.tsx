// The game table. Same structure as the old one: stone scores top-left,
// partner on top, opponents left and right, the trick in the middle, you at
// the bottom. Everything stays inside the play page's box.
import { useEffect, useState } from 'react';
import { PCC, type PlayerView, type Seat, type SeenCard } from '@engine';
import { Card, CardBack } from './Card';
import Controls from './Controls';
import {
  bidLabel, cardLabel, endSummary, HUMAN, penaltySummary, SEAT_NAMES, SEAT_POSITION, speechLabel, SUIT_NAME, SUIT_SYMBOL, teamName,
} from './labels';
import type { useMatch } from './useMatch';

type Game = ReturnType<typeof useMatch>;
type Props = { game: Game; assist: boolean; onSettings: () => void };

export default function Table({ game, assist, onSettings }: Props) {
  const { view, pausing } = game;
  if (!view) return null;
  return (
    <div className="table">
      <div className="table-top">
        <Scoreboard view={view} />
        <Opponent view={view} seat={2} />
        <GameInfo view={view} assist={assist} onQuit={game.quit} onSettings={onSettings} />
      </div>
      <div className="table-middle">
        <Opponent view={view} seat={3} />
        <Center view={view} pausing={pausing} assist={assist} onContinue={game.resume} />
        <Opponent view={view} seat={1} />
      </div>
      <Controls view={view} pausing={pausing} onAct={game.act} />
      {view.phase === 'over' && !pausing && <Result view={view} onNext={game.deal} onNewMatch={game.start} />}
    </div>
  );
}

function Scoreboard({ view }: { view: PlayerView }) {
  return (
    <div className="scoreboard" aria-label="Stone left, first team to give away all 10 wins" title="Stone left. First team to give away all 10 wins.">
      {[0, 1].map((team) => (
        <div key={team} className={`score team-${team}`}>
          <span className="score-name">{team === 0 ? 'Us' : 'Them'}</span>
          <span className="score-num">{view.stone[team]}</span>
          <span className="pips" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < view.stone[team] ? 'on' : ''} />)}
          </span>
        </div>
      ))}
    </div>
  );
}

function GameInfo({ view, assist, onQuit, onSettings }: { view: PlayerView; assist: boolean; onQuit: () => void; onSettings: () => void }) {
  const bid = view.contract;
  const t = view.trump;
  let trump = 'not chosen';
  if (t?.suit) {
    trump = `${SUIT_SYMBOL[t.suit]} ${SUIT_NAME[t.suit]}`;
    if (!t.open) trump += ' (only you know)';
    else if (t.shown) trump += ` (${SEAT_NAMES[t.seat]} showed ${cardLabel(t.shown)})`;
  } else if (t) trump = 'face down';
  return (
    <div className="game-info">
      <dl>
        <div><dt>Game</dt><dd>{view.gameNumber}</dd></div>
        <div><dt>Dealer</dt><dd>{SEAT_NAMES[view.dealer]}</dd></div>
        {bid && <div><dt>Bid</dt><dd>{bidLabel(bid.value)}, {SEAT_NAMES[bid.seat]}</dd></div>}
        {bid && <div><dt>Trump</dt><dd>{trump}</dd></div>}
        {assist && view.play && (
          <div><dt>Points</dt><dd title="Folded cards you haven't seen are counted when the game ends">us {view.play.visiblePoints[0]}, them {view.play.visiblePoints[1]}</dd></div>
        )}
        {assist && view.thresholds && (
          <div><dt>Need</dt><dd>us {view.thresholds[0]}, them {view.thresholds[1]}</dd></div>
        )}
      </dl>
      <div className="info-links">
        <button type="button" className="link-btn" onClick={onSettings}>Settings</button>
        <button type="button" className="link-btn" onClick={onQuit}>Leave game</button>
      </div>
    </div>
  );
}

/** Latest thing this seat said in the current betting round. */
function lastSpeech(view: PlayerView, seat: Seat): string | null {
  if (view.phase !== 'bid4' && view.phase !== 'bid8') return null;
  const s = [...view.bidding.speeches].reverse().find((sp) => sp.seat === seat);
  if (!s) return null;
  return s.inSeat !== undefined ? `${speechLabel(s)} for ${SEAT_NAMES[s.inSeat]}` : speechLabel(s);
}

function SeatLabel({ view, seat }: { view: PlayerView; seat: Seat }) {
  const trumper = view.trump?.seat ?? (view.phase === 'trump4' ? view.bid4?.seat : view.phase === 'trump8' ? view.bid8?.seat : undefined);
  const active = view.toAct === seat && view.phase !== 'over';
  return (
    <div className={`seat-tag team-${seat % 2}${active ? ' active' : ''}`}>
      <span>{SEAT_NAMES[seat]}{seat === 2 && <small> partner</small>}</span>
      {view.dealer === seat && <b className="badge" title="Dealer">D</b>}
      {trumper === seat && <b className="badge trump" title="Trumper">T</b>}
      {view.pccOut === seat && <b className="badge" title="Sits this game out (PCC)">out</b>}
    </div>
  );
}

function Opponent({ view, seat }: { view: PlayerView; seat: Seat }) {
  const pos = SEAT_POSITION[seat];
  const count = view.handCounts[seat];
  const speech = lastSpeech(view, seat);
  const t = view.trump;
  return (
    <div className={`player player-${pos}${view.pccOut === seat ? ' sitting-out' : ''}`}>
      <SeatLabel view={view} seat={seat} />
      <div className="player-cards">
        <div className="backs" aria-label={`${count} cards`}>
          {Array.from({ length: count }, (_, i) => <CardBack key={i} />)}
        </div>
        {t?.seat === seat && t.indicatorOnTable && <CardBack size="small" tag="Trump" label="Folded trump card" />}
      </div>
      {speech && <div className="bubble">{speech}</div>}
    </div>
  );
}

function TrickCards({ cards }: { cards: SeenCard[] }) {
  return (
    <div className="trick">
      {cards.map((c) => (
        <div key={c.seat} className={`trick-card at-${SEAT_POSITION[c.seat]}`}>
          {c.card && (!c.faceDown || c.revealed) ? (
            <Card card={c.card} tag={c.revealed ? 'Cut' : undefined} />
          ) : (
            <CardBack size="table" label={`${SEAT_NAMES[c.seat]} played a card face down`} />
          )}
        </div>
      ))}
    </div>
  );
}

function Center({ view, pausing, assist, onContinue }: { view: PlayerView; pausing: boolean; assist: boolean; onContinue: () => void }) {
  const p = view.play;
  // Between rounds you may inspect the last completed trick (rules: never mid-trick, never older tricks).
  const [inspecting, setInspecting] = useState(false);
  const betweenRounds = !!p && view.phase === 'play' && p.trick.length === 0 && !!p.lastTrick && !pausing;
  useEffect(() => { if (!betweenRounds) setInspecting(false); }, [betweenRounds]);

  if (p) {
    const showLast = (pausing || inspecting) && p.lastTrick;
    const cards = showLast ? p.lastTrick!.cards : p.trick;
    const hidden = showLast && p.lastTrick!.cards.some((c) => c.card === null);
    // As trumper you privately inspect folded cards after each trick (they stay face down on the table).
    const inspected = showLast && view.trump?.seat === HUMAN
      ? p.lastTrick!.cards.filter((c) => c.faceDown && !c.revealed && c.seat !== HUMAN && c.card)
      : [];
    const label = showLast
      ? `Round ${p.lastTrick!.round} of 8${inspecting ? ' (last trick)' : ''}`
      : view.phase === 'play' ? `Round ${p.round} of 8` : 'Game over';
    return (
      <div className="center">
        <p className="center-label">
          {label}
          {!showLast && p.trick.length > 0 && <span>, led by {SEAT_NAMES[p.leader]}</span>}
          {betweenRounds && (
            <button type="button" className="link-btn inspect" onClick={() => setInspecting(!inspecting)}>
              {inspecting ? 'back to the table' : 'see last trick'}
            </button>
          )}
        </p>
        <TrickCards cards={cards} />
        {showLast && (
          <p className="trick-result">
            {SEAT_NAMES[p.lastTrick!.winner]} {p.lastTrick!.winner === HUMAN ? 'win' : 'wins'} the trick
            {assist && <>, +{p.lastTrick!.visiblePoints}{hidden ? ' plus folded cards' : ''}</>}
            {p.lastTrick!.revealedTrump && view.trump?.suit && <span>. Trump is {SUIT_SYMBOL[view.trump.suit]} {SUIT_NAME[view.trump.suit]}</span>}
          </p>
        )}
        {inspected.length > 0 && (
          <p className="center-wait">You check the folded cards: {inspected.map((c) => `${SEAT_NAMES[c.seat]} ${cardLabel(c.card!)}`).join(', ')}</p>
        )}
        <Notices view={view} />
        {pausing && showLast && <button type="button" className="btn primary" onClick={onContinue} autoFocus>Continue</button>}
      </div>
    );
  }

  const b = view.bidding;
  const waiting = view.toAct !== null && view.toAct !== HUMAN ? `${SEAT_NAMES[view.toAct]} is thinking` : null;
  let title = '';
  let detail: string | null = null;
  if (view.phase === 'bid4' || view.phase === 'bid8') {
    title = view.phase === 'bid4' ? 'Betting on 4 cards' : 'Betting on 8 cards';
    detail = b.high ? `High bid ${bidLabel(b.high.value)}, ${SEAT_NAMES[b.high.seat]}` : view.phase === 'bid8' && view.bid4
      ? `No 8-card bids. ${bidLabel(view.bid4.value)} by ${SEAT_NAMES[view.bid4.seat]} stands for now`
      : 'No bids yet';
  } else if (view.phase === 'trump4' || view.phase === 'trump8') {
    title = view.contract?.value === PCC ? 'PCC: choosing trump' : 'Choosing trump';
    detail = view.toAct === HUMAN ? null : `${SEAT_NAMES[view.toAct!]} is placing a card face down`;
  } else if (view.phase === 'declare') {
    title = 'Open or closed trump';
    detail = view.toAct === HUMAN ? null : `${SEAT_NAMES[view.toAct!]} is deciding`;
  } else if (view.phase === 'show') {
    title = view.pccOut !== null ? `PCC by ${SEAT_NAMES[view.trump!.seat]}` : 'Open trump';
    detail = view.toAct === HUMAN ? null : `${SEAT_NAMES[view.toAct!]} is choosing a trump card to show`;
  }
  return (
    <div className="center">
      <p className="center-title">{title}</p>
      {detail && <p className="center-detail">{detail}</p>}
      {waiting && view.phase.startsWith('bid') && <p className="center-wait">{waiting}</p>}
    </div>
  );
}

/** Penalties so far this game (from wrong Spoilt Trumps calls). */
function Notices({ view }: { view: PlayerView }) {
  if (!view.penalties.length) return null;
  return (
    <div className="notices">
      {view.penalties.map((pen, i) => <p key={i} className="center-wait">{penaltySummary(pen)} (settled at the end of the game)</p>)}
    </div>
  );
}

function Result({ view, onNext, onNewMatch }: { view: PlayerView; onNext: () => void; onNewMatch: () => void }) {
  const end = view.end!;
  const matchOver = view.matchWinner !== null;
  let heading = 'Pass-on';
  if (end.kind === 'played') heading = end.made === (end.bidTeam === 0) ? 'Your team wins this game' : 'Your team loses this game';
  else if (end.kind === 'redeal') heading = 'Redeal';
  else if (end.kind === 'spoilt') heading = 'Spoilt Trumps';
  else if (end.kind === 'absolute') heading = 'Absolute hand';
  if (matchOver) heading = view.matchWinner === 0 ? 'You won the match' : 'East and West won the match';
  return (
    <div className="result-backdrop">
      <div className="result" role="dialog" aria-label={heading}>
        <h2>{heading}</h2>
        <p>{endSummary(end)}</p>
        {view.penalties.map((pen, i) => <p key={i}>{penaltySummary(pen)}</p>)}
        {end.kind === 'played' && (
          <table className="result-table">
            <thead><tr><th /><th>{end.pcc ? 'Rounds' : 'Points'}</th><th>Stone left</th></tr></thead>
            <tbody>
              {[0, 1].map((team) => (
                <tr key={team}><th>{teamName(team)}</th><td>{end.pcc ? end.tricks[team] : end.points[team]}</td><td>{view.stone[team]}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {matchOver
          ? <button type="button" className="btn primary" onClick={onNewMatch}>New match</button>
          : <button type="button" className="btn primary" onClick={onNext} autoFocus>Deal next game</button>}
      </div>
    </div>
  );
}
