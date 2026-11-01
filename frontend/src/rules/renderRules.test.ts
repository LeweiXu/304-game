import { describe, expect, it } from 'vitest';
import md from '../../../public/rules.md?raw';
import { renderRules, slugify } from './renderRules';


const sections = renderRules(md);
const all = sections.map((s) => s.html).join('\n');

describe('renderRules on the real rules.md', () => {
  it('splits on every top-level heading', () => {
    const h2s = md.match(/^## /gm)!.length;
    expect(sections).toHaveLength(h2s);
    expect(sections[0].title).toBe('Introduction');
  });

  it('numbers only the game-flow sections, in order', () => {
    const steps = sections.filter((s) => s.step).map((s) => [s.title, s.step]);
    expect(steps[0]).toEqual(['Players and Cards', 1]);
    expect(steps.at(-1)).toEqual(['Scoring', 7]);
    expect(sections.find((s) => s.title === 'Glossary')!.step).toBeNull();
  });

  it('turns every [House Rule] marker into a badge', () => {
    expect(all).not.toContain('[House Rule');
    expect(all.match(/class="house-rule"/g)!.length).toBeGreaterThanOrEqual(md.match(/\[House Rule/g)!.length);
  });

  it('gives § rules an anchor and a tag', () => {
    expect(all).toContain('<span class="rule-tag" id="B-1">§B-1</span><strong>Partnered-player skip.</strong>');
    expect(all).toContain('id="B-4"');
  });

  it('makes worked examples collapsible and other quotes into notes', () => {
    expect(all).not.toContain('<blockquote>');
    expect(all).toContain('<summary>Worked example: 4-Card Betting (Simple)');
    expect(all).toContain('<aside class="note">');
  });

  it('swaps the point-value table for rank cards and adds the seating diagram', () => {
    const players = sections.find((s) => s.title === 'Players and Cards')!.html;
    expect(players).toContain('class="rank-strip"');
    expect(players).not.toContain('Face Value');
    expect(players).toContain('class="seating-diagram"');
  });

  it('has the anchors the reference cards link to', () => {
    expect(all).toContain('id="scoring-table"');
    expect(all).toContain('id="constraints-on-bidding-below-200"');
  });
});

describe('slugify', () => {
  it('handles ampersands, entities and punctuation', () => {
    expect(slugify('Wrong &amp; Early Caps')).toBe('wrong-and-early-caps');
    expect(slugify('Appendix: House Rules vs Standard Rules')).toBe('appendix-house-rules-vs-standard-rules');
  });
});
