import os

import psycopg
from psycopg.rows import dict_row


def get_dsn() -> str:
    host = os.getenv("DB_HOST", "db")
    port = os.getenv("DB_PORT", "5432")
    name = os.getenv("DB_NAME", "popshop")
    user = os.getenv("DB_USER", "popshop")
    password = os.getenv("DB_PASSWORD", "popshop")
    return f"host={host} port={port} dbname={name} user={user} password={password}"


def connect() -> psycopg.Connection:
    return psycopg.connect(get_dsn(), row_factory=dict_row, connect_timeout=5)


SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    name        TEXT           NOT NULL,
    description TEXT           NOT NULL DEFAULT '',
    price       NUMERIC(10, 2) NOT NULL DEFAULT 0,
    stock       INTEGER        NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);
"""

SEED = [
    ("Camiseta Pop", "Camiseta 100% algodon edicion pop", 19.90, 120),
    ("Taza Retro", "Taza ceramica estilo retro 350ml", 12.50, 80),
    ("Sticker Pack", "Pack de 10 stickers vinilo", 4.99, 500),
    ("Gorra Classic", "Gorra ajustable bordada", 15.00, 60),
]


def init_db() -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(SCHEMA)
        cur.execute("SELECT COUNT(*) AS n FROM products;")
        if cur.fetchone()["n"] == 0:
            cur.executemany(
                "INSERT INTO products (name, description, price, stock) "
                "VALUES (%s, %s, %s, %s);",
                SEED,
            )
        conn.commit()
