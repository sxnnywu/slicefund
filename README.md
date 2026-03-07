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

**Gemini 1.5 Pro** — function calling for:
- `thesisMapper` — thesis to market question mapping with confidence scoring
- `arbScorer` — arb risk assessment with spread calculation and urgency scoring

### Execution & Settlement
- **Solana + Anchor** — ETF baskets minted as SPL tokens; arb execution via Jupiter Aggregator
- **Redis** — price feed pub/sub, arb alert queue
- **Supabase** — user portfolios, thesis history, resolution events

### Frontend (Planned)
- **Next.js** — dashboard
- **Auth0** — authentication
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
  - Model fallback handling

### 🚧 Not Yet Built
- Redis price feed scanner
- Solana/Anchor smart contracts
- Supabase schema and integration
- Frontend dashboard
- Jupiter swap integration

## Setup

### Prerequisites
- Node.js 18+
- API keys for Backboard and Gemini

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file:

```bash
BACKBOARD_API_KEY=your_backboard_key
GEMINI_API_KEY=your_gemini_key
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

## Tech Stack

- **Runtime:** Node.js (ES modules)
- **AI/ML:** Backboard API, Google Gemini 1.5 Pro
- **Blockchain:** Solana, Anchor Framework, Jupiter Aggregator
- **Backend:** Redis, Supabase
- **Frontend:** Next.js, Auth0, Cloudinary
- **Deployment:** Vultr

## License

MIT
