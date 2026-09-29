# How contracts are verified on scdoscan.io (shard0, chainId 5680)

scdoscan.io marks a shard0 contract **"Contract: Verified"** only when its source code, compiled with the stated
settings, reproduces the code stored on chain **byte-for-byte**.

## Checks (tool: `verify_contract.py`)
1. Compile the source with **solc standard-JSON**. The settings are exactly those in the record: compiler version, optimizer on/off and runs, evmVersion. The source key is the file name. No imports are resolved; flatten the source first if needed.
2. Fetch `eth_getCode(address, "latest")` from `https://scdoscan.io/rpc/0` (the tool asserts `eth_chainId` = 5680).
3. **Full match:** compiled `deployedBytecode` == on-chain code, including the trailing CBOR metadata hash.
   The metadata hash covers the source text and settings, so a full match means this exact source file was deployed.
   If only the metadata tail differs, that is a "partial" match. It is not published by default.
   Contracts with `immutable` variables need their immutable slots masked before comparing. The simple tool refuses these.
4. If a creation tx is given: the tx must have created this address, and its input must start with the compiled creation bytecode.
   The remainder is recorded as constructor arguments.
5. Publish `/verified/<address>.json` (source, ABI, settings, code sha256, creation tx, read/write descriptor)
   and `/verified/<address>.standard-input.json`, and update `/verified/index.json`.

On the address page, the explorer shows the badge, source, settings and ABI. It also checks live in the visitor's browser that
`sha256(eth_getCode)` still equals the published `codeSha256`.
Verified contracts automatically get the Read/Write contract panel, built from the published ABI and solc `methodIdentifiers`.

## Reproduce it yourself
```
solc-0.8.24 --standard-json < <address>.standard-input.json \
  | jq -r '.contracts[].[].evm.deployedBytecode.object'     # prepend 0x
curl -s -X POST https://scdoscan.io/rpc/0 -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["<address>","latest"]}'
```
The two hex strings must be identical.

## Verify a new contract (operator)
```
python3 verify_contract.py <address> <Source.sol> <ContractName> --solc 0.8.24 --runs 200 --evm paris \
        --creation-tx <0x deploy tx> --out published
# upload published/<address>.json, published/<address>.standard-input.json, published/index.json
# to /usr/share/nginx/scdoscan-v2/verified/ on the explorer host (make a backup first)
```
Use `--no-optimizer` if the contract was compiled without the optimizer. solc binaries come from py-solc-x (`~/.solcx/solc-v<version>`).

## Currently verified
| contract | address | compiler | match |
|---|---|---|---|
| SCDOTestUSD (tUSDT) | 0xb042c1833687d05cba414f04ec4013744ddeadcc | solc 0.8.24, optimizer 200, paris | full |
| SCDOTestAUD (tAUD) | 0x13c22e6944eeeca58768dcaaa03dd485fb8c9ad0 | solc 0.8.24, optimizer 200, paris | full |
