FROM node:25-bookworm-slim@sha256:387eebd0a6a38d7f7ea2201586088765455330038b9601f0a262fb0b86cca20b

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci --no-fund --ignore-scripts

CMD ["node", "--version"]
