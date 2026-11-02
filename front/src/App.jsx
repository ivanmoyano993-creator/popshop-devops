import { useEffect, useMemo, useState } from "react";
import { apiBase, apiTarget, hostname, hostIp } from "./config.js";

const API = apiBase();
const TARGET = apiTarget();
const HOSTNAME = hostname();
const HOST_IP = hostIp();

const money = (n) => `$${Number(n).toFixed(2)}`;

export default function App() {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ name: "", description: "", price: "", stock: "" });

  async function load() {
    try {
      const res = await fetch(`${API}/products`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setProducts(await res.json());
      setStatus("");
    } catch (err) {
      setStatus(`No se pudo conectar con el API (${API}): ${err.message}`);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addProduct(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          price: Number(form.price || 0),
          stock: Number(form.stock || 0),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setForm({ name: "", description: "", price: "", stock: "" });
      load();
    } catch (err) {
      setStatus(`Error creando producto: ${err.message}`);
    }
  }

  async function remove(id) {
    await fetch(`${API}/products/${id}`, { method: "DELETE" });
    load();
  }

  const stats = useMemo(() => {
    const count = products.length;
    const inventory = products.reduce((a, p) => a + p.price * p.stock, 0);
    const avg = count ? products.reduce((a, p) => a + p.price, 0) / count : 0;
    const stock = products.reduce((a, p) => a + p.stock, 0);
    return { count, inventory, avg, stock };
  }, [products]);

  const featured = useMemo(
    () => products.reduce((best, p) => (!best || p.price > best.price ? p : best), null),
    [products]
  );

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <div className="brand">PopShop</div>
          <div className="header-actions">
            <nav>
              <a className="active" href="#inicio">Inicio</a>
              <a href="#catalogo">Productos</a>
              <a href="/metrics" target="_blank" rel="noreferrer">Metrics</a>
              <a href="/logs" target="_blank" rel="noreferrer">Logs</a>
            </nav>
          </div>
        </div>
      </header>

      <main className="container" id="inicio">
        {status && <p className="status">{status}</p>}

        <section className="hero">
          <div>
            <p className="hero-kicker">Tienda demo · FastAPI + PostgreSQL 18</p>
            <h1>Bienvenido a PopShop</h1>
            <p className="muted">
              Panel con métricas en vivo y catálogo servido desde el API por DNS interno.
            </p>
          </div>
          <div className="deploy-badge">
            <span>API ({API})</span>
            <strong>{TARGET}</strong>
          </div>
        </section>

        <div className="stat-row">
          <article className="stat-card">
            <p className="stat-label">Productos</p>
            <p className="stat">{stats.count}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Valor inventario</p>
            <p className="stat stat-text">{money(stats.inventory)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Precio medio</p>
            <p className="stat stat-text">{money(stats.avg)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Stock total</p>
            <p className="stat">{stats.stock}</p>
          </article>
        </div>

        <div className="split-grid">
          <section className="card featured">
            <p className="card-kicker">Producto destacado</p>
            {featured ? (
              <>
                <h2>{featured.name}</h2>
                <p className="muted">{featured.description || "Sin descripción"}</p>
                <div className="featured-meta">
                  <span className="price">{money(featured.price)}</span>
                  <span className={`badge ${featured.stock > 0 ? "ok" : "warn"}`}>
                    {featured.stock > 0 ? `${featured.stock} en stock` : "Agotado"}
                  </span>
                </div>
              </>
            ) : (
              <p className="muted">Aún no hay productos.</p>
            )}
          </section>

          <section className="card">
            <p className="card-kicker">Nuevo producto</p>
            <form onSubmit={addProduct}>
              <div className="form-grid">
                <div className="full">
                  <label>Nombre</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="full">
                  <label>Descripción</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div>
                  <label>Precio</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div>
                  <label>Stock</label>
                  <input
                    type="number"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  />
                </div>
                <div className="full">
                  <button type="submit">Agregar producto</button>
                </div>
              </div>
            </form>
          </section>
        </div>

        <section className="panel" id="catalogo">
          <div className="panel-head">
            <h2>Catálogo</h2>
            <span className="muted">{stats.count} productos en la base de datos</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Precio</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.name}</td>
                  <td className="muted">{p.description}</td>
                  <td>{money(p.price)}</td>
                  <td>
                    <span className={`badge ${p.stock > 0 ? "ok" : "warn"}`}>{p.stock}</span>
                  </td>
                  <td>
                    <button className="link-btn" onClick={() => remove(p.id)}>
                      eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <p className="footer-copy">PopShop · FastAPI + React + Docker · Curso Kubernetes</p>
            <p className="host-info">
              host: <strong>{HOSTNAME}</strong> · IP: <strong>{HOST_IP}</strong>
            </p>
          </div>
          <aside className="skool-cta">
            <p>¿Practicando este proyecto? Compártelo en la comunidad.</p>
            <a
              className="skool-cta-btn"
              href="https://www.skool.com/jemjaf"
              target="_blank"
              rel="noopener noreferrer"
            >
              Publicar en Skool →
            </a>
          </aside>
        </div>
      </footer>
    </>
  );
}
