# APL Search Assistant — app (M1)

The portfolio app from the PRD: **ASP.NET Core + EF Core/SQLite** backend, **React + Vite +
Tailwind** frontend. M1 delivers the **company-centric data layer**, manual company CRUD,
persons/contacts, the stage pipeline, the **≥15 "ready" counter** (mail + phone), and the
**LinkedIn capture import** endpoint the browser extension feeds.

```
app/
  APLSearchAssistant.slnx
  Api/            ASP.NET Core Web API (.NET 10)
    Models/       Company (spine) · Person · ContactInfo · enums · DTOs
    Data/         AppDbContext (EF Core, enums-as-strings)
    Endpoints/    /api/* (CRUD, /companies/import, /stats)
    Migrations/   InitialCreate
  web/            React + Vite + TypeScript + Tailwind v4 + MDI icons
```

## Run (two terminals)

**1. API** (creates `apl.db` via migration on first run, port 5099):
```
cd app/Api
dotnet run
```
- Health: http://localhost:5099/api/health · OpenAPI: http://localhost:5099/openapi/v1.json

**2. Frontend** (Vite proxies `/api` → :5099):
```
cd app/web
npm install
npm run dev        # http://localhost:5173
```

## API surface (M1)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/companies?stage=&lan=&ready=&hasEmail=&hasPhone=` | list (filtered) |
| GET/POST | `/api/companies` · `/api/companies/{id}` | read / create |
| PUT/DELETE | `/api/companies/{id}` | update (stage, fields) / delete |
| POST | `/api/companies/{id}/contacts` · `/persons` | add nested |
| DELETE | `/api/contacts/{id}` · `/api/persons/{id}` | remove nested |
| POST | `/api/companies/import` | bulk import from the LinkedIn extension (dedupe by handle) |
| GET | `/api/stats` | totals + `readyForList` counter + stage breakdown |

The extension's **Copy JSON** output pastes straight into the app's **Import capture** panel.

## Notes
- `apl.db` (+ `-wal`/`-shm`), `bin/`, `obj/`, `node_modules/`, `dist/` are git-ignored — the
  repo ships schema + migrations, never data (PRD §10).
- Tailwind v4 (CSS-first, `@tailwindcss/vite`); icons via `@mdi/font` (Material Design range);
  UI font is a Nerd Font stack (install e.g. *JetBrainsMono Nerd Font* locally for the look).
