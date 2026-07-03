FROM oven/bun:1
WORKDIR /usr/src/app

# Install npm (needed for build scripts that use npm)
RUN apt-get update && apt-get install -y --no-install-recommends npm && rm -rf /var/lib/apt/lists/*

COPY package.json .
# Install all dependencies (including dev dependencies needed for build)
RUN bun install --ignore-scripts --no-cache && bun pm cache clean

COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json .
# Build index.js, auth-server.js, and http-server.js from source.
RUN node scripts/build.js

EXPOSE 3000/tcp
# Use http-server directly with node (avoids npm dependency)
ENTRYPOINT [ "node", "build/http-server.js" ]