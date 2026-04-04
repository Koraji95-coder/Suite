FROM node:24-bookworm-slim@sha256:06e5c9f86bfa0aaa7163cf37a5eaa8805f16b9acb48e3f85645b09d459fc2a9f

WORKDIR /workspace

RUN npm install -g npm@11.12.1 \
    && mkdir -p /tmp/npm-runtime-fix \
    && cd /tmp/npm-runtime-fix \
    && npm pack picomatch@4.0.4 \
    && rm -rf /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch \
    && tar -xzf picomatch-4.0.4.tgz \
    && mv package /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch \
    && rm -rf /tmp/npm-runtime-fix

COPY package.json package-lock.json ./
RUN npm ci --no-fund --ignore-scripts

CMD ["node", "--version"]
