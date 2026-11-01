// Static figures the rules renderer drops into the markdown output.

const RANKS: [rank: string, points: number, suit: string, red: boolean][] = [
  ['J', 30, '♠', false], ['9', 20, '♥', true], ['A', 11, '♣', false], ['10', 10, '♦', true],
  ['K', 3, '♠', false], ['Q', 2, '♥', true], ['8', 0, '♣', false], ['7', 0, '♦', true],
];

/** Replaces the Face Value / Point Value table: one mini card per rank, high to low. */
export function rankStripHtml(): string {
  const items = RANKS.map(([r, p, s, red]) =>
    `<li><span class="rk-card${red ? ' red' : ''}"><b>${r}</b><i>${s}</i></span><span class="rk-pts">${p}<small> pts</small></span></li>`,
  ).join('');
  return `<figure class="rank-strip"><ol aria-label="Card ranks, high to low, with points">${items}</ol><figcaption>Same order in every suit, highest on the left.</figcaption></figure>`;
}

/** Who sits where, deal direction, and the two partnerships. */
export function seatingDiagramHtml(): string {
  return `<figure class="seating-diagram" aria-label="Seating arrangement showing partnerships, deal direction, and priority"> <svg viewBox="0 0 360 360" role="img"> <ellipse cx="180" cy="180" rx="115" ry="80" class="seating-table" /> <line x1="180" y1="60" x2="180" y2="300" class="seating-tie tie-team-bd" /> <line x1="60" y1="180" x2="300" y2="180" class="seating-tie tie-team-ac" /> <defs> <marker id="seat-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"> <path d="M0,0 L10,5 L0,10 Z" class="seating-arrowhead" /> </marker> </defs> <path d="M 130 80 A 130 130 0 0 0 80 130" class="seating-arrow" marker-end="url(#seat-arrowhead)" /> <text x="95" y="75" class="seating-arrow-label">anticlockwise</text> <g class="seat seat-d" transform="translate(180 38)"> <circle r="32" /> <text class="seat-label" y="-2">D</text> <text class="seat-role" y="14">Dealer</text> </g> <g class="seat seat-a" transform="translate(38 180)"> <circle r="32" /> <text class="seat-label" y="-2">A</text> <text class="seat-role" y="14">Priority</text> </g> <g class="seat seat-b" transform="translate(180 322)"> <circle r="32" /> <text class="seat-label" y="-2">B</text> <text class="seat-role" y="14">D's partner</text> </g> <g class="seat seat-c" transform="translate(322 180)"> <circle r="32" /> <text class="seat-label" y="-2">C</text> <text class="seat-role" y="14">A's partner</text> </g> </svg> <figcaption> <strong>D</strong> is the dealer. <strong>A</strong> (to D’s right, viewed from D’s seat) has priority: receives the first card and bids first. <strong>C</strong> (to D’s left) cuts the deck. Deal proceeds anticlockwise: <strong>A → B → C → D</strong>. Partnerships: A &amp; C (cool, opposite each other), B &amp; D (warm, opposite each other). Between games, the dealer rotates one seat anticlockwise, so D’s next game has A as dealer. </figcaption> </figure>`;
}
