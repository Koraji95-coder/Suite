FROM python:3.12-slim

WORKDIR /workspace

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY backend/requirements-api.lock.txt backend/requirements-api.lock.txt
RUN pip install --no-cache-dir -r backend/requirements-api.lock.txt

CMD ["python", "backend/api_server.py"]
