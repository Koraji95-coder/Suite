FROM node:22-bookworm-slim AS node_runtime

FROM python:3.12-slim

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
