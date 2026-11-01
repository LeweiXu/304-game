// Settings, shown as a panel inside the game box.
import type { Settings } from './settings';

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  /** A game is in progress, so rule changes wait for the next deal. */
  midGame: boolean;
};

export default function SettingsPanel({ settings, onChange, onClose, midGame }: Props) {
  return (
    <div className="result-backdrop" onClick={onClose}>
      <div className="settings" role="dialog" aria-label="Game settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2>Settings</h2>
          <button type="button" className="link-btn" onClick={onClose}>Close</button>
        </div>

        <fieldset>
          <legend>Shuffling</legend>
          <label className="opt">
            <input type="radio" name="shuffle" checked={settings.shuffle === 'random'} onChange={() => onChange({ shuffle: 'random' })} />
            <span><b>Completely random</b><small>Every deal is a full shuffle.</small></span>
          </label>
          <label className="opt">
            <input type="radio" name="shuffle" checked={settings.shuffle === 'slap'} onChange={() => onChange({ shuffle: 'slap' })} />
            <span><b>Light slap-shuffles</b><small>Like the table game: last game's cards, 1 to 3 slap shuffles and a cut. Good cards stay clumped, so hands run bigger.</small></span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Display</legend>
          <Toggle checked={settings.assist} onChange={(v) => onChange({ assist: v })}
            title="Assistance" detail="Show the points won in each round and both teams' running totals." />
          <Toggle checked={settings.hints} onChange={(v) => onChange({ hints: v })}
            title="Hints" detail="Short explanations on the table: what to do on your turn, why a card goes face down, who knows the trump suit." />
        </fieldset>

        <fieldset>
          <legend>Rules</legend>
          <Toggle checked={settings.caps} onChange={(v) => onChange({ caps: v })}
            title="Caps" detail="Call caps, with the order you'll play your cards, once your team is sure to win every round. Late, early and wrong calls are penalised. Turn off for easier games." />
          <Toggle checked={settings.claimBalance} onChange={(v) => onChange({ claimBalance: v })}
            title="Claim balance" detail="Once you're sure your team wins every remaining round, claim it. Missing the claim costs your team one stone." />
          <Toggle checked={settings.claimThreshold} onChange={(v) => onChange({ claimThreshold: v })}
            title="Claim threshold" detail="Claim the game once your team has the points it needs (the bid, or 305 minus the bid for the other side). Claiming ends the game straight away." />
        </fieldset>

        {midGame && <p className="settings-note">Rule changes start from the next game. Display changes apply now.</p>}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, title, detail, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; title: string; detail: string; disabled?: boolean;
}) {
  return (
    <label className={`opt toggle${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span><b>{title}</b><small>{detail}</small></span>
    </label>
  );
}
