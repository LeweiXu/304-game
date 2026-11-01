// Turns public/rules.md into the sections the rules page shows.
//
// The markdown stays the source of truth. A few of its conventions get
// dressed up on the way through:
//   **[House Rule]**             -> green "House rule" badge
//   **§B-1 Some title.**         -> rule tag "§B-1" (anchor #B-1) + bold title
//   > **Worked Example ...**     -> collapsible <details> block
//   > anything else              -> a note callout
//   the Face Value / Point Value table -> a row of rank cards
// and the seating diagram is dropped in after the first paragraph of
// "Players and Cards".
import { marked } from 'marked';
import { rankStripHtml, seatingDiagramHtml } from './figures';

export type RulesSub = { id: string; title: string };
export type RulesSection = {
  id: string;
  title: string;
  short: string;
  step: number | null;
  html: string;
  subs: RulesSub[];
};

// Sections that are steps of an actual game get a number.
const STEP_SECTIONS = ['Players and Cards', 'Setup', 'Dealing', 'Betting and Choosing Trump', 'Play', 'Caps', 'Scoring'];

const SHORT: Record<string, string> = {
  Introduction: 'Intro',
  'Players and Cards': 'Players & cards',
  'Betting and Choosing Trump': 'Betting & trump',
  'In-Game Penalties': 'Penalties',
  'Appendix: House Rules vs Standard Rules': 'House vs standard',
};

export function slugify(text: string): string {
  return decode(text)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function decode(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function addHeadingIds(html: string): string {
  const seen = new Map<string, number>();
  return html.replace(/<h([234])>(.*?)<\/h\1>/g, (_, level: string, inner: string) => {
    let id = slugify(inner);
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n) id = `${id}-${n + 1}`;
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
}

function badges(html: string): string {
  return html.replace(/<strong>\[([^\]]+)\]<\/strong>/g, (_, label: string) => {
    const m = label.match(/^House Rule\s*(?:[—–-]\s*(.*))?$/);
    if (m) {
      const note = m[1] ? ` <span class="badge-note">(${m[1]})</span>` : '';
      return `<span class="house-rule">House rule</span>${note}`;
    }
    // e.g. "[Adaptive — codified at this group's table]"
    const [head, ...rest] = label.split(/\s*[—–]\s*/);
    const note = rest.length ? ` <span class="badge-note">(${rest.join(', ')})</span>` : '';
    return `<span class="house-rule">${head}</span>${note}`;
  });
}

function ruleTags(html: string): string {
  return html.replace(/<strong>§([A-Z]+-\d+)\s*(.*?)<\/strong>/g, (_, tag: string, title: string) =>
    `<span class="rule-tag" id="${tag}">§${tag}</span>` + (title ? `<strong>${title}</strong>` : ''));
}

function blockquotes(html: string): string {
  return html.replace(/<blockquote>\s*([\s\S]*?)<\/blockquote>/g, (_, inner: string) => {
    const ex = inner.match(/^<p><strong>Worked Example\s*[—–-]?\s*(.*?)<\/strong><\/p>\s*([\s\S]*)$/);
    if (ex) {
      const title = ex[1] ? `Worked example: ${ex[1]}` : 'Worked example';
      return `<details class="example"><summary>${title}<span class="chevron" aria-hidden="true">▾</span></summary><div class="example-body">${ex[2]}</div></details>`;
    }
    return `<aside class="note">${inner}</aside>`;
  });
}

function tables(html: string): string {
  return html.replace(/<table>[\s\S]*?<\/table>/g, (table) =>
    /<th[^>]*>\s*Face Value\s*<\/th>/.test(table) ? rankStripHtml() : `<div class="table-wrapper">${table}</div>`);
}

export function renderRules(md: string): RulesSection[] {
  const body = md.replace(/^# .*\n/, ''); // the page supplies its own title
  let html = marked.parse(body, { async: false, gfm: true }) as string;
  html = tables(blockquotes(ruleTags(badges(addHeadingIds(html)))));

  const parts = html.split(/(?=<h2 id=")/).filter((p) => p.startsWith('<h2'));
  let step = 0;
  return parts.map((part) => {
    const head = part.match(/^<h2 id="([^"]+)">(.*?)<\/h2>/)!;
    const [, id, titleHtml] = head;
    const title = decode(titleHtml);
    let inner = part.slice(head[0].length);
    if (title === 'Players and Cards') inner = inner.replace(/<\/p>/, `</p>${seatingDiagramHtml()}`);
    const subs = [...inner.matchAll(/<h3 id="([^"]+)">(.*?)<\/h3>/g)].map((m) => ({ id: m[1], title: decode(m[2]) }));
    return {
      id,
      title,
      short: SHORT[title] ?? title,
      step: STEP_SECTIONS.includes(title) ? ++step : null,
      html: inner,
      subs,
    };
  });
}
