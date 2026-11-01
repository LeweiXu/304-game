# frontend

React + Vite + TypeScript. Deployed to Vercel at https://304.leweixu.com on every push to `main`.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest
npm run build    # type-check + production build into dist/
```

## What's where

```
index.html             sets the saved theme before first paint (no flash)
src/main.tsx           routes: / (play), /rules
src/App.tsx            site shell: nav + page
src/api.ts             backend base url (VITE_API_BASE) + health check
src/components/        Nav, ThemeMenu
src/pages/             PlayPage (hosts the game table), RulesPage, NotFound
src/game/              the game table: useMatch (state, bot pacing, saving), Table, Controls, Card,
                       settings + SettingsPanel (shuffle mode, assistance, rule options)
src/rules/             renders ../public/rules.md into the rules page
src/theme/theme.ts     colour theme + light/dark mode state
src/styles/themes.css  the four colour themes, light and dark tokens each
src/styles/base.css    type, nav, theme menu
```

## Game table

The rules live in `../engine` (imported as `@engine`, see the alias in `vite.config.ts` and `tsconfig.json`). The table never decides what's legal itself: it renders `viewFor(match, 0)` and only offers actions from `view.legal`. `useMatch` holds the match, lets bots move after a short delay, pauses about 1.5s after each trick so you can see who won it (click the table to skip), and saves the match to localStorage so a reload picks up where you left off.

Settings (the "Settings" link on the table or the start screen) are saved in localStorage. Rule options go to the engine and apply from the next game; "assistance" (points per trick and running totals) is display only and off by default. Between rounds you can look at the last trick again ("see last trick"), as the rules allow.

Layout follows the old site's table: stone top-left, partner on top, opponents left and right, the trick in the middle, your hand at the bottom. Card sizes hang off `--cw`, which scales with the box using container query units, so everything stays inside the box on phones too.

## Rules page

The page is built from `public/rules.md` at build time (imported with `?raw`), so editing the markdown is all it takes to change the rules. `src/rules/renderRules.ts` dresses up a few markdown conventions: `**[House Rule]**` becomes a badge, `**§B-1 Title.**` becomes a linkable rule tag, `> **Worked Example ...**` quotes become collapsible blocks, and the card point table becomes a row of mini cards. The three reference cards at the top (`RefCards.tsx`) are hand-written, so update them if the scoring or bidding numbers in the markdown change.

## Themes

Four colour themes (graphite is the default, plus parchment, tea and indigo), each with light and dark tokens in `themes.css`. The palette button in the nav picks the theme and the mode (system, light, dark); the sun/moon button flips light and dark for the current theme. Both are saved in localStorage.

## Env

`VITE_API_BASE` comes from `.env.development` (local backend on :8003) and `.env.production` (https://304-api.leweixu.com). A value set in the Vercel dashboard would override the production file.
