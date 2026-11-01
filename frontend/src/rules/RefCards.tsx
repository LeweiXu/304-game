// The three quick-reference panels at the top of the rules page, styled as
// playing cards. Numbers here mirror the scoring and bidding sections of
// public/rules.md; update both together.

type Row = [string, string];
type Card = { rank: string; suit: string; red?: boolean; title: string; rows: Row[]; link?: [string, string] };

const CARDS: Card[] = [
  {
    rank: 'J', suit: '♠', title: 'Card order',
    rows: [['J', '30'], ['9', '20'], ['A', '11'], ['10', '10'], ['K', '3'], ['Q', '2'], ['8, 7', '0']],
  },
  {
    rank: '9', suit: '♥', red: true, title: 'Bidding ladder',
    rows: [['160+', '4 cards, first turn'], ['200+', '4 cards, any turn'], ['220', 'Honest, 8 cards'],
      ['250+', '8 cards, any turn'], ['PCC', 'partner sits out']],
    link: ['#constraints-on-bidding-below-200', 'Bidding limits'],
  },
  {
    rank: 'A', suit: '♣', title: 'Stone at stake',
    rows: [['Bid', 'win / lose'], ['160 to 190', '1 / 2'], ['200 to 245', '2 / 3'], ['250', '3 / 4'], ['PCC', '5 / 5']],
    link: ['#scoring-table', 'Full table'],
  },
];

export default function RefCards() {
  return (
    <div className="refs">
      {CARDS.map((c) => (
        <article key={c.title} className={`ref${c.red ? ' red' : ''}`}>
          <div className="idx" aria-hidden="true">{c.rank}<small>{c.suit}</small></div>
          <h2>{c.title}</h2>
          <dl>
            {c.rows.map(([k, v]) => (
              <div key={k} className="row"><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          {c.link && <a href={c.link[0]}>{c.link[1]}</a>}
          <div className="idx flip" aria-hidden="true">{c.rank}<small>{c.suit}</small></div>
        </article>
      ))}
    </div>
  );
}
