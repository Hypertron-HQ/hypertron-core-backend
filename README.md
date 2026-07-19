# Hypertron Core Backend

Standalone NestJS backend for Hypertron.

## Stack

- NestJS
- Node.js
- TypeScript
- Jest

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run start:dev
```

The app starts on port `4000` by default. Override it with `PORT` if needed.

## Scripts

- `npm run start` starts the application
- `npm run start:dev` starts the app in watch mode
- `npm run start:prod` runs the compiled app from `dist`
- `npm run build` builds the backend
- `npm run test` runs unit tests
- `npm run test:e2e` runs end-to-end tests
- `npm run test:cov` runs tests with coverage
- `npm run lint` runs ESLint with autofix

## Notes

- This repository is the standalone backend extracted into its own project.
- The initial scaffold is a clean NestJS baseline and will be extended for developer APIs, webhooks, API keys, and event processing.
