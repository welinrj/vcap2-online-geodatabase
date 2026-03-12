# VCAP2 Online Geodatabase

GIS data management portal for DEPC (Department of Environmental Protection and Conservation), Vanuatu. Provides staff-authenticated geospatial dataset management and public data access.

## Features

- **Staff Portal** (authenticated) — Upload, manage, and edit geospatial datasets; manage Community Conservation Areas (CCAs) and Marine Protected Areas (MPAs)
- **Public Portal** — Browse and download published datasets

## Tech Stack

- React 19, TypeScript, Vite
- Firebase (Auth, Firestore, Storage, Realtime Database)
- Leaflet / React-Leaflet for map rendering

## Getting Started

```bash
npm install
cp .env.example .env   # Configure Firebase credentials
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests |

## Deployment

Configured for Netlify deployment. See `netlify.toml`.
