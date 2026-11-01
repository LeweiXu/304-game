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
src/pages/             PlayPage (the frame the game will sit in), RulesPage, NotFound
src/rules/             renders ../docs/rules/rules.md into the rules page
src/theme/theme.ts     colour theme + light/dark mode state
src/styles/themes.css  the four colour themes, light and dark tokens each
src/styles/base.css    type, nav, theme menu
```

## Rules page

The page is built from `docs/rules/rules.md` at build time (imported with `?raw`), so editing the markdown is all it takes to change the rules. `src/rules/renderRules.ts` dresses up a few markdown conventions: `**[House Rule]**` becomes a badge, `**§B-1 Title.**` becomes a linkable rule tag, `> **Worked Example ...**` quotes become collapsible blocks, and the card point table becomes a row of mini cards. The three reference cards at the top (`RefCards.tsx`) are hand-written, so update them if the scoring or bidding numbers in the markdown change.

## Themes

Four colour themes (graphite is the default, plus parchment, tea and indigo), each with light and dark tokens in `themes.css`. The palette button in the nav picks the theme and the mode (system, light, dark); the sun/moon button flips light and dark for the current theme. Both are saved in localStorage.

## Env

`VITE_API_BASE` comes from `.env.development` (local backend on :8003) and `.env.production` (https://304-api.leweixu.com). A value set in the Vercel dashboard would override the production file.
