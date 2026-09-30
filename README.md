# scdoscan-web

Static front-end of **[scdoscan.io](https://scdoscan.io)**: the block explorer for the SCDO network and the browser-based SCDO web wallet.

scdoscan.io shows blocks, transactions, addresses, tokens and nodes for:

| Chain | Consensus | Chain ID | Decimals | Public RPC |
|---|---|---|---|---|
| SCDO Shard1 (Classic) to SCDO Shard4 (Classic) (original go-scdo chain, not EVM, producing blocks) | ZPoW | n/a (shard numbers 1-4) | 8 | `https://scdoscan.io/rpc/1` ... `/rpc/4` |
| SCDO Shard0 (EVM) (core-geth fork) | Ethash PoW | **5680** (`0x1630`) | **18** | `https://scdoscan.io/rpc/0` |

## Layout

| Path in repo | Served at | What it is |
|---|---|---|
| `index.html`, `assets/`, `enhance.js`, `scdo-addnet.js`, `*.html` | `/` | Explorer SPA (prebuilt Vite bundle) plus static pages (start, quickstart, mine, nodes, api-docs, faucet, compliance, load test) |
| `wallet/` | `/wallet/` | Non-custodial web wallet (keys stay in the browser, optionally encrypted with a password) |
| `mine/` | `/mine/` | Shard 0 GPU mining guide |
| `verified/` | `/verified/` | Verified contract sources for shard 0 |
| `downloads/` | `/downloads/` | Small text files only (SHA256SUMS, patches, genesis, Dockerfile, index pages) |

The explorer back-end APIs (`/api/`, `/enhance/`) and the RPC proxies are not part of this repo.

## Downloads not included

These binaries are published on <https://scdoscan.io/downloads/> and are not stored in git. Check them against the `SHA256SUMS` files in `downloads/`.

- `downloads/scdo-node-linux-amd64`, `downloads/scdo-client-linux-amd64` (go-scdo, shards 1-4)
- `downloads/node/scdo-node-linux-amd64.tar.gz`, `scdo-node-windows-amd64.zip`, `scdo-node-darwin-amd64.tar.gz`
- `downloads/shard0/core-geth-scdo-linux-amd64`, `scdo-shard0-core-geth-darwin-arm64.tar.gz`
- `downloads/shard0/scdo-shard0-gpu-miner-windows-amd64.zip`, `scdo-shard0-gpu-miner-linux-amd64.tar.gz` (also in [scdo-gpu-miner releases](https://github.com/SCDOLAB/scdo-gpu-miner/releases))

Source: [go-scdo](https://github.com/SCDOLAB/go-scdo), [scdo-shard0](https://github.com/SCDOLAB/scdo-shard0), [scdo-gpu-miner](https://github.com/SCDOLAB/scdo-gpu-miner).

## 中文说明

本仓库是 [scdoscan.io](https://scdoscan.io) 区块浏览器与网页钱包的静态前端代码。浏览器支持 SCDO 原链分片 1-4（ZPoW）以及分片 0（基于 core-geth 的 Ethash PoW EVM 链，chainId 5680 / 0x1630，精度 18 位）。网页钱包为非托管钱包，私钥只保存在用户浏览器中。大型下载文件（节点、挖矿程序）不在仓库中，请从 scdoscan.io/downloads 下载并用 SHA256SUMS 校验。本项目采用 MIT 许可证。

## License

MIT, see [LICENSE](LICENSE). Third-party libraries bundled in `assets/` and `wallet/lib/` keep their own licenses.
