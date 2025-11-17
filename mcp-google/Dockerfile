FROM oven/bun:1
WORKDIR /usr/src/app

COPY package.json .
# Install all dependencies (including dev dependencies needed for build)
RUN bun install --ignore-scripts --no-cache && bun pm cache clean

COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json .
# Build the project (TypeScript compilation)
RUN bun run build

EXPOSE 3000/tcp
# Use http-server script for HTTP wrapper
ENTRYPOINT [ "bun", "run", "http-server" ]