# Scribe (@thoughtpivot/scribe) HTTP service for local Compose.
FROM node:22-bookworm-slim

WORKDIR /app

RUN npm init -y \
  && npm install @thoughtpivot/scribe@1.0.8

EXPOSE 1337

CMD ["node", "node_modules/@thoughtpivot/scribe/dist/scribe.cli.js", "-p", "1337"]
