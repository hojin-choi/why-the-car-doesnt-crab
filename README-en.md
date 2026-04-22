# why-the-car-doesnt-crab

A browser-based 3D simulator built for one very specific moment:

> You are trying to explain reverse parking to a beginner,  
> and they ask, “If I turn the steering wheel, don’t all four wheels turn the same way?”  
> At that point, words are no longer enough.

This project exists to show:

- why a normal car does **not** move like a crab,
- why front and rear wheel paths differ,
- and why reverse parking feels much less intuitive than people expect.

In short, this is an **Ackermann steering explainer for humans under parking-lot stress**.

And, if possible:

> **Instead of arguing with your spouse in a parking lot, train with this simulator first.**

## GitHub description

Visual 3D simulator for explaining why cars don’t move like crabs — especially when reverse parking confuses beginners.

## Demo

- GitHub Pages: https://hojin-choi.github.io/why-the-car-doesnt-crab/

## What it shows

- A simple 3D car and parking-lot scene
- Two steering concepts:
  - **Real car mode**: front-wheel steering with different inner/outer wheel angles
  - **Misconception mode**: all four wheels point the same way
- Trajectory visualization for front and rear wheel paths
- Multiple camera modes:
  - free camera
  - follow camera
  - driver view
- Driver-view helper panels:
  - left mirror
  - rear camera
  - right mirror
- Reverse-parking guide overlays for explaining steering direction

## The misconception it targets

- “If you turn the steering wheel, don’t all four wheels turn the same way?”
- “Why doesn’t the car just go where I’m pointing it when I reverse?”
- “Why do the rear wheels trace a different path from the front?”

The goal is to explain those questions visually instead of arguing with hand gestures in a parking lot.

## Tech stack

- React
- Vite
- three.js
- @react-three/fiber
- @react-three/drei

## Getting started

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

By default the app is served on:

- `http://127.0.0.1:4173/`

Preview the production build:

```bash
npm run preview
```

Build the app:

```bash
npm run build
```

## Standalone export

A helper script exists for generating a single-file standalone HTML export:

```bash
npm run build:standalone
```

That output file is intentionally **not tracked in git**.

Why:

- it is a large generated artifact
- diffs are noisy and hard to review
- the real project history belongs in source files and build scripts

If you need the standalone file, generate it locally from the repository source.

## Repository layout

```text
src/
  App.jsx
  main.jsx
  styles.css
scripts/
  make-standalone-html.mjs
```

## Security notes

This project is a static front-end simulator:

- no backend
- no authentication
- no database
- no user account system
- no secret/API-key handling in source

The recommended way to publish it is to commit the source and build it from CI or locally, instead of committing generated standalone artifacts.

## Contributing

Small fixes, wording improvements, and bug-fix PRs are welcome.  
For larger structural or UI changes, please open an issue first so the direction is clear.

## License

MIT
