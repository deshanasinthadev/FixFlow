# FixFlow

Repair-shop management UI — repairs, inventory, POS, billing and a customer portal in one
role-aware workspace. Built as a **front-end prototype**: all data is mock data held in React
state, and there is no backend, database or real authentication yet.

Everything lives in [`FixFlow UI Design/`](./FixFlow%20UI%20Design).

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 (via `@tailwindcss/vite`)

## Getting started

```bash
cd "FixFlow UI Design"
npm install
npm run dev        # http://localhost:8443
```

| Script              | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR                        |
| `npm run typecheck` | `tsc --noEmit` — type errors fail the build     |
| `npm run build`     | typecheck, then production build to `dist/`     |
| `npm run preview`   | Serve the production build                      |
| `npm run format`    | Format with `oxfmt`                             |

Set `PORT` to change the dev/preview port. If you open the app through a proxy or preview
hostname, set `FIGMA_DEV_SERVER_ALLOWED_HOSTS` to a comma-separated host list — otherwise
Vite 8 rejects the unknown `Host` header with a 403.

## Demo accounts

Sign in with any role below; the password is `Demo@123` for all of them.

| Role       | Email                       | Sees                                            |
| ---------- | --------------------------- | ----------------------------------------------- |
| Admin      | `admin@fixflow.com`         | All branches, every module                      |
| Manager    | `manager@fixflow.com`       | Colombo 03 branch only                          |
| Technician | `technician@fixflow.com`    | Only repairs assigned to them; no pricing       |
| Cashier    | `cashier@fixflow.com`       | POS, payments, branch register                  |
| Customer   | `customer@fixflow.com`      | Only their own repairs, estimates and warranty  |

## Known limitations

These are prototype gaps, not bugs — flagging them so nobody mistakes this for production-ready.

- **No backend.** Every list, total and chart is hard-coded sample data in `src/App.tsx`.
  Nothing is saved when you create a repair, complete a sale or adjust stock.
- **Authentication is fake.** Credentials are checked in the browser and the session is a plain
  JSON blob in `localStorage`, so anyone can edit their role there and unlock the Admin UI.
  Role scoping is a UI convenience, not a security boundary — real authorization has to live
  on a server.
- **Many screens are shells.** Repairs, POS, inventory, repair details and AI diagnosis are
  fleshed out; the remaining nav pages render a `ModulePreview` placeholder. Tab switches on
  the repair-detail page change the heading but not the content.
- **Not verified by tests.** There is no test runner, linter or CI configured yet.
- **Duplicate lockfiles.** Both `package-lock.json` and `pnpm-lock.yaml` are committed, so npm
  and pnpm installs can drift. Pick one package manager and delete the other lockfile.
- **Fonts load from Google Fonts** at runtime (`src/index.css`), which adds a third-party
  request and a flash of fallback text.
