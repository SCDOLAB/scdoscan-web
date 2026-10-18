# SCDO wallet app

Non-custodial wallet for `https://scdo.com.au/wallet/app/` and `https://apeccapital.org/wallet/app/`. Keys stay in this browser. The legacy page at `/wallet/` is not modified.

## Develop

```bash
cd wallet-app
npm ci --ignore-scripts
npm test
npm run typecheck
npm run dev
```

The dev server is `http://127.0.0.1:5173/wallet/app/`.

## Build

```bash
cd wallet-app
npm ci --ignore-scripts
npm test
npm run build
```

`npm run build` sets `SOURCE_DATE_EPOCH=1700000000` and writes `dist/BUILD.txt` with a sha256 of every output file. Run the build twice and the trees match.

The production `index.html` gets a Content-Security-Policy and sha384 integrity on the script and stylesheet. The service worker is scoped to `/wallet/app/` only.

## Deploy

1. Build on Node 22 with `npm ci --ignore-scripts` and `npm run build`.
2. Copy the **contents** of `dist/` into the directory that is served as `/wallet/app/` (see `deploy/nginx-snippet.conf`). Do not replace `/wallet/` itself.
3. Publish `BUILD.txt` next to `index.html` so the hub can show the hashes.
4. Serve `/wallet/wallet-ui.json` as real JSON, or return 404. An HTML fallback must not be used for that path. A bad or missing signature is ignored and the app keeps its built-in links.
5. Use the headers in `deploy/nginx-snippet.conf` (CSP, `nosniff`, `no-referrer`, `COOP`, `X-Frame-Options`). Enable HSTS for the site if it is not already on.
6. Do the same copy on apeccapital.org. Do not redirect that origin at scdo.com.au; each origin has its own vault.

The agent ledger, RPC, pay links, and join links use the page's own origin first (`https://scdo.com.au` or `https://apeccapital.org`). The other origin is the fallback. A signed `wallet-ui.json` list is reordered the same way, and a missing host is filled in. The app does not load `/config/site-functions.json`.

## Links

- Pay links are created as `https://scdo.com.au/pay` or `https://apeccapital.org/pay`, matching the current https origin. EIP-681 links have no host.
- Referral links are `{origin}/join?ref=<code>`. A code returned by the ledger is rebuilt locally.
- Old pay and wallet QR codes whose host is the legacy explorer are recognised and are not contacted. No other path on that host is used.
- Links to `/wallet/hub`, `/wallet/news`, `/wallet/events`, `/wallet/invite`, `/wallet/agents`, `/wallet/pool`, and `/wallet/help` get `?lang=en` or `?lang=zh`. The wallet offers English and 華語. 華語 strings are Traditional. Panel links still use `zh`.
- Settings links to the connected-wallets page on this origin. The path is `links.connect` from the signed config, or `/wallet/connect/`. It gets the same `?lang=en` or `?lang=zh`.

## Agent

“Start my agent” registers a separate key. The payout is this wallet’s Shard0 address. Heartbeats run only while this tab is open and visible, about once a minute, and the body always includes `code: "ONLINE"`. Closing the tab takes the agent offline. The app says that once; dismissing it sticks.

## Vault

New vaults are in IndexedDB (`scdo-wallet-app`), AES-256-GCM, with the key wrapped by PBKDF2-SHA256 at 600,000 iterations. A passkey on this device can wrap the same key when the browser supports the PRF extension. A password still unlocks it.

If `localStorage['scdo_vault']` is present, the unlock screen can copy it into the new vault. The old record is read and left in place. `#/legacy` opens that import only when the old record exists. With nothing to import, the app leaves that URL and goes home (the start screen, until a wallet is unlocked).
