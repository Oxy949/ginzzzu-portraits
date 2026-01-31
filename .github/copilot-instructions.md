# Copilot / AI Agent Instructions — Ginzzzu's Portraits

Purpose: quick, actionable guidance so an AI coding agent can be productive immediately in this Foundry VTT module.

- Big picture
  - This is a Foundry VTT module (see `module.json`). The ES module entrypoint is `scripts/entry.js` which imports `scripts/settings.js` and `scripts/features/*`.
  - Code layout: `scripts/core` (shared constants/helpers), `scripts/features` (feature implementations), `templates` (Handlebars UIs), `styles` (CSS). No build step — files are loaded directly by Foundry.

- Key integration points
  - Settings: `scripts/settings.js` registers `game.settings` keys under `MODULE_ID`. Many settings have `requiresReload: true` — changes require a Foundry reload.
  - Flags & data: central constants are in `scripts/core/constants.js`. Flags live under `flags.ginzzzu-portraits.*` (see `FLAG_PORTRAIT_EMOTION`, `FLAG_CUSTOM_EMOTIONS`, `FLAG_PORTRAIT_CUSTOM_IMAGE`). Use `foundry.utils.getProperty(actor, FLAG)` and `actor.setFlag/actor.update` to read/write.
  - DOM layer: runtime HUD is mounted into a single root element with id `ginzzzu-portrait-layer` (created in `scripts/features/portraits.js`). Use that id when manipulating HUD DOM.
  - Templates: interactive dialogs use `templates/portrait-config.hbs` and `templates/portrait-config-emotion-item.hbs`.
  - Public APIs: custom emotions expose `globalThis.GinzzzuCustomEmotions` and the module exposes `globalThis.GinzzzuPortraits.configurePortrait` (search `globalThis.` to find other exported helpers).

- Common patterns & conventions
  - Always import `MODULE_ID` from `scripts/core/constants.js` and reference it when registering settings or setting flags.
  - Emotion keys: built-in emotions use keys from `EMOTIONS`; custom emotions are stored as `custom_<index>` and saved in `FLAG_CUSTOM_EMOTIONS` (array). When changing emotion behavior update `EMOTION_COLORS` / `EMOTION_MOTIONS` in `scripts/core/constants.js` and add corresponding CSS classes in `styles/emotions.css` (e.g. `.emo-joy-color`, `.emo-shake-motion`).
  - Image selection: use Foundry `FilePicker` in portrait config (`scripts/features/portrait-config.js`). When saving, the code often uses `actor.update({ [FLAG_CUSTOM_EMOTIONS]: [] })` or `actor.setFlag(MODULE_ID, 'displayName', value)` patterns — mirror these when modifying actor flags.
  - DOM helpers: lightweight helpers live in `scripts/core/dom.js` (`el`, `byId`) — prefer using them to create small elements where appropriate.

- Debugging & testing
  - There is no unit test harness. To test changes: edit a script, reload the module in Foundry (or restart Foundry), and use the browser DevTools console. The module logs use tags like `[ginzzzu-portraits]` to help locate output.
  - `module.json` contains placeholders (`#{VERSION}#`, `#{URL}#`) used for releases — be careful when editing manifest for local testing.

- Typical change examples
  - Add a new emotion: update `EMOTION_COLORS` and `EMOTION_MOTIONS` in `scripts/core/constants.js`, implement `.emo-<key>-color` and `.emo-<key>-motion` in `styles/emotions.css`, and the emotion will appear in the UI (portrait-config will pull color/motion lists).
  - Add a feature: import it in `scripts/entry.js` and place implementation in `scripts/features` (follow existing files for structure and global exports if cross-module API needed).

- Where to look first (quick links)
  - `module.json` — module manifest and entry points
  - `scripts/entry.js` — module bootstrap
  - `scripts/settings.js` — all `game.settings` definitions
  - `scripts/core/constants.js` — flags, emotion presets, shared constants
  - `scripts/features/portraits.js` — HUD creation, layout, and main runtime logic
  - `scripts/features/portrait-config.js` — portrait config dialog and FilePicker usage
  - `templates/portrait-config.hbs` and `templates/portrait-config-emotion-item.hbs` — UI templates

- Do / Don't (repo-specific)
  - Do use `MODULE_ID` and existing flag keys rather than inventing new flag namespaces.
  - Do respect `requiresReload` when changing settings in `scripts/settings.js` (document when flips require reload).
  - Don’t assume a build step — edit JS/CSS/HTML directly and reload Foundry.

- If anything is unclear
  - Tell me which area to expand (examples, code snippets, or an end-to-end patch).
