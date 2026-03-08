# Slidefund

**Prediction market index fund and arbitrage engine**

Slidefund allows users to express a thesis in plain English (e.g., "AI regulation will tighten in 2025") and automatically constructs a diversified basket of correlated prediction market positions across Polymarket, Kalshi, and Manifold — similar to an ETF, but for forecasting markets. The system also continuously scans for price discrepancies on the same question across platforms and surfaces arbitrage opportunities.

## Architecture

### AI Intelligence Layer

**Backboard Agents** — 4 persistent AI agents with stateful memory:
- `ThesisResearcher` — RAGs over resolved market history to find analogues and score confidence for user theses
- `ArbitrageScanner` — validates and deduplicates arb opportunities from the alert queue
- `IndexRebalancer` — monitors ETF basket NAV drift and triggers rebalance when weights shift >5%
- `AlertDispatcher` — formats confirmed arb alerts for the frontend feed

**Gemini function calling** — (`gemini-2.5-flash-lite`) for:
- `thesisMapper` — thesis to market question mapping with confidence scoring
- `arbScorer` — arb risk assessment with spread calculation and urgency scoring

### Execution & Settlement
- **Solana + Anchor** — ETF baskets minted as SPL tokens; arb execution via Jupiter Aggregator
- **Redis** — price feed pub/sub, arb alert queue
- **Supabase** — user portfolios, thesis history, resolution events

### Frontend
- **Vite + React** (`client/`) — thesis entry UI and results rendering
- **Auth0** — SPA authentication gate (login/logout + protected app shell)
- **Cloudinary** — media and generated cards
- **Vultr** — cloud deployment

## Current Status

### ✅ Implemented
- **4 Backboard agents** (`agents/`)
  - Full assistant/thread lifecycle management
  - ID persistence to `.env`
  - Error handling and reuse logic
  - *Blocked by Backboard subscription/credits for inference*

- **2 Gemini AI modules** (`ai/`)
  - `thesisMapper.js` — thesis → market basket mapping ✅ **live and tested**
  - `arbScorer.js` — arbitrage opportunity scoring ✅ **live and tested**
  - Function calling with structured output

- **Frontend Auth0 gate** (`client/`)
  - `Auth0Provider` wired in `main.jsx`
  - Route-level auth gate in `App.jsx` (loading, login, authenticated shell, logout)
  - Vite-prefixed env variable support (`VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`)

### 🚧 Not Yet Built
- Redis price feed scanner
- Solana/Anchor smart contracts
- Supabase schema and integration
- Jupiter swap integration

## Setup

### Prerequisites
- Node.js 18+
- API keys for Backboard and Gemini
- Auth0 SPA application (for `client/` login flow)

### Installation

```bash
npm install
```

### Environment Variables

Create a root `.env` file:

```bash
BACKBOARD_API_KEY=your_backboard_key
GEMINI_API_KEY=your_gemini_key
```

Create `client/.env` for frontend auth:

```bash
VITE_AUTH0_DOMAIN=your-auth0-domain
VITE_AUTH0_CLIENT_ID=your-auth0-client-id
```

In Auth0 Application settings for local development:

- **Allowed Callback URLs:** `http://localhost:5173`
- **Allowed Logout URLs:** `http://localhost:5173`
- **Allowed Web Origins:** `http://localhost:5173`

### Run Frontend (Vite)

```bash
cd client
npm install
npx vite
```

Then open `http://localhost:5173`.

From the repo root, you can also run:

```bash
npm run dev:client
```

### Testing Individual Components

**Test Gemini thesis mapper:**
```bash
node ai/thesisMapper.js
```

**Test Gemini arb scorer:**
```bash
node ai/arbScorer.js
```

**Test Backboard agents (requires active subscription):**
```bash
node agents/thesisResearcher.js
node agents/arbitrageScanner.js
node agents/indexRebalancer.js
node agents/alertDispatcher.js
```

### Automated Agent Validation

**Validate each Backboard agent individually (schema/pass-fail checks):**
```bash
npm run test:agents
```

**Same test but force new assistants (ignore saved assistant IDs):**
```bash
npm run test:agents:fresh
```

**Validate integrated multi-agent flows:**
```bash
npm run test:agents:integration
```

**Integration test with fresh assistants:**
```bash
npm run test:agents:integration:fresh
```

The automated tests return non-zero exit code when a response is not parseable/structured as expected.

## Tech Stack

- **Runtime:** Node.js (ES modules)
- **AI/ML:** Backboard API, Google Gemini 1.5 Pro
- **Blockchain:** Solana, Anchor Framework, Jupiter Aggregator
- **Backend:** Redis, Supabase
- **Frontend:** Next.js, Auth0, Cloudinary
- **Deployment:** Vultr

## License

MIT
