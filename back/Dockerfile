FROM python:3.10-alpine AS builder

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.10-alpine AS runner

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY app /app/app

EXPOSE 8000

RUN adduser -S -D appuser && chown -R appuser /app

USER appuser

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 CMD [ "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--health-endpoint", "/health"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]