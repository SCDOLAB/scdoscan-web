# SCDO node — quick start / 快速开始

Official go-scdo full node (legacy PoW chain, shards 1–4), built from
https://github.com/SCDOLAB/go-scdo at commit `cd31d1c` (the same code the public
nodes run) with Go 1.12.7. One small local-only patch: the TCP RPC (port 802x) now
binds to the address in the config (127.0.0.1) instead of always 0.0.0.0.
No private keys or wallets are included. A P2P node key is generated on first start
(`run/nodekey-shardN`); it is only a network identity, **not** a wallet.

Explorer: https://scdoscan.io · Online nodes: https://scdoscan.io/nodes.html

## English

**Files:** `scdo-node` (full node + CPU miner), `scdo-client` (CLI wallet/tools; Windows: `.exe`), `start.sh` / `start.bat`,
`status.sh` / `status.bat`, `config/node-shardN.json` (templates, pre-filled with the public bootstrap nodes).

**Run a node (sync only)**

    Linux:    ./start.sh 1          # shard 1..4
    Windows:  start.bat 1

**Solo-mine** (there is no pool; rewards go straight to your address, shard = first digit of the address):

    Linux:    ./start.sh --mine 1S01xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --threads 4
    Windows:  start.bat --mine 1S01xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --threads 4

No address yet? `./scdo-client key --shard 1` (Windows: `client.exe key --shard 1`) prints a new
address + private key. Save the private key offline; anyone with it controls the funds.

**Check status:** `./status.sh 1` (or `status.bat 1`) → compare `CurrentBlockHeight` with scdoscan.io.
Mining only pays once the node is fully synced. During the first minutes you may see `failed to write block ... ODR ... leveldb: not found` and the
height pausing: that is normal — the node first fetches headers of the other shards, then continues. The first sync downloads the full shard history
(millions of blocks, tens of GB under `~/.scdo/scdo-shardN`, Windows: `%USERPROFILE%\.scdo`) and takes many hours.

**Ports** (shard 1/2/3/4): P2P `8057/8058/8059/8056` TCP+UDP — open it in your firewall/router so others can
connect to you (optional, outbound works without it). HTTP RPC `8037/8038/8039/8036` and TCP RPC
`8027/8028/8029/8026` listen on 127.0.0.1 only (set `RPC_HOST=0.0.0.0` only if you know what you're doing —
the RPC includes miner control).

**Run in background (Linux):** `nohup ./start.sh 1 > shard1.log 2>&1 &` · stop: `pkill -f "scdo-node start -c ./run/node-shard1.json"`
**Docker:** `docker compose up -d` (see `docker-compose.yml`; set `SHARD` / `MINE_ADDRESS` there).
Several shards on one machine are fine — each uses its own ports and data dir.
Windows: the .exe files are unsigned, so SmartScreen may warn ("More info → Run anyway"); verify SHA256SUMS first.

Bootstrap nodes: 74.208.207.184, 82.223.19.88, 217.160.65.210, 74.208.136.152 (ports as above).
Shard0 (EVM, chainId 5680) runs core-geth (Ethash PoW) and is not included here; its node binaries, genesis and README are at https://scdoscan.io/downloads/shard0/ .

## 中文

**文件：** `scdo-node`（全节点 + CPU 挖矿）、`scdo-client`（命令行钱包/工具；Windows 为 `.exe`）、`start.sh` / `start.bat` 启动脚本、
`status.sh` / `status.bat` 状态查询、`config/node-shardN.json`（已预填公共引导节点的配置模板）。

**运行节点（仅同步）**

    Linux:    ./start.sh 1          # 分片 1..4
    Windows:  双击 start.bat，或在命令行运行 start.bat 1

**单机挖矿**（没有矿池，出块奖励直接进入你的地址；分片由地址首位数字决定）：

    Linux:    ./start.sh --mine 1S01xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --threads 4
    Windows:  start.bat --mine 1S01xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --threads 4

还没有地址？运行 `./scdo-client key --shard 1`（Windows：`client.exe key --shard 1`）生成新地址和私钥，
请离线妥善保存私钥，任何拿到私钥的人都能动用资金。首次启动会在 `run/` 目录生成 P2P 节点密钥，它只是网络身份，**不是钱包**。
本软件包不含任何私钥或钱包。

**查看状态：** `./status.sh 1`（或 `status.bat 1`），将 `CurrentBlockHeight` 与 scdoscan.io 上的高度对比。
节点同步完成后挖出的区块才会被网络接受。启动后最初几分钟可能出现 `failed to write block ... ODR ... leveldb: not found` 且高度暂停，属正常现象：
节点需先同步其他分片的区块头，随后会继续同步。首次同步需下载整个分片历史（数百万区块、数十 GB，保存在 `~/.scdo/scdo-shardN`，
Windows 为 `%USERPROFILE%\.scdo`），耗时数小时以上。

**端口**（分片 1/2/3/4）：P2P `8057/8058/8059/8056`（TCP+UDP，建议在防火墙/路由器放行，便于他人连接；不放行也能同步）。
HTTP RPC `8037/8038/8039/8036` 与 TCP RPC `8027/8028/8029/8026` 默认只监听 127.0.0.1（RPC 含挖矿控制，勿随意对外开放）。

**后台运行（Linux）：** `nohup ./start.sh 1 > shard1.log 2>&1 &`　**Docker：** `docker compose up -d`（在 `docker-compose.yml` 中设置 `SHARD` / `MINE_ADDRESS`）。
同一台机器可同时运行多个分片。Windows 下 exe 未签名，SmartScreen 可能提示（“更多信息 → 仍要运行”），请先核对 SHA256SUMS。

引导节点：74.208.207.184、82.223.19.88、217.160.65.210、74.208.136.152。
Shard0（EVM，chainId 5680）使用 core-geth（Ethash PoW），本包不包含；其节点程序、创世文件和说明见 https://scdoscan.io/downloads/shard0/ 。
