# How contracts are verified on scdoscan.io (shard0, chainId 5680)

Verification is **automatic**. Submit the form at https://scdoscan.io/verify-contract.html.
A contract is marked **"Contract: Verified"** only when the submitted source,
compiled with the stated settings, reproduces the code stored on chain.

## Who can submit
- The submitter signs this text with `personal_sign` (MetaMask or the SCDO web wallet "Sign Message"):
  `SCDO contract verification <contract address, lowercase> <unix timestamp>`
- The signature must be less than 10 minutes old. Each signature can be used only once.
- The signing address must be **KYC-verified** in the shard0 KYC registry (`isVerified(address, tier)`).
  The registry stores only a status, a tier, an expiry date and a record hash. It holds no personal data.
  If an address is not verified yet, complete KYC in the SCDO web wallet (KYC tab): https://scdoscan.io/wallet/

## Checks (service `scdo-verify`)
1. **Compiler.** Only official solc release builds from binaries.soliditylang.org are used. Each build is checked against the SHA-256 in `list.json` before use.
2. **Sandboxed compile.** solc runs in standard-JSON mode with your compiler version, optimizer on/off and runs, and evmVersion.
   It runs as an unprivileged user in an empty temp directory with CPU, memory and time limits.
   Imports are not fetched from the network. Put every file inline in standard JSON, or flatten the source.
3. **Runtime match.** The compiled `deployedBytecode` is compared with `eth_getCode(address, "latest")`, and `eth_chainId` must be 5680.
   `immutable` slots are masked. The trailing CBOR metadata hash is compared separately:
   - **Full match:** identical, including the metadata hash.
   - **Partial match:** identical except the metadata hash. The code is the same, but the source text, file names or settings recorded in the metadata differ.
4. **Creation check (where possible).** The creation transaction is found. Its input must start with the compiled creation bytecode.
   The remainder is the constructor arguments. If you entered constructor arguments, they must be equal to it.
5. **Publish.** `/verified/<address>.json` (source, ABI, settings, code sha256, creation tx, read/write descriptor, submitter address and KYC tier),
   `/verified/<address>.standard-input.json` and `/verified/index.json` are written immediately.
   The address page then shows the source code and the Read/Write panel.
   Your browser also re-checks `sha256(eth_getCode)` live against the published `codeSha256`.

Limits: 2 MB per request, 1.5 MB of source, 300 files, 60 s compile time, 12 submissions per hour per IP.
Problems? Report them here: https://github.com/SCDOLAB/scdoscan-web/issues/new?template=contract-verification.yml

---

# scdoscan.io 合约验证方式（shard0，chainId 5680）

验证全自动完成。请在 https://scdoscan.io/verify-contract.html 提交。
只有当提交的源码按所填设置编译后，与链上代码一致时，合约才会显示"Contract: Verified"。

- **提交人：** 用 `personal_sign`（MetaMask 或 SCDO 网页钱包"签名消息"）签署
  `SCDO contract verification <合约地址小写> <unix 时间戳>`。
  签名 10 分钟内有效，且只能使用一次。
  签名地址必须在 shard0 KYC 注册合约中为"已认证"。该合约只存状态、等级、有效期和记录哈希，不存任何个人信息。
  尚未认证的地址，请在 SCDO 网页钱包 KYC 页面完成认证：https://scdoscan.io/wallet/
- **检查：**
  1. 只使用 soliditylang.org 官方 solc 发布版，并校验 SHA-256。
  2. 以非特权用户在沙箱中编译，有 CPU、内存和时间限制。
  3. 与 `eth_getCode` 比对：immutable 位置会被屏蔽，元数据哈希单独比较（完全匹配 / 部分匹配）。
  4. 如能找到部署交易，还会核对创建字节码和构造参数。
- **发布：** 验证通过后立即写入 `/verified/<地址>.json`，地址页随即显示源码和读/写面板。
- **遇到问题？** 请在这里反馈：https://github.com/SCDOLAB/scdoscan-web/issues/new?template=contract-verification.yml
