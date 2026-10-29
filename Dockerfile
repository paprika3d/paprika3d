# The paprika3d MCP server over stdio, for directories that run a server to list its tools (Glama).
# src/cli.js is bundled with its dependencies, so there is no install step; Chromium is the browser the tools drive.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation && rm -rf /var/lib/apt/lists/*
# a container runs as root, where Chrome needs --no-sandbox
ENV PAPRIKA3D_CHROME=/usr/bin/chromium PAPRIKA3D_CHROME_ARGS=--no-sandbox
WORKDIR /app
COPY . .
ENTRYPOINT ["node", "src/cli.js", "serve"]
