# Scribe (@spytech/scribe) HTTP service — same pattern as build-ai `docker/scribe.dockerfile`.
FROM node:22-bookworm-slim

WORKDIR /app

RUN npm init -y \
  && npm install @spytech/scribe@1.0.7

EXPOSE 1337

CMD ["node", "node_modules/@spytech/scribe/dist/scribe.cli.js", "-p", "1337"]
