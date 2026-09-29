# SCDO legacy-chain node (shards 1-4) - downloads the official release and verifies its SHA256.
#   docker build -t scdo-node .
#   docker run -d --name scdo1 -e SHARD=1 -p 8057:8057 -p 8057:8057/udp -p 127.0.0.1:8037:8037 -v scdo-data:/root/.scdo scdo-node
# Mining: add  -e MINE_ADDRESS=1S01...  -e THREADS=4
FROM debian:bookworm-slim
ARG BASE_URL=https://scdoscan.io/downloads/node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /opt && cd /opt \
 && curl -fsSLO "$BASE_URL/scdo-node-linux-amd64.tar.gz" && curl -fsSLO "$BASE_URL/SHA256SUMS" \
 && grep " scdo-node-linux-amd64.tar.gz\$" SHA256SUMS | sha256sum -c - \
 && tar xzf scdo-node-linux-amd64.tar.gz && rm scdo-node-linux-amd64.tar.gz SHA256SUMS
WORKDIR /opt/scdo-node-linux-amd64
# node key + generated config persist in the data volume; RPC binds 0.0.0.0 inside the container
# (publish it only on 127.0.0.1 of the host).
ENV SHARD=1 MINE_ADDRESS="" THREADS=1 SCDO_RUN_DIR=/root/.scdo/run RPC_HOST=0.0.0.0
VOLUME /root/.scdo
EXPOSE 8057 8058 8059 8056 8057/udp 8058/udp 8059/udp 8056/udp 8037 8038 8039 8036
ENTRYPOINT ["/bin/sh", "-c", "if [ -n \"$MINE_ADDRESS\" ]; then exec ./start.sh --mine \"$MINE_ADDRESS\" --threads \"$THREADS\"; else exec ./start.sh \"$SHARD\"; fi"]
