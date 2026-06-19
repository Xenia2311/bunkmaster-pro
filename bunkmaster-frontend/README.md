# BunkMaster Pro — Frontend

React + Vite frontend for BunkMaster Pro. Connects to the Node/Express backend API.

## Stack

- React 18 + React Router v6
- Vite 5 (build tool)
- Plain CSS modules (no Tailwind/styled-components)
- Fonts: Space Grotesk, Inter, JetBrains Mono

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — set `VITE_API_URL` to your backend URL:

```
VITE_API_URL=http://localhost:4000
```

### 3. Start dev server

Make sure the backend is running first, then:

```bash
npm run dev
```

The app will be at `http://localhost:5173`.

### 4. Build for production

```bash
npm run build
```

Output is in `dist/`. Deploy to Vercel, Netlify, or any static host.
Set the environment variable `VITE_API_URL` to your production backend URL.
For Netlify/Vercel, also add a redirect rule: all paths → `/index.html`
(React Router needs this for client-side routing to work on refresh).

## Pages

| Route | Description | Auth |
|-------|-------------|------|
| `/login` | Email/password login | Public |
| `/register` | Create account | Public |
| `/sections` | Create or join a section | Auth |
| `/` | Dashboard — subject tickets with live stats | Auth + section |
| `/today` | Daily check-in — mark attended/missed per slot | Auth + section |
| `/timetable` | Weekly grid — CR/SR can edit | Auth + section |
| `/cancellations` | Cancellations & make-up slots | Auth + section |
| `/admin` | CR/SR tools: subjects, holidays, cancellations | Auth + section + CR/SR |

## Design

Warm dark theme (charcoal background, cream accents) with burnt-orange signal
color, mint green for safe zones, amber for caution. Typography: Space Grotesk
for headings, Inter for body, JetBrains Mono for stats and codes.

Signature element: the **Attendance Gauge** — a semi-circle SVG dial with
an animated needle. Used on subject cards (small) and the dashboard header (large).

Subject cards are styled as **boarding-pass tickets** (cream surface, dashed
border, perforation cutout circles) to give the app a distinctive identity.
