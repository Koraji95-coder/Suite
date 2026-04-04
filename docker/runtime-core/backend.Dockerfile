FROM node:24-bookworm-slim@sha256:06e5c9f86bfa0aaa7163cf37a5eaa8805f16b9acb48e3f85645b09d459fc2a9f AS node_runtime

RUN npm install -g npm@11.12.1 \
    && mkdir -p /tmp/npm-runtime-fix \
    && cd /tmp/npm-runtime-fix \
    && npm pack picomatch@4.0.4 \
    && npm pack brace-expansion@5.0.5 \
    && rm -rf /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch \
    && rm -rf /usr/local/lib/node_modules/npm/node_modules/brace-expansion \
    && tar -xzf picomatch-4.0.4.tgz \
    && mv package /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch \
    && mkdir -p /tmp/npm-runtime-fix/brace-expansion \
    && tar -xzf brace-expansion-5.0.5.tgz -C /tmp/npm-runtime-fix/brace-expansion \
    && mv /tmp/npm-runtime-fix/brace-expansion/package /usr/local/lib/node_modules/npm/node_modules/brace-expansion \
    && rm -rf /tmp/npm-runtime-fix

FROM python:3.14.3-slim@sha256:fb83750094b46fd6b8adaa80f66e2302ecbe45d513f6cece637a841e1025b4ca

WORKDIR /workspace

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY --from=node_runtime /usr/local/ /usr/local/

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates build-essential \
    && npm install -g worktale@1.3.0 \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements-api.lock.txt backend/requirements-api.lock.txt
RUN pip install --no-cache-dir -r backend/requirements-api.lock.txt

CMD ["python", "backend/api_server.py"]
