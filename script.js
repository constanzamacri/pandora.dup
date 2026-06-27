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

let products = [];
let activeFilter = "todos";
let searchTerm = "";
let cart = [];
let detailProduct = null;
const catalogParams = new URLSearchParams(window.location.search);
const requestedCategory = catalogParams.get("category");
const requestedSearch = catalogParams.get("search");

if (requestedCategory || requestedSearch) {
  document.body.classList.add("catalog-view");
  activeFilter = requestedCategory || "todos";
  searchTerm = requestedSearch || "";
  document.querySelector("[data-catalog-eyebrow]").textContent =
    requestedSearch ? "RESULTADOS DE BÚSQUEDA" : "CATÁLOGO";
  document.querySelector("[data-catalog-title]").textContent =
    requestedSearch
      ? `Resultados para “${requestedSearch}”`
      : requestedCategory === "todos" ? "Todos los productos" : requestedCategory;
  document.querySelector("[data-search-input]").value = searchTerm;
}
try {
  cart = JSON.parse(localStorage.getItem("pandoraCart")) || [];
} catch {
  cart = [];
}
const money = value => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
const grid = document.querySelector("[data-products]");

function renderProducts() {
  const visible = products.filter(product =>
    (activeFilter === "todos" || product.category === activeFilter) &&
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  grid.innerHTML = visible.map(product => `
    <article class="product-card">
      <div class="product-image" data-product-open="${product.id}">
        <img src="${product.image}" alt="${product.name}" loading="lazy">
        ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ""}
        <button class="quick-add" data-add="${product.id}" ${product.stock === 0 ? "disabled" : ""}>
          ${product.stock === 0 ? "SIN STOCK" : "AGREGAR A LA BOLSA +"}
        </button>
      </div>
      <div class="product-info" data-product-open="${product.id}">
        <h3>${product.name}</h3>
        <div class="product-price">${product.old ? `<del>${money(product.old)}</del>` : ""}<span>${money(product.price)}</span></div>
        <div class="transfer">${money(Math.round(product.price * .9))} con transferencia</div>
      </div>
    </article>`).join("");
  document.querySelector("[data-empty]").classList.toggle("visible", visible.length === 0);
}

function showProductImage(url, selectedButton) {
  const image = document.querySelector("[data-product-detail-image]");
  image.src = url;
  document.querySelectorAll("[data-product-thumbnail]").forEach(button =>
    button.classList.toggle("active", button === selectedButton)
  );
}

function openProductDetail(product) {
  detailProduct = product;
  const photos = [...new Set([product.image, ...(product.gallery_urls || [])].filter(Boolean))];
  document.querySelector("[data-product-detail-image]").src = photos[0];
  document.querySelector("[data-product-detail-image]").alt = product.name;
  document.querySelector("[data-product-detail-name]").textContent = product.name;
  document.querySelector("[data-product-detail-category]").textContent = product.category;
  document.querySelector("[data-product-detail-price]").innerHTML =
    `${product.old ? `<del>${money(product.old)}</del>` : ""}<span>${money(product.price)}</span>`;
  document.querySelector("[data-product-detail-transfer]").textContent =
    `${money(Math.round(product.price * .9))} pagando por transferencia`;
  document.querySelector("[data-product-detail-stock]").textContent =
    product.stock > 0 ? `${product.stock} unidades disponibles` : "Sin stock";
  const addButton = document.querySelector("[data-product-detail-add]");
  addButton.disabled = product.stock === 0;
  addButton.firstChild.textContent = product.stock === 0 ? "SIN STOCK " : "AGREGAR AL CARRITO ";
  document.querySelector("[data-product-thumbnails]").innerHTML = photos.map((url, index) => `
    <button type="button" class="${index === 0 ? "active" : ""}" data-product-thumbnail="${url}" aria-label="Ver foto ${index + 1}">
      <img src="${url}" alt="">
    </button>`).join("");
  document.querySelector("[data-product-detail]").classList.add("open");
  document.querySelector("[data-product-detail]").setAttribute("aria-hidden", "false");
  document.querySelector("[data-product-detail-overlay]").classList.add("open");
  document.body.classList.add("no-scroll");
}

function closeProductDetail() {
  document.querySelector("[data-product-detail]").classList.remove("open");
  document.querySelector("[data-product-detail]").setAttribute("aria-hidden", "true");
  document.querySelector("[data-product-detail-overlay]").classList.remove("open");
  document.body.classList.remove("no-scroll");
  detailProduct = null;
}

async function loadStoreData() {
  try {
    const config = await import("./supabase-config.js");
    if (!config.isSupabaseConfigured) return;
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
    const [{ data: remoteProducts, error: productsError }, { data: content, error: contentError }, { data: categories }] =
      await Promise.all([
        client.from("products").select("*").eq("published", true).order("sort_order").order("id"),
        client.from("site_content").select("key,value"),
        client.from("categories").select("*").eq("published", true).order("sort_order")
      ]);
    if (!productsError && remoteProducts?.length) {
      products = remoteProducts.map(product => ({
        ...product,
        old: product.old_price,
        image: product.image_url
      }));
      renderProducts();
    }
    const contentValues = !contentError
      ? Object.fromEntries(content.map(item => [item.key, item.value]))
      : {};
    if (!contentError) {
      content.forEach(item => {
        const element = document.querySelector(`[data-content="${item.key}"]`);
        if (element) element.textContent = item.value;
        const image = document.querySelector(`[data-content-image="${item.key}"]`);
        if (image) {
          image.style.backgroundImage = `url("${item.value}")`;
          const x = contentValues[`${item.key}_position_x`] || 50;
          const y = contentValues[`${item.key}_position_y`] || 50;
          image.style.backgroundPosition = `${x}% ${y}%`;
        }
      });
    }
    if (categories?.length) {
      document.querySelector("[data-category-filters]").innerHTML =
        `<button class="active" data-filter="todos">Todo</button>` +
        categories.map(category => `<button data-filter="${category.id}">${category.name}</button>`).join("");
      document.querySelector("[data-store-categories]").innerHTML = categories.map((category, index) => {
        const imageUrl = category.image_url || contentValues[`category_${index + 1}_image`] || "";
        return `
          <a href="#productos" data-filter-link="${category.id}" class="category"
            ${imageUrl ? `style="background-image:url('${imageUrl}')"` : ""}>
            <span>${category.name}</span>
          </a>`;
      }).join("");
      document.querySelectorAll("[data-filter]").forEach(button =>
        button.addEventListener("click", () => openCategoryView(button.dataset.filter))
      );
      document.querySelectorAll("[data-filter]").forEach(button =>
        button.classList.toggle("active", button.dataset.filter === activeFilter)
      );
      if (requestedCategory) {
        const category = categories.find(item => item.id === requestedCategory);
        if (category) document.querySelector("[data-catalog-title]").textContent = category.name;
      }
    }
  } catch (error) {
    console.warn("No se pudo cargar el catálogo administrable.", error);
  } finally {
    document.body.classList.remove("content-loading");
  }
}

function setFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("active", button.dataset.filter === filter));
  renderProducts();
}

function openCategoryView(category) {
  if (category === "todos") {
    window.location.href = "index.html?category=todos";
    return;
  }
  window.location.href = `index.html?category=${encodeURIComponent(category)}`;
}

function openSearchView() {
  const term = document.querySelector("[data-search-input]").value.trim();
  if (!term) return;
  window.location.href = `index.html?search=${encodeURIComponent(term)}`;
}

function updateCart() {
  document.querySelectorAll("[data-cart-count]").forEach(el => el.textContent = cart.length);
  const items = document.querySelector("[data-cart-items]");
  const grouped = Object.values(cart.reduce((result, item) => {
    const key = String(item.id);
    if (!result[key]) result[key] = { ...item, quantity: 0 };
    result[key].quantity += 1;
    return result;
  }, {}));
  items.innerHTML = grouped.map(item => `
    <article class="cart-item">
      <img src="${item.image || item.image_url}" alt="${item.name}">
      <div class="cart-item-info">
        ${item.badge ? `<span class="cart-item-badge">${item.badge}</span>` : ""}
        <h4>${item.name}</h4>
        <p>${item.category || "Accesorios"}</p>
        <button class="remove-item" type="button" data-remove-product="${item.id}" aria-label="Eliminar ${item.name}">
          <span aria-hidden="true">⌫</span> Eliminar producto
        </button>
      </div>
      <div class="cart-item-actions">
        <strong>${money(item.price * item.quantity)}</strong>
        <div class="quantity-control" aria-label="Cantidad de ${item.name}">
          <button type="button" data-decrease="${item.id}" aria-label="Restar uno">−</button>
          <span>${item.quantity} UN.</span>
          <button type="button" data-increase="${item.id}" aria-label="Sumar uno">+</button>
        </div>
      </div>
    </article>`).join("");
  document.querySelector("[data-cart-empty]").classList.toggle("hidden", cart.length > 0);
  document.querySelector("[data-cart-footer]").classList.toggle("hidden", cart.length === 0);
  const total = cart.reduce((sum, item) => sum + Number(item.price), 0);
  document.querySelector("[data-cart-subtotal]").textContent = money(total);
  document.querySelector("[data-cart-total]").textContent = money(total);
  localStorage.setItem("pandoraCart", JSON.stringify(cart));
}

function toggleCart(open) {
  document.querySelector("[data-cart]").classList.toggle("open", open);
  document.querySelector("[data-overlay]").classList.toggle("open", open);
  document.body.classList.toggle("no-scroll", open);
}

document.addEventListener("click", event => {
  const add = event.target.closest("[data-add]");
  if (add) {
    event.stopPropagation();
    cart.push(products.find(product => product.id === Number(add.dataset.add)));
    updateCart();
    const toast = document.querySelector("[data-toast]");
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1800);
  }
  const decrease = event.target.closest("[data-decrease]");
  if (decrease) {
    const index = cart.findIndex(item => item.id === Number(decrease.dataset.decrease));
    if (index >= 0) cart.splice(index, 1);
    updateCart();
  }
  const increase = event.target.closest("[data-increase]");
  if (increase) {
    const productId = Number(increase.dataset.increase);
    const product = cart.find(item => item.id === productId);
    const quantity = cart.filter(item => item.id === productId).length;
    if (product && (product.stock == null || quantity < product.stock)) cart.push({ ...product });
    updateCart();
  }
  const remove = event.target.closest("[data-remove-product]");
  if (remove) {
    const productId = Number(remove.dataset.removeProduct);
    cart = cart.filter(item => item.id !== productId);
    updateCart();
  }
  const filterLink = event.target.closest("[data-filter-link]");
  if (filterLink) {
    event.preventDefault();
    openCategoryView(filterLink.dataset.filterLink);
  }
  const productOpen = event.target.closest("[data-product-open]");
  if (productOpen && !event.target.closest("[data-add]")) {
    const product = products.find(item => item.id === Number(productOpen.dataset.productOpen));
    if (product) openProductDetail(product);
  }
  const thumbnail = event.target.closest("[data-product-thumbnail]");
  if (thumbnail) showProductImage(thumbnail.dataset.productThumbnail, thumbnail);
});

document.querySelector("[data-product-detail-add]").addEventListener("click", () => {
  if (!detailProduct || detailProduct.stock === 0) return;
  const quantity = cart.filter(item => item.id === detailProduct.id).length;
  if (quantity < detailProduct.stock) {
    cart.push({ ...detailProduct });
    updateCart();
  }
});
document.querySelector("[data-product-detail-close]").addEventListener("click", closeProductDetail);
document.querySelector("[data-product-detail-overlay]").addEventListener("click", closeProductDetail);

document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => openCategoryView(button.dataset.filter)));
document.querySelector("[data-cart-button]").addEventListener("click", () => toggleCart(true));
document.querySelectorAll("[data-cart-close]").forEach(button => button.addEventListener("click", () => toggleCart(false)));
document.querySelector("[data-checkout-start]").addEventListener("click", () => {
  localStorage.setItem("pandoraCart", JSON.stringify(cart));
  window.open("checkout.html", "_blank", "noopener");
});
document.querySelector("[data-clear-cart]").addEventListener("click", () => {
  cart = [];
  updateCart();
});
document.querySelector("[data-overlay]").addEventListener("click", () => toggleCart(false));
document.querySelector("[data-menu-button]").addEventListener("click", () => document.querySelector("[data-nav]").classList.toggle("open"));
const searchPanel = document.querySelector("[data-search-panel]");
const searchButton = document.querySelector("[data-search-button]");
function toggleSearch(open) {
  searchPanel.classList.toggle("open", open);
  searchButton.setAttribute("aria-expanded", String(open));
  if (open) document.querySelector("[data-search-input]").focus();
}
searchButton.addEventListener("click", () => toggleSearch(true));
document.querySelector("[data-search-close]").addEventListener("click", () => toggleSearch(false));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    toggleSearch(false);
    closeProductDetail();
  }
});
document.querySelector("[data-search-submit]").addEventListener("click", openSearchView);
document.querySelector("[data-search-input]").addEventListener("keydown", event => {
  if (event.key === "Enter") openSearchView();
});
document.querySelector("[data-newsletter]").addEventListener("submit", event => {
  event.preventDefault();
  event.currentTarget.reset();
  document.querySelector("[data-newsletter-message]").textContent = "¡Listo! Ya sos parte del Club pandora.dup ♡";
});
window.addEventListener("storage", event => {
  if (event.key === "pandoraCart" && event.newValue === null) {
    cart = [];
    updateCart();
  }
});

renderProducts();
updateCart();
loadStoreData();
