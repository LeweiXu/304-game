// Seats are 0-3, numbered anticlockwise (the direction of deal and play).
// Seat s+1 is the player on s's right. Partners sit opposite (s and s+2),
// so team = seat % 2. The frontend always puts the human at seat 0.

export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** The next player anticlockwise (to the right of `s`). */
export const nextSeat = (s: Seat, n = 1): Seat => ((s + n) % 4) as Seat;
export const partnerOf = (s: Seat): Seat => nextSeat(s, 2);
export const teamOf = (s: Seat): Team => (s % 2) as Team;
export const otherTeam = (t: Team): Team => (1 - t) as Team;
