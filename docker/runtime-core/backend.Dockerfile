FROM node:25-bookworm-slim@sha256:387eebd0a6a38d7f7ea2201586088765455330038b9601f0a262fb0b86cca20b AS node_runtime

FROM python:3.14.3-slim@sha256:fb83750094b46fd6b8adaa80f66e2302ecbe45d513f6cece637a841e1025b4ca

WORKDIR /workspace

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY --from=node_runtime /usr/local/ /usr/local/

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g worktale@1.3.0

COPY backend/requirements-api.lock.txt backend/requirements-api.lock.txt
RUN pip install --no-cache-dir -r backend/requirements-api.lock.txt

CMD ["python", "backend/api_server.py"]
