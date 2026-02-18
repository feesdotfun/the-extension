# fees.fun — Chrome Extension

Save fees. Track Twitter. Trade faster on Solana.

**fees.fun** is an open-source Chrome extension that reduces trading fees on Solana platforms from 0.95–1.25% down to just **0.1%**. It works by intercepting trades at the browser level and routing them through our backend, cutting out the platform middleman fee while keeping everything functional.

> One extension. Works on Axiom, Uxento, RapidLaunch, J7Tracker — and more coming.

---

## how it works

![how it works](public/images/how-it-works.png)

1. **you click trade** — use axiom, uxento, rapidlaunch, or j7tracker as normal
2. **extension intercepts** — the request gets caught before hitting the platform's backend
3. **routed through fees.fun** — our backend builds the transaction with a 0.1% fee instead of the platform's 1%+
4. **platform sees nothing** — a spoofed success response goes back to the site. it thinks everything went normally

the platform never knows. your account stays clean. you keep the difference.

---

## architecture

the extension is a Chrome MV3 extension with multiple build targets:

```
src/
├── popup/              # react UI (settings, wallet management, savings dashboard)
│   ├── App.tsx
│   ├── components/
│   └── index.html
│
├── background/         # service worker (api calls, websocket, message routing)
│   └── background.ts
│
├── content/            # content script [REDACTED] — bridges ISOLATED and MAIN worlds
│   └── content.ts
│
├── inject/             # MAIN world scripts [REDACTED] — the interception layer
│   ├── shield.ts           # anti-detection (runs first on every page)
│   ├── http-interceptor.ts # RapidLaunch — intercepts fetch/XHR
│   ├── ws-interceptor.ts   # Uxento — intercepts WebSocket messages
│   ├── j7-interceptor.ts   # J7Tracker — intercepts WebSocket messages
│   ├── axiom-interceptor.ts# Axiom — patches JS source code before execution
│   └── shared/
│       └── interceptor-utils.ts
│
├── lib/                # shared utilities
│   ├── api.ts              # REST client for fees.fun backend
│   ├── auth.ts             # JWT token management
│   ├── wallet-cache.ts     # encrypted local key cache (AES-GCM + PBKDF2)
│   ├── solana.ts           # balance lookups via Helius RPC
│   ├── turnkey.ts          # Turnkey SDK for non-custodial key management
│   ├── platforms.ts        # platform definitions and fee configs
│   ├── storage.ts          # chrome.storage helpers
│   └── types.ts
│
└── public/
    ├── manifest.json
    ├── icons/
    └── rules/              # declarativeNetRequest rules (CSP modifications)
```

### interception methods by platform

| platform | method | what it does |
|---|---|---|
| **Axiom** | source patching | rewrites program addresses in axiom's JS before it executes. swaps their router for ours, their fee wallets for ours. uses MutationObserver + fetch override to catch all script loads |
| **RapidLaunch** | HTTP interception | proxies fetch() and XMLHttpRequest. deploy/sell/token-balance requests get forwarded to our backend with auth headers. launch listings get merged with our data |
| **Uxento** | WebSocket interception | proxies the WebSocket constructor and `.send()`. create/swap/dump_all events get routed through our WS proxy instead of uxento's backend |
| **J7Tracker** | WebSocket interception | same approach as uxento. intercepts `debug_request` events for `create_token` and `sell_token`, routes through our proxy |

### shield

shield.js is the main file that keeps our patches from being detected. it runs before anything else on the page and makes sure sites can't tell the extension exists. without it, platforms could detect and block our interceptors.

### cross-world communication

chrome extensions have two isolated JS worlds. our scripts need to talk across them:

```
┌─────────────────────┐              ┌─────────────────────┐
│    MAIN world       │              │   ISOLATED world    │
│                     │  CustomEvent │                     │
│  shield.js          │◄────────────▶│  content.ts         │
│  http-interceptor   │  (channel    │                     │
│  ws-interceptor     │   key is     │  reads auth token,  │
│  j7-interceptor     │   random     │  wallet keys from   │
│  axiom-interceptor  │   per build) │  chrome.storage     │
│                     │              │                     │
└─────────────────────┘              └─────────────────────┘
```

the channel key is regenerated every build — it's a random string baked in by vite. shield.js blocks any page listener from subscribing to events with that prefix, so the site can't eavesdrop.

### wallet security

your keys are managed by [Turnkey](https://turnkey.com) — the same infrastructure used by Coinbase and other major crypto companies. each user gets their own isolated sub-organization. keys never leave Turnkey's secure enclave in plaintext.

when the extension needs to sign a transaction, the key is exported encrypted (AES-256-GCM) and stays encrypted through every hop. the backend only ever sees ciphertext — it decrypts momentarily to sign, then discards. you can verify this yourself in `src/lib/wallet-cache.ts` and the signing logic in the release build.

the code for all of this is readable in this repo — check for yourself.

---

## supported platforms

| platform | fee without fees.fun | fee with fees.fun | status |
|---|---|---|---|
| [Axiom](https://axiom.trade) | 0.95% | 0.1% | live |
| [Uxento](https://uxento.io) | 1.25% | 0.1% | live |
| [RapidLaunch](https://rapidlaunch.io) | 1.00% | 0.1% | live |
| [J7Tracker](https://j7tracker.io) | 1.00% | 0.1% | live |

more platforms added regularly. join the [discord](https://discord.gg/feesdotfun) to request new ones.

---

## install

### from release (recommended)

1. go to [**Releases**](https://github.com/feesdotfun/the-extension/releases)
2. download `extension.zip` from the latest release
3. unzip it
4. open `chrome://extensions` in chrome
5. enable **Developer mode** (top right)
6. click **Load unpacked** → select the unzipped folder
7. done — the fees.fun icon appears in your toolbar

### from source

> some features need the redacted interceptor code, so building from source gives you a partial build. use the release zip for the full extension.

```bash
pnpm install
node scripts/build.js
```

load `dist/` as unpacked extension in chrome.

---

## redacted files

files in `src/inject/` and `src/content/` are redacted in this repo. the file structure is preserved but the contents are replaced with a comment. this is intentional — if we published the full interception source, platforms could patch against it within hours.

the compiled + obfuscated code is included in every release build. download `extension.zip` from the [releases page](https://github.com/feesdotfun/the-extension/releases) to get the full working extension. you can inspect the minified output there.

everything else — popup UI, background worker, wallet management, crypto utils, API client — is fully readable here.

---

## tech stack

- **chrome MV3** — manifest v3, service worker background
- **react 18** + **tailwind** — popup UI
- **vite 6** — multi-target build (popup, background, content, 5 inject scripts)
- **turnkey SDK** — non-custodial wallet infrastructure
- **@solana/web3.js** — balance lookups, transaction building
- **typescript** throughout

the backend (web API + launch server) is not open source. it handles transaction building, signing, RPC routing, and fee collection — publishing that would expose our infrastructure and make it trivial to bypass fees entirely or clone the service. the extension source is where all the user-facing logic lives and where trust matters most, which is why it's public.

---

## links

- [fees.fun](https://www.fees.fun) — main site
- [discord](https://discord.gg/feesdotfun) — community & support
- [twitter](https://x.com/feesdottfun) — twitter/x
- [releases](https://github.com/feesdotfun/the-extension/releases) — download latest build

---

## about this repo

this repo is auto-published from our private monorepo. commits here are just dated release snapshots, not individual changes — that's why every commit is "Release vYYYY.MM.DD". actual development happens in the main monorepo.

---

**fees.fun** — stop overpaying platforms. keep your SOL.
