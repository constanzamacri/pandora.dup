const fallbackProducts = [
  { id: 1, name: "Aros Aura", category: "aros", price: 28900, old: 32000, badge: "NUEVO", image: "https://images.unsplash.com/photo-1635767798638-3e25273a8236?auto=format&fit=crop&w=700&q=85" },
  { id: 2, name: "Collar Selene", category: "collares", price: 36500, badge: "MÁS VENDIDO", image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=85" },
  { id: 3, name: "Anillo Nudo", category: "anillos", price: 24400, image: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=700&q=85" },
  { id: 4, name: "Pulsera Siena", category: "pulseras", price: 31900, badge: "NUEVO", image: "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=700&q=85" },
  { id: 5, name: "Aros Lía", category: "aros", price: 22700, image: "https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?auto=format&fit=crop&w=700&q=85" },
  { id: 6, name: "Collar Ambar", category: "collares", price: 39800, old: 43000, badge: "ÚLTIMOS", image: "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=700&q=85" },
  { id: 7, name: "Anillo Cielo", category: "anillos", price: 26900, image: "https://images.unsplash.com/photo-1603561596112-db1d797cc1c5?auto=format&fit=crop&w=700&q=85" },
  { id: 8, name: "Pulsera Roma", category: "pulseras", price: 29500, image: "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=700&q=85" }
];

let products = [...fallbackProducts];
let activeFilter = "todos";
let searchTerm = "";
let cart = [];
const money = value => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
const grid = document.querySelector("[data-products]");

function renderProducts() {
  const visible = products.filter(product =>
    (activeFilter === "todos" || product.category === activeFilter) &&
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  grid.innerHTML = visible.map(product => `
    <article class="product-card">
      <div class="product-image">
        <img src="${product.image}" alt="${product.name}" loading="lazy">
        ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ""}
        <button class="quick-add" data-add="${product.id}" ${product.stock === 0 ? "disabled" : ""}>
          ${product.stock === 0 ? "SIN STOCK" : "AGREGAR A LA BOLSA +"}
        </button>
      </div>
      <div class="product-info">
        <h3>${product.name}</h3>
        <div class="product-price">${product.old ? `<del>${money(product.old)}</del>` : ""}<span>${money(product.price)}</span></div>
        <div class="transfer">${money(Math.round(product.price * .9))} con transferencia</div>
      </div>
    </article>`).join("");
  document.querySelector("[data-empty]").classList.toggle("visible", visible.length === 0);
}

async function loadStoreData() {
  try {
    const config = await import("./supabase-config.js");
    if (!config.isSupabaseConfigured) return;
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
    const [{ data: remoteProducts, error: productsError }, { data: content, error: contentError }] =
      await Promise.all([
        client.from("products").select("*").eq("published", true).order("sort_order").order("id"),
        client.from("site_content").select("key,value")
      ]);
    if (!productsError && remoteProducts?.length) {
      products = remoteProducts.map(product => ({
        ...product,
        old: product.old_price,
        image: product.image_url
      }));
      renderProducts();
    }
    if (!contentError) {
      content.forEach(item => {
        const element = document.querySelector(`[data-content="${item.key}"]`);
        if (element) element.textContent = item.value;
      });
    }
  } catch (error) {
    console.warn("No se pudo cargar el catálogo administrable.", error);
  }
}

function setFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("active", button.dataset.filter === filter));
  renderProducts();
}

function updateCart() {
  document.querySelectorAll("[data-cart-count]").forEach(el => el.textContent = cart.length);
  const items = document.querySelector("[data-cart-items]");
  items.innerHTML = cart.map((item, index) => `
    <div class="cart-item">
      <img src="${item.image}" alt="">
      <div><h4>${item.name}</h4><p>${money(item.price)}</p></div>
      <button data-remove="${index}" aria-label="Quitar ${item.name}">×</button>
    </div>`).join("");
  document.querySelector("[data-cart-empty]").classList.toggle("hidden", cart.length > 0);
  document.querySelector("[data-cart-footer]").classList.toggle("hidden", cart.length === 0);
  document.querySelector("[data-cart-total]").textContent = money(cart.reduce((sum, item) => sum + item.price, 0));
}

function toggleCart(open) {
  document.querySelector("[data-cart]").classList.toggle("open", open);
  document.querySelector("[data-overlay]").classList.toggle("open", open);
  document.body.classList.toggle("no-scroll", open);
}

function showCheckout(show) {
  document.querySelector("[data-cart-items]").classList.toggle("hidden", show);
  document.querySelector("[data-cart-footer]").classList.toggle("hidden", show);
  document.querySelector("[data-checkout-form]").classList.toggle("hidden", !show);
  if (show) {
    document.querySelector("[data-checkout-total]").textContent =
      money(cart.reduce((sum, item) => sum + item.price, 0));
    document.querySelector("#checkout-phone").focus();
  }
}

document.addEventListener("click", event => {
  const add = event.target.closest("[data-add]");
  if (add) {
    cart.push(products.find(product => product.id === Number(add.dataset.add)));
    updateCart();
    const toast = document.querySelector("[data-toast]");
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1800);
  }
  const remove = event.target.closest("[data-remove]");
  if (remove) { cart.splice(Number(remove.dataset.remove), 1); updateCart(); }
  const filterLink = event.target.closest("[data-filter-link]");
  if (filterLink) setFilter(filterLink.dataset.filterLink);
});

document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => setFilter(button.dataset.filter)));
document.querySelector("[data-cart-button]").addEventListener("click", () => toggleCart(true));
document.querySelectorAll("[data-cart-close]").forEach(button => button.addEventListener("click", () => toggleCart(false)));
document.querySelector("[data-checkout-start]").addEventListener("click", () => showCheckout(true));
document.querySelector("[data-checkout-back]").addEventListener("click", () => showCheckout(false));
document.querySelector("[data-checkout-close]").addEventListener("click", () => {
  document.querySelector("[data-checkout-success]").classList.add("hidden");
  document.querySelector("[data-cart-items]").classList.remove("hidden");
  cart = [];
  updateCart();
  toggleCart(false);
});
document.querySelector("[data-checkout-form]").addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const phone = data.get("phone").trim();
  const payment = data.get("payment");
  document.querySelector("[data-checkout-summary]").textContent =
    `Teléfono de contacto: ${phone}. Medio de pago: ${payment}.`;
  event.currentTarget.classList.add("hidden");
  document.querySelector("[data-checkout-success]").classList.remove("hidden");
});
document.querySelector("[data-overlay]").addEventListener("click", () => toggleCart(false));
document.querySelector("[data-menu-button]").addEventListener("click", () => document.querySelector("[data-nav]").classList.toggle("open"));
document.querySelector("[data-search-button]").addEventListener("click", () => document.querySelector("[data-search-panel]").classList.add("open"));
document.querySelector("[data-search-close]").addEventListener("click", () => document.querySelector("[data-search-panel]").classList.remove("open"));
document.querySelector("[data-search-input]").addEventListener("input", event => { searchTerm = event.target.value; renderProducts(); });
document.querySelector("[data-newsletter]").addEventListener("submit", event => {
  event.preventDefault();
  event.currentTarget.reset();
  document.querySelector("[data-newsletter-message]").textContent = "¡Listo! Ya sos parte del Club pandora.dup ♡";
});

renderProducts();
updateCart();
loadStoreData();
