FROM node:22-bookworm-slim

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci --no-fund --ignore-scripts

CMD ["node", "--version"]
