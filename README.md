# Slicefund

**AI-Powered Prediction Market Platform**

Slicefund is a comprehensive prediction market aggregation and portfolio management platform that empowers users to analyze, create, and manage diversified portfolios (baskets) of prediction markets across multiple platforms.

## What It Does

### 🔍 Thesis Search & Analysis
Express your market view in plain English (e.g., "Trump tariff markets are bullish" or "BTC will reach $150k this month") and Slicefund's AI:
- **Scans 3 major platforms**: Polymarket, Kalshi, and Manifold
- **Maps your thesis** to relevant prediction markets with confidence scoring
- **Ranks and scores** top market picks based on relevance
- **Generates research analysis** with confidence levels, key drivers, risks, and market angles
- **Creates instant baskets** from your thesis results with one click

### 📊 Market Baskets (Portfolio Management)
Create and manage diversified baskets of prediction markets — like ETFs for forecasting:
- **Custom baskets**: Build portfolios from thesis search results or manually
- **Live basket tracking**: Monitor positions across platforms
- **Rebalance analysis**: AI-powered drift detection and rebalance recommendations
- **Equal-weight or custom**: Flexible weighting strategies
- **Persistent storage**: All baskets saved locally and across sessions

### ⚡ Arbitrage Scanner
Continuously monitor cross-platform price discrepancies:
- **Real-time scanning**: Compare identical/similar markets across platforms
- **Spread calculation**: Identify profitable arbitrage opportunities
- **Risk scoring**: AI-powered assessment of opportunity quality
- **Alert feed**: Live updates on new arbitrage opportunities
- **Similarity matching**: Advanced question matching to find cross-platform equivalents

### 🏗️ Index Builder
Manage index positions with automated rebalancing:
- **NAV drift monitoring**: Track basket weight deviations
- **Rebalance triggers**: Automatic alerts when weights shift >5%
- **Trade recommendations**: Specific buy/sell actions to restore target weights
- **Agent-driven analysis**: Backboard AI analyzes basket health and generates rebalance plans

### 📈 Live Market Data
- **Multi-platform aggregation**: Real-time data from Polymarket, Kalshi, and Manifold
- **Trending markets**: See what's hot across all platforms
- **Market overview**: Total markets, average odds, arbitrage opportunities
- **Volume tracking**: Monitor trading activity and liquidity

## How It Works

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React + Vite)                 │
│  ┌──────────────┬──────────────┬──────────────┬───────────┐ │
│  │ Thesis Search│ My Baskets   │ Arb Scanner  │ Markets   │ │
│  └──────────────┴──────────────┴──────────────┴───────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express.js)                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              API Endpoints                            │  │
│  │  • /api/analyze        (thesis → market search)      │  │
│  │  • /api/thesis/map     (market mapping)              │  │
│  │  • /api/scan           (arbitrage detection)         │  │
│  │  • /api/basket/rebalance (portfolio analysis)        │  │
│  │  • /api/arb/score      (opportunity scoring)         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────┬──────────────┬───────────────────────┐  │
│  │  Gemini AI    │  Backboard   │   Market Data APIs    │  │
│  │  Function     │   Agents     │                       │  │
│  │  Calling      │              │  • Polymarket         │  │
│  └───────────────┴──────────────┤  • Kalshi             │  │
│                                  │  • Manifold           │  │
│                                  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### AI Intelligence Layer

#### 🤖 Backboard Agents (Persistent AI with Memory)
Four specialized AI agents with stateful conversations and context retention:

1. **ThesisResearcher** (`agents/thesisResearcher.js`)
   - Analyzes investment theses using historical market data
   - Generates confidence scores, key drivers, risks, and market angles
   - RAG-enabled to find analogues from resolved markets
   - Stateful thread maintains context across analyses
   - Fresh thread per analysis with 404 error recovery

2. **ArbitrageScanner** (`agents/arbitrageScanner.js`)
   - Validates and deduplicates arbitrage opportunities
   - Analyzes spread viability and execution risk
   - Filters alert queue for high-quality opportunities
   - Persistent assistant state for pattern recognition

3. **IndexRebalancer** (`agents/indexRebalancer.js`)
   - Monitors basket NAV drift and weight deviations
   - Triggers rebalance alerts when positions shift >5%
   - Generates specific trade recommendations
   - Maintains historical context of basket performance
   - Fresh session per rebalance with stale-thread recovery

4. **AlertDispatcher** (`agents/alertDispatcher.js`)
   - Formats arbitrage alerts for frontend consumption
   - Prioritizes opportunities by urgency and spread
   - Enriches alerts with market context
   - Manages alert lifecycle and deduplication

**Technical Details:**
- Each agent has persistent `assistant_id` and `thread_id` stored in `.env`
- Automatic thread recreation on 404 errors (expired/deleted threads)
- Assistant recreation on 404 errors (expired/deleted assistants)
- Retry logic with fresh sessions on Backboard resource errors
- Thread-per-request pattern for thesis and rebalance agents

#### 🧠 Gemini AI (Function Calling & Structured Output)
Google Gemini 2.0 Flash Lite for real-time AI operations:

1. **thesisMapper** (`ai/thesisMapper.js`) ✅ **Production**
   - Maps user thesis to relevant prediction markets
   - Cross-platform search across Polymarket, Kalshi, Manifold
   - Confidence scoring and relevance ranking
   - Structured JSON output with market metadata
   - Handles ambiguous queries with semantic understanding

2. **arbScorer** (`ai/arbScorer.js`) ✅ **Production**
   - Evaluates arbitrage opportunity quality
   - Calculates spread, risk, and urgency scores
   - Assesses execution difficulty and platform fees
   - Returns structured risk analysis

**Implementation:**
- Function calling with structured schemas
- JSON mode for reliable parsing
- Error handling and retry logic
- Sub-second response times

### Frontend (React + Vite)

**Modern React SPA** with Auth0 authentication:

**Core Pages:**
- `Dashboard.jsx` — Main application shell with panel routing
- `SignIn.jsx` — Auth0 login flow

**Panels (Full-Screen Views):**
- `PanelThesis.jsx` — Thesis search interface
- `PanelBaskets.jsx` — Portfolio management with rebalancing
- `PanelMarkets.jsx` — Market browser and data explorer
- `PanelArb.jsx` — Arbitrage scanner with live alerts
- `PanelIndex.jsx` — Index builder and analytics
- `PanelProfile.jsx` — User settings and preferences

**Key Components:**
- `ThesisCard.jsx` — Search input with multi-step progress UI
- `ResultsPanel.jsx` — Analysis results with market picks and "Create Basket" button
- `AgentStatus.jsx` — Real-time agent status indicators
- `MeshBackground.jsx` — Animated gradient mesh background
- `WalletConnect.jsx` — Phantom wallet integration (Solana)
- `Sidebar.jsx` — Navigation with active state management
- `RightPanel.jsx` — Market suggestions and related markets

**State Management:**
- Local state with React hooks
- localStorage for basket persistence and search history
- Session state for active panel and user preferences
- Real-time updates via polling (no WebSocket yet)

**UI/UX Features:**
- Progress indicators for long-running AI operations
- Toast notifications for success/error states
- Responsive grid layouts
- Dark mode support
- Smooth animations and transitions

### Backend (Express.js + Node.js)

**RESTful API Server** (`server/index.js`) with 2,400+ lines of production code:

**Core Endpoints:**
- `POST /api/analyze` — Full thesis analysis pipeline (search → map → analyze)
- `POST /api/thesis/map` — Thesis to market mapping only
- `POST /api/scan` — Arbitrage opportunity detection
- `POST /api/basket/rebalance` — Portfolio rebalance analysis
- `POST /api/arb/score` — Score individual arbitrage opportunities
- `GET /api/trending/*` — Cached trending markets by platform
- `GET /api/agents/status` — Backboard agent health check

**Mock Trading Endpoints** (Development):
- `POST /api/mock/polymarket/orders` — Simulated order placement
- `POST /api/mock/polymarket/execute-arb` — Simulated arb execution
- `POST /api/mock/polymarket/execute-basket` — Simulated basket trades
- `POST /api/mock/polymarket/buy-basket` — Simulated basket purchase

**Features:**
- CORS enabled for local development
- JSON body parsing
- Error handling with structured responses
- Environment variable configuration
- In-memory caching for market relationships (1-hour TTL)
- Agent registry for Backboard assistant/thread management

### Data Layer

**Market Data Integration:**
- **Polymarket API**: Top markets, market details, odds data
- **Kalshi API**: Event markets, strike prices, volume
- **Manifold API**: Community markets, probability feeds
- **Caching**: `lib/trendingCache.js` with file-based persistence

**Storage:**
- **localStorage**: User baskets, thesis history, preferences
- **File cache**: Trending market data (1-hour TTL)
- **.env files**: Agent IDs, API keys, configuration

**No Database Yet:**
- Local-first architecture with browser storage
- Stateless server (except agent threads)
- Future: Supabase for user profiles, portfolios, history

## Current Status

### ✅ Fully Implemented & Production Ready

**Frontend:**
- ✅ Auth0 authentication with protected routes
- ✅ Thesis search with multi-step progress UI
- ✅ Results panel with market picks and analysis
- ✅ "Create Basket" button with instant basket creation
- ✅ Basket management (create, view, rebalance)
- ✅ Arbitrage scanner with live alerts
- ✅ Market browser across 3 platforms
- ✅ Past search history
- ✅ Wallet connection UI (Phantom)
- ✅ Responsive layouts and dark mode

**Backend API:**
- ✅ Full thesis analysis pipeline (`/api/analyze`)
- ✅ Market mapping endpoint (`/api/thesis/map`)
- ✅ Arbitrage scanning (`/api/scan`)
- ✅ Basket rebalancing (`/api/basket/rebalance`)
- ✅ Market data aggregation (Polymarket, Kalshi, Manifold)
- ✅ Trending market caching
- ✅ Agent status monitoring
- ✅ Mock trading endpoints for development

**AI/ML Systems:**
- ✅ 4 Backboard agents with persistent threads
  - ThesisResearcher with stale-thread recovery
  - ArbitrageScanner with validation logic
  - IndexRebalancer with fresh-session-per-run pattern
  - AlertDispatcher with formatting logic
- ✅ 2 Gemini AI modules (thesisMapper, arbScorer)
- ✅ Function calling with structured output
- ✅ Error handling and retry logic
- ✅ 404 recovery for expired threads/assistants

**Data & Storage:**
- ✅ localStorage for baskets and history
- ✅ File-based trending cache (1-hour TTL)
- ✅ In-memory relationship cache
- ✅ Market data normalization across platforms

### 🚧 In Progress / Planned

**Trading Integration:**
- 🚧 Solana/Anchor smart contracts for basket tokens
- 🚧 Jupiter Aggregator for swap execution
- 🚧 Real on-chain arb execution
- 🚧 SPL token minting for baskets

**Backend Infrastructure:**
- 🚧 Redis for real-time price feeds and pub/sub
- 🚧 Supabase for user profiles, portfolios, resolution history
- 🚧 WebSocket connections for live updates
- 🚧 Database-backed basket persistence

**Advanced Features:**
- 🚧 Custom basket weighting (currently equal-weight only)
- 🚧 Historical performance tracking
- 🚧 Portfolio analytics and metrics
- 🚧 Social features (share baskets, leaderboards)
- 🚧 Mobile app (React Native)

## Tech Stack

### Core Technologies
- **Runtime:** Node.js 18+ (ES modules)
- **Package Manager:** npm
- **Language:** JavaScript (ESNext)

### Frontend
- **Framework:** React 18.3.1
- **Build Tool:** Vite 6.0
- **Auth:** Auth0 React SDK 2.15
- **Styling:** CSS-in-JS (inline styles)
- **Wallet:** Phantom (Solana)

### Backend
- **Server:** Express.js 4.21
- **HTTP Client:** Axios 1.7
- **Environment:** dotenv 16.4
- **Process Management:** Concurrently (dev)

### AI/ML
- **Backboard API:** Persistent AI agents with stateful memory
- **Google Gemini:** 2.0 Flash Lite (via @google/generative-ai 0.21)
- **OpenAI SDK:** 4.77 (for Backboard client)
- **Function Calling:** Structured JSON output with schemas

### Market Data Sources
- **Polymarket API:** Top markets, odds, volume
- **Kalshi API:** Event markets, predictions
- **Manifold Markets API:** Community forecasts

### Planned Infrastructure
- **Blockchain:** Solana, Anchor Framework
- **Swap Aggregator:** Jupiter
- **Database:** Supabase (PostgreSQL)
- **Cache:** Redis
- **CDN:** Cloudinary
- **Deployment:** Vultr

## Setup

### Prerequisites
- Node.js 18+ and npm
- API keys:
  - **Backboard API** (for AI agents) — [backboard.io](https://backboard.io)
  - **Google Gemini API** — [ai.google.dev](https://ai.google.dev)
- Auth0 account and SPA application — [auth0.com](https://auth0.com)

### Installation

**1. Clone and Install Dependencies:**

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### Environment Variables

**2. Create Root `.env` File:**

```bash
# API Keys
BACKBOARD_API_KEY=your_backboard_api_key
GEMINI_API_KEY=your_gemini_api_key

# Backboard Agent IDs (auto-populated on first run)
THESIS_RESEARCHER_ASSISTANT_ID=
THESIS_RESEARCHER_THREAD_ID=
ARB_SCANNER_ASSISTANT_ID=
ARB_SCANNER_THREAD_ID=
INDEX_REBALANCER_ASSISTANT_ID=
INDEX_REBALANCER_THREAD_ID=
ALERT_DISPATCHER_ASSISTANT_ID=
ALERT_DISPATCHER_THREAD_ID=
```

**3. Create `client/.env` File:**

```bash
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your_client_id
VITE_AUTH0_AUDIENCE=your_api_identifier # optional
```

**4. Configure Auth0 Application:**

In your Auth0 dashboard, set these URLs for **local development**:

- **Application Type:** Single Page Application
- **Allowed Callback URLs:** `http://localhost:5173`
- **Allowed Logout URLs:** `http://localhost:5173`
- **Allowed Web Origins:** `http://localhost:5173`

### Running the Application

**Development Mode (Full Stack):**

```bash
# Run both server and client concurrently
npm run dev
```

This starts:
- **Backend:** `http://localhost:3001`
- **Frontend:** `http://localhost:5173`

**Run Server Only:**

```bash
npm run dev:server
# or
node server/index.js
```

**Run Client Only:**

```bash
npm run dev:client
# or
cd client && npx vite
```

### Testing & Development

**Test Gemini AI Modules (Fast):**

```bash
# Test thesis mapping
node ai/thesisMapper.js

# Test arbitrage scoring
node ai/arbScorer.js
```

**Test Backboard Agents (Requires API Key):**

```bash
# Test individual agents
node agents/thesisResearcher.js
node agents/arbitrageScanner.js
node agents/indexRebalancer.js
node agents/alertDispatcher.js
```

**Automated Agent Validation:**

```bash
# Test all agents with schema validation
npm run test:agents

# Force create new assistants (ignore saved IDs)
npm run test:agents:fresh

# Test integrated multi-agent flows
npm run test:agents:integration

# Integration test with fresh assistants
npm run test:agents:integration:fresh
```

The automated tests return non-zero exit code when responses don't match expected schemas.

## Key Features Explained

### 1. Thesis Search Flow

```
User Input: "Trump tariff markets are bullish"
     ↓
[Agent 1: Parse keywords] → "trump, tariff, trade, china"
     ↓
[Agent 2: Search APIs] → Scan Polymarket, Kalshi, Manifold
     ↓
[Agent 3: Rank markets] → Score relevance and confidence
     ↓
[Gemini Mapper] → Map thesis to top 5 markets with metadata
     ↓
[Backboard Researcher] → Generate analysis (confidence, drivers, risks)
     ↓
Results Panel → Show ranked markets + "Create Basket" button
```

### 2. Basket Creation

```
User clicks "Create Basket" on thesis results
     ↓
basketData = {
  name: "Trump tariff markets are bullish",
  markets: [
    { market: "Trump questions", platform: "Polymarket", weight: 0.2 },
    { market: "China questions", platform: "Kalshi", weight: 0.2 },
    ...
  ]
}
     ↓
Check localStorage for duplicate name → Add counter if needed
     ↓
Save to localStorage → Update UI state
     ↓
Navigate to My Baskets panel → Show new basket
```

### 3. Arbitrage Detection

```
Fetch trending markets from all platforms
     ↓
For each market pair:
  - Calculate question similarity (tokenize + overlap)
  - Check if different platforms
  - Calculate price spread
     ↓
If spread ≥ 4% AND similarity ≥ 45%:
  → Flag as arbitrage opportunity
     ↓
Score with Gemini arbScorer (risk, urgency, spread)
     ↓
Validate with Backboard ArbitrageScanner
     ↓
Display in Arb Scanner panel with alerts
```

### 4. Basket Rebalancing

```
User clicks "Check Rebalance" on a basket
     ↓
Calculate weight drift for each position:
  drift = |current_weight - target_weight|
     ↓
If any position drifted >5%:
  → Trigger rebalance alert
     ↓
Send basket to Backboard IndexRebalancer agent
     ↓
Agent analyzes drift and generates trades:
  "BUY 0.15 on Market A"
  "SELL 0.08 on Market B"
     ↓
Display proposed trades with execute button
```

## Product Roadmap

### Phase 1: Core Platform ✅ (Current)
- [x] Multi-platform market aggregation
- [x] AI-powered thesis analysis
- [x] Basket creation and management
- [x] Arbitrage detection
- [x] Rebalancing recommendations
- [x] Auth0 authentication
- [x] Local storage persistence

### Phase 2: Trading Integration 🚧 (Next)
- [ ] Phantom wallet connection
- [ ] Solana SPL token baskets
- [ ] Jupiter swap integration
- [ ] On-chain arb execution
- [ ] Real money basket trading
- [ ] Transaction history

### Phase 3: Social & Analytics 🔮 (Future)
- [ ] Public basket sharing
- [ ] Leaderboards and rankings
- [ ] Portfolio performance tracking
- [ ] Research notes and annotations
- [ ] Community thesis library
- [ ] Mobile app (iOS/Android)

### Phase 4: Advanced Features 🔮 (Future)
- [ ] Custom weighting strategies
- [ ] Automated rebalancing
- [ ] Stop-loss and take-profit orders
- [ ] Market prediction contests
- [ ] API for third-party integrations
- [ ] White-label platform for institutions

## Contributing

Slicefund is currently in private development. Contributions are not yet accepted.

## License

MIT

---

**Built with ❤️ by the Slicefund team**
