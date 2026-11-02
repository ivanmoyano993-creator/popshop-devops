import os
import time
from contextlib import asynccontextmanager
from decimal import Decimal

import psycopg
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Histogram,
    generate_latest,
)
from pydantic import BaseModel, Field

from .db import connect, init_db
from .logbuffer import recent, setup_logging

APP_VERSION = os.getenv("APP_VERSION", "1.0")

log = setup_logging()

REQUESTS = Counter(
    "popshop_api_requests_total",
    "Total de peticiones HTTP recibidas por la API.",
    ["method", "path", "status"],
)
LATENCY = Histogram(
    "popshop_api_request_duration_seconds",
    "Latencia de las peticiones HTTP en segundos.",
    ["method", "path"],
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    for attempt in range(1, 31):
        try:
            init_db()
            log.info("Base de datos lista (intento %s).", attempt)
            break
        except psycopg.OperationalError as exc:
            log.warning("BD no disponible (intento %s): %s", attempt, exc)
            time.sleep(2)
    else:
        log.error("No se pudo inicializar la base de datos tras varios intentos.")
    yield


app = FastAPI(title="PopShop API", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def observe(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    REQUESTS.labels(request.method, path, response.status_code).inc()
    LATENCY.labels(request.method, path).observe(elapsed)
    return response


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)
    price: Decimal = Field(default=Decimal("0"), ge=0)
    stock: int = Field(default=0, ge=0)


class Product(ProductIn):
    id: int
    created_at: str


def _serialize(row: dict) -> dict:
    row = dict(row)
    row["price"] = float(row["price"])
    row["created_at"] = row["created_at"].isoformat()
    return row


@app.get("/")
def root():
    return {
        "app": "popshop-api",
        "version": APP_VERSION,
        "endpoints": ["/health", "/metrics", "/logs", "/api/products"],
    }


@app.get("/health")
def health():
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok;")
            cur.fetchone()
        return {"status": "ok", "database": "up"}
    except psycopg.OperationalError as exc:
        log.error("Healthcheck fallido: %s", exc)
        raise HTTPException(status_code=503, detail={"status": "degraded", "database": "down"})


@app.get("/metrics")
def metrics():
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/logs")
def logs(limit: int = 100):
    return {"logs": recent(limit)}


@app.get("/api/products")
def list_products():
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM products ORDER BY id;")
        return [_serialize(r) for r in cur.fetchall()]


@app.post("/api/products", status_code=201)
def create_product(payload: ProductIn):
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO products (name, description, price, stock) "
            "VALUES (%s, %s, %s, %s) RETURNING *;",
            (payload.name, payload.description, payload.price, payload.stock),
        )
        row = cur.fetchone()
        conn.commit()
    log.info("Producto creado id=%s name=%s", row["id"], row["name"])
    return _serialize(row)


@app.get("/api/products/{product_id}")
def get_product(product_id: int):
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM products WHERE id = %s;", (product_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return _serialize(row)


@app.delete("/api/products/{product_id}", status_code=204)
def delete_product(product_id: int):
    with connect() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM products WHERE id = %s RETURNING id;", (product_id,))
        deleted = cur.fetchone()
        conn.commit()
    if not deleted:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    log.info("Producto eliminado id=%s", product_id)
