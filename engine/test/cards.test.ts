import { describe, expect, it } from 'vitest';
import { beats, handPoints, PACK, winningIndex } from '../src';

describe('cards', () => {
  it('has 32 cards worth 304 points', () => {
    expect(PACK).toHaveLength(32);
    expect(new Set(PACK).size).toBe(32);
    expect(handPoints(PACK)).toBe(304);
  });

  it('ranks J 9 A 10 K Q 8 7 in every suit', () => {
    expect(beats('Jc', '9c', 'c', null)).toBe(true);
    expect(beats('9c', 'Ac', 'c', null)).toBe(true);
    expect(beats('8c', '7c', 'c', null)).toBe(true);
    expect(beats('10c', 'Kc', 'c', null)).toBe(true);
  });

  it('trump beats the led suit, off-suit never wins', () => {
    expect(beats('7h', 'Jc', 'c', 'h')).toBe(true);
    expect(beats('Jd', '7c', 'c', 'h')).toBe(false);
    expect(winningIndex(['Kc', 'Jd', '7h', 'Ac'], 'c', 'h')).toBe(2);
    expect(winningIndex(['Kc', 'Jd', '7s', 'Ac'], 'c', 'h')).toBe(3);
  });
});
