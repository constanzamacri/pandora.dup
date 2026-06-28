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
let mixedProducts = [];
let activeFilter = "todos";
let searchTerm = "";
let cart = [];
let detailProduct = null;
let storeClient = null;
let currentUser = null;
let promotions = [];
let storeCategories = [];
const favoriteIds = new Set();
const catalogParams = new URLSearchParams(window.location.search);
const requestedCategory = catalogParams.get("category");
const requestedSearch = catalogParams.get("search");
const requestedFavorites = catalogParams.get("favorites") === "1";
const defaultAnnouncement = "3 CUOTAS SIN INTERÉS\nENVÍOS A TODO EL PAÍS\n10% OFF POR TRANSFERENCIA";
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[character]);

function renderAnnouncement(value) {
  const normalized = value.trim() === "3 CUOTAS SIN INTERÉS" ? defaultAnnouncement : value;
  const messages = normalized.split(/\r?\n/).map(message => message.trim()).filter(Boolean);
  const repeated = [...messages, ...messages];
  document.querySelector("[data-announcement-track]").innerHTML = repeated
    .map(message => `<span>${escapeHtml(message)}</span><i aria-hidden="true">✦</i>`)
    .join("");
}

if (requestedCategory || requestedSearch || requestedFavorites) {
  document.body.classList.add("catalog-view");
  activeFilter = requestedCategory || "todos";
  searchTerm = requestedSearch || "";
  document.querySelector("[data-catalog-eyebrow]").textContent = requestedFavorites
    ? "TU SELECCIÓN"
    : requestedSearch ? "RESULTADOS DE BÚSQUEDA" : "CATÁLOGO";
  document.querySelector("[data-catalog-title]").textContent = requestedFavorites
    ? "Mis favoritos"
    : requestedSearch
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

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function mixProducts(items) {
  const groups = new Map();
  items.forEach(product => {
    if (!groups.has(product.category)) groups.set(product.category, []);
    groups.get(product.category).push(product);
  });
  const categoryGroups = shuffle([...groups.values()]).map(group => shuffle(group));
  const mixed = [];
  while (categoryGroups.some(group => group.length)) {
    categoryGroups.forEach(group => {
      const product = group.shift();
      if (product) mixed.push(product);
    });
  }
  return mixed;
}

function menuHref(item) {
  if (item.target_type === "category") {
    return `index.html?category=${encodeURIComponent(item.target_value)}`;
  }
  if (item.target_type === "section") {
    return item.target_value === "inicio"
      ? "index.html"
      : `index.html#${encodeURIComponent(item.target_value.replace(/^#/, ""))}`;
  }
  if (item.target_type === "page" && /^[a-z0-9][a-z0-9._/-]*(?:[?#].*)?$/i.test(item.target_value) && !item.target_value.includes("..")) {
    return item.target_value;
  }
  if (item.target_type === "external" && /^https?:\/\//i.test(item.target_value)) {
    return item.target_value;
  }
  return "#";
}

function renderMainMenu(menuItems) {
  const categoryLinks = storeCategories.map(category =>
    `<a href="index.html?category=${encodeURIComponent(category.id)}">${escapeHtml(category.name)}</a>`
  ).join("");
  document.querySelector("[data-main-menu]").innerHTML = `
    <a href="index.html#productos">Novedades</a>
    <div class="nav-product-menu">
      <button type="button" data-products-menu aria-expanded="false">Productos <span aria-hidden="true">⌄</span></button>
      <div class="nav-product-dropdown">
        ${categoryLinks}
        <a class="view-all-products" href="index.html?category=todos">Ver todo</a>
      </div>
    </div>
    <a href="index.html#promos">Promos</a>
    <a href="index.html#materiales">Materiales</a>
    <a href="index.html#eventos">Eventos</a>
    <a href="index.html#contacto">Contacto</a>`;
}

function promotionRequirementText(requirement) {
  const labels = {
    base: "brazalete",
    charm: "charm",
    simple: "otro",
    composite: "pulsera"
  };
  if (requirement.matcher === "product_type") {
    return `${requirement.quantity} ${labels[requirement.value] || requirement.value}${requirement.quantity > 1 ? "s" : ""}`;
  }
  if (requirement.matcher === "category") {
    return `${requirement.quantity} de ${requirement.value}`;
  }
  const product = products.find(item => String(item.id) === String(requirement.value));
  return `${requirement.quantity} ${product?.name || "producto"}`;
}

function renderPromotionShowcase() {
  const activePromotions = promotions.filter(promotion => window.PromotionEngine.isActive(promotion));
  const section = document.querySelector("[data-promotions-section]");
  section.classList.toggle("hidden", activePromotions.length === 0);
  document.querySelector("[data-store-promotions]").innerHTML = activePromotions.map(promotion => `
    <article class="promotion-card">
      <h3>${escapeHtml(promotion.name)}</h3>
      <p>${promotion.requirements.map(promotionRequirementText).join(" + ")}</p>
      <strong>${promotion.type === "gift" ? `${escapeHtml(promotion.gift)} de regalo` : money(promotion.price)}</strong>
      <a href="#productos">ELEGIR PRODUCTOS <span>→</span></a>
    </article>`).join("");
}

const normalizeStoreProduct = product => ({
  ...product,
  physical_stock: product.stock,
  stock: Number(product.available_stock),
  old: product.old_price,
  image: product.image_url
});

async function refreshProductAvailability() {
  if (!storeClient) return;
  const { data, error } = await storeClient.rpc("get_store_products");
  if (error) return;
  products = (data || []).map(normalizeStoreProduct);
  mixedProducts = mixProducts(products);
  renderProducts();
  if (detailProduct) {
    const updatedDetail = products.find(product => product.id === detailProduct.id);
    if (updatedDetail) openProductDetail(updatedDetail);
  }
}

async function refreshPublicMenu() {
  if (!storeClient) return;
  const [{ data, error }, { data: categories, error: categoriesError }] = await Promise.all([
    storeClient.from("menu_items").select("*").eq("published", true).order("sort_order").order("id"),
    storeClient.from("categories").select("id,name").eq("published", true).order("sort_order")
  ]);
  if (!error && !categoriesError) {
    storeCategories = categories || [];
    renderMainMenu(data || []);
  }
}

function renderProducts() {
  const source = mixedProducts.length === products.length ? mixedProducts : products;
  const visible = source.filter(product =>
    (activeFilter === "todos" || product.category === activeFilter) &&
    (activeFilter !== "todos" || product.stock > 0) &&
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (!requestedFavorites || favoriteIds.has(product.id))
  ).sort((a, b) => activeFilter === "todos" ? 0 : Number(a.stock === 0) - Number(b.stock === 0));
  grid.innerHTML = visible.map(product => `
    <article class="product-card">
      <div class="product-image" data-product-open="${product.id}">
        <img src="${product.image}" alt="${product.name}" loading="lazy">
        ${product.stock === 0
          ? `<span class="product-badge out-of-stock">SIN STOCK</span>`
          : product.stock <= 2
            ? `<span class="product-badge low-stock">¡QUEDAN POCOS!</span>`
            : product.badge ? `<span class="product-badge">${product.badge}</span>` : ""}
        <button class="favorite-button ${favoriteIds.has(product.id) ? "active" : ""}"
          type="button" data-favorite="${product.id}" aria-label="${favoriteIds.has(product.id) ? "Quitar de" : "Agregar a"} favoritos">
          <span aria-hidden="true">${favoriteIds.has(product.id) ? "♥" : "♡"}</span>
        </button>
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
  grid.scrollLeft = 0;
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
  const stock = Number(product.stock) || 0;
  const stockText = stock === 1 ? "1 unidad disponible" : `${stock} unidades disponibles`;
  document.querySelector("[data-product-detail-stock]").innerHTML = stock === 0
    ? "Sin stock"
    : `${stock <= 2 ? '<span class="low-stock-warning">¡Quedan pocas unidades!</span>' : ""}<span>${stockText}</span>`;
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
    storeClient = client;
    const { data: { session } } = await client.auth.getSession();
    currentUser = session?.user || null;
    if (requestedFavorites && !currentUser) {
      window.location.href = "account.html?v=20260627-15";
      return;
    }
    if (currentUser) {
      const { data: savedFavorites } = await client
        .from("favorites")
        .select("product_id")
        .eq("user_id", currentUser.id);
      (savedFavorites || []).forEach(item => favoriteIds.add(Number(item.product_id)));
    }
    const [
      { data: remoteProducts, error: productsError },
      { data: content, error: contentError },
      { data: categories },
      { data: menuItems, error: menuError }
    ] =
      await Promise.all([
        client.rpc("get_store_products"),
        client.from("site_content").select("key,value"),
        client.from("categories").select("*").eq("published", true).order("sort_order"),
        client.from("menu_items").select("*").eq("published", true).order("sort_order").order("id")
      ]);
    if (!productsError && remoteProducts?.length) {
      products = remoteProducts.map(normalizeStoreProduct);
      mixedProducts = mixProducts(products);
      renderProducts();
    }
    const contentValues = !contentError
      ? Object.fromEntries(content.map(item => [item.key, item.value]))
      : {};
    promotions = window.PromotionEngine.parse(contentValues.promotions_config);
    localStorage.setItem("pandoraPromotions", JSON.stringify(promotions));
    renderPromotionShowcase();
    if (!contentError) {
      content.forEach(item => {
        if (document.body.classList.contains("catalog-view") &&
            ["products_kicker", "products_title"].includes(item.key)) return;
        if (item.key === "announcement") {
          renderAnnouncement(item.value);
          return;
        }
        if (item.key === "hero_button_url") {
          const safeDestination = /^(?:https?:\/\/[^\s]+|#[a-z0-9_-]+|[a-z0-9][a-z0-9._/-]*(?:[?#].*)?)$/i.test(item.value) &&
            !item.value.includes("..");
          if (safeDestination) document.querySelector("[data-hero-button]").href = item.value;
          return;
        }
        if (item.key === "events_button_url") {
          const safeDestination = /^(?:https?:\/\/[^\s]+|#[a-z0-9_-]+|[a-z0-9][a-z0-9._/-]*(?:[?#].*)?)$/i.test(item.value) &&
            !item.value.includes("..");
          if (safeDestination) document.querySelector("[data-events-button]").href = item.value;
          return;
        }
        if (item.key === "contact_button_url") {
          const safeDestination = /^(?:https?:\/\/[^\s]+|#[a-z0-9_-]+|[a-z0-9][a-z0-9._/-]*(?:[?#].*)?)$/i.test(item.value) &&
            !item.value.includes("..");
          if (safeDestination) document.querySelector("[data-contact-button]").href = item.value;
          return;
        }
        if (item.key === "hero_kicker" && item.value.trim().toLocaleUpperCase("es-AR") === "NUEVA COLECCIÓN · 2026") {
          document.querySelector('[data-content="hero_kicker"]').textContent = "LO MÁS NUEVO · 2026";
          return;
        }
        if (item.key === "hero_title" && item.value.includes(",")) {
          const [title, ...subtitleParts] = item.value.split(",");
          document.querySelector('[data-content="hero_title"]').textContent = title.trim();
          document.querySelector('[data-content="hero_subtitle"]').textContent =
            subtitleParts.join(" ").trim().replace(/[.,]$/, "");
          return;
        }
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
      document.querySelectorAll("[data-balanced-lines]").forEach(element => {
        const text = element.textContent.trim();
        const midpoint = Math.floor(text.length / 2);
        const before = text.lastIndexOf(" ", midpoint);
        const after = text.indexOf(" ", midpoint);
        const breakAt = before < 0 ? after : after < 0 || midpoint - before <= after - midpoint ? before : after;
        if (breakAt > 0) {
          element.replaceChildren(text.slice(0, breakAt), document.createElement("br"), text.slice(breakAt + 1));
        }
      });
    }
    if (!menuError) {
      storeCategories = categories || [];
      renderMainMenu(menuItems || []);
    }
    if (categories?.length) {
      const categoryNames = categories.map(category => category.name.toLocaleLowerCase("es-AR"));
      document.querySelector("[data-search-input]").placeholder =
        `Buscar ${categoryNames.slice(0, 3).join(", ")}${categoryNames.length > 3 ? "..." : ""}`;
      document.querySelector("[data-category-filters]").innerHTML =
        `<button class="active" data-filter="todos">Todo</button>` +
        categories.map(category => `<button data-filter="${escapeHtml(category.id)}">${escapeHtml(category.name)}</button>`).join("");
      document.querySelector("[data-store-categories]").innerHTML = categories.map(category => {
        const imageUrl = category.image_url || contentValues[`category_${category.id}_image`] || "";
        return `
          <a href="#productos" data-filter-link="${escapeHtml(category.id)}" class="category"
            ${imageUrl ? `style="background-image:url('${imageUrl}')"` : ""}>
            <span>${escapeHtml(category.name)}</span>
          </a>`;
      }).join("");
      document.querySelectorAll("[data-filter]").forEach(button =>
        button.addEventListener("click", () => setFilter(button.dataset.filter))
      );
      document.querySelectorAll("[data-filter]").forEach(button =>
        button.classList.toggle("active", button.dataset.filter === activeFilter)
      );
      if (requestedCategory) {
        const category = categories.find(item => item.id === requestedCategory);
        if (category) document.querySelector("[data-catalog-title]").textContent = category.name;
      }
    }
    updateCart();
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

function moveCarousel(direction) {
  const card = grid.querySelector(".product-card");
  const distance = card ? card.getBoundingClientRect().width + 18 : grid.clientWidth * 0.8;
  grid.scrollBy({ left: direction * distance, behavior: "smooth" });
}

document.querySelector("[data-carousel-prev]").addEventListener("click", () => moveCarousel(-1));
document.querySelector("[data-carousel-next]").addEventListener("click", () => moveCarousel(1));

function moveCategoryCarousel(direction) {
  const categoryGrid = document.querySelector("[data-store-categories]");
  const category = categoryGrid.querySelector(".category");
  const distance = category ? category.getBoundingClientRect().width + 18 : categoryGrid.clientWidth * 0.8;
  categoryGrid.scrollBy({ left: direction * distance, behavior: "smooth" });
}

document.querySelector("[data-category-prev]").addEventListener("click", () => moveCategoryCarousel(-1));
document.querySelector("[data-category-next]").addEventListener("click", () => moveCategoryCarousel(1));

function movePromotionCarousel(direction) {
  const promotionGrid = document.querySelector("[data-store-promotions]");
  const card = promotionGrid.querySelector(".promotion-card");
  const distance = card ? card.getBoundingClientRect().width + 18 : promotionGrid.clientWidth * 0.8;
  promotionGrid.scrollBy({ left: direction * distance, behavior: "smooth" });
}

document.querySelector("[data-promotion-prev]").addEventListener("click", () => movePromotionCarousel(-1));
document.querySelector("[data-promotion-next]").addEventListener("click", () => movePromotionCarousel(1));

function openCategoryView(category) {
  if (category === "todos") {
    window.location.href = "index.html?category=todos";
    return;
  }
  window.location.href = `index.html?category=${encodeURIComponent(category)}`;
}

document.querySelectorAll("[data-home-logo]").forEach(logo => {
  logo.addEventListener("click", event => {
    const isMainView = !window.location.search;
    if (!isMainView) return;
    event.preventDefault();
    history.replaceState(null, "", window.location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

function openSearchView() {
  const term = document.querySelector("[data-search-input]").value.trim();
  if (!term) return;
  window.location.href = `index.html?search=${encodeURIComponent(term)}`;
}

async function toggleFavorite(productId) {
  if (!currentUser || !storeClient) {
    window.location.href = "account.html?v=20260627-15";
    return;
  }
  if (favoriteIds.has(productId)) {
    const { error } = await storeClient
      .from("favorites")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("product_id", productId);
    if (!error) favoriteIds.delete(productId);
  } else {
    const { error } = await storeClient
      .from("favorites")
      .insert({ user_id: currentUser.id, product_id: productId });
    if (!error) favoriteIds.add(productId);
  }
  renderProducts();
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
    <article class="cart-item" data-cart-product="${item.id}" role="button" tabindex="0"
      aria-label="Ver detalle de ${item.name}">
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
  const pricing = window.PromotionEngine.calculate(cart, products, promotions);
  document.querySelector("[data-cart-promotions]").innerHTML = pricing.applications.map(application => `
    <div class="cart-promotion">
      <strong>✓ Promo: ${escapeHtml(application.name)}${application.applications > 1 ? ` ×${application.applications}` : ""}</strong>
      <span>${application.gift
        ? `Incluye ${escapeHtml(application.gift)} de regalo`
        : `Ahorrás ${money(application.saving)} · Precio promo ${money(application.promotionalAmount)}`}</span>
    </div>`).join("");
  document.querySelector("[data-cart-subtotal]").textContent = money(pricing.subtotal);
  document.querySelector("[data-cart-total]").textContent = money(pricing.total);
  localStorage.setItem("pandoraCart", JSON.stringify(cart));
  localStorage.setItem("pandoraPricing", JSON.stringify(pricing));
}

function toggleCart(open) {
  document.querySelector("[data-cart]").classList.toggle("open", open);
  document.querySelector("[data-overlay]").classList.toggle("open", open);
  document.body.classList.toggle("no-scroll", open);
}

function groupedCartPayload(items) {
  return Object.values(items.reduce((groups, item) => {
    const key = String(item.id);
    if (!groups[key]) groups[key] = { id: item.id, quantity: 0 };
    groups[key].quantity += 1;
    return groups;
  }, {}));
}

function showCartToast(text) {
  const toast = document.querySelector("[data-toast]");
  toast.textContent = text;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

async function tryAddToCart(product) {
  if (!product || Number(product.stock) <= 0) return false;
  const nextCart = [...cart, { ...product }];
  if (storeClient) {
    const { data: hasStock, error } = await storeClient.rpc("validate_cart_stock", {
      p_items: groupedCartPayload(nextCart)
    });
    if (error || !hasStock) {
      showCartToast("No hay stock suficiente para esta combinación");
      return false;
    }
  } else {
    const quantity = nextCart.filter(item => String(item.id) === String(product.id)).length;
    if (quantity > product.stock) return false;
  }
  cart.push({ ...product });
  updateCart();
  showCartToast("Agregado a tu bolsa ♡");
  return true;
}

function openProductFromCart(productId) {
  const product = products.find(item => String(item.id) === String(productId));
  if (!product) return;
  toggleCart(false);
  openProductDetail(product);
}

document.addEventListener("click", async event => {
  const favorite = event.target.closest("[data-favorite]");
  if (favorite) {
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(Number(favorite.dataset.favorite));
    return;
  }
  const add = event.target.closest("[data-add]");
  if (add) {
    event.stopPropagation();
    await tryAddToCart(products.find(product => product.id === Number(add.dataset.add)));
    return;
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
    const product = products.find(item => item.id === productId) || cart.find(item => item.id === productId);
    await tryAddToCart(product);
    return;
  }
  const remove = event.target.closest("[data-remove-product]");
  if (remove) {
    const productId = Number(remove.dataset.removeProduct);
    cart = cart.filter(item => item.id !== productId);
    updateCart();
  }
  const cartProduct = event.target.closest("[data-cart-product]");
  const cartControl = event.target.closest("[data-decrease], [data-increase], [data-remove-product]");
  if (cartProduct && !cartControl) {
    openProductFromCart(cartProduct.dataset.cartProduct);
    return;
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

document.querySelector("[data-product-detail-add]").addEventListener("click", async () => {
  if (!detailProduct || detailProduct.stock === 0) return;
  await tryAddToCart(detailProduct);
});
document.querySelector("[data-product-detail-close]").addEventListener("click", closeProductDetail);
document.querySelector("[data-product-detail-overlay]").addEventListener("click", closeProductDetail);

document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => setFilter(button.dataset.filter)));
document.querySelector("[data-cart-button]").addEventListener("click", async () => {
  await refreshProductAvailability();
  toggleCart(true);
});
document.querySelectorAll("[data-cart-close]").forEach(button => button.addEventListener("click", () => toggleCart(false)));
document.querySelector("[data-checkout-start]").addEventListener("click", () => {
  localStorage.setItem("pandoraCart", JSON.stringify(cart));
  window.open("checkout.html?v=20260628-35", "_blank", "noopener");
});
document.querySelector("[data-clear-cart]").addEventListener("click", () => {
  cart = [];
  updateCart();
});
document.querySelector("[data-overlay]").addEventListener("click", () => toggleCart(false));
document.querySelector("[data-menu-button]").addEventListener("click", () => document.querySelector("[data-nav]").classList.toggle("open"));
document.querySelector("[data-nav]").addEventListener("click", event => {
  const productsButton = event.target.closest("[data-products-menu]");
  if (productsButton) {
    const menu = productsButton.closest(".nav-product-menu");
    const open = menu.classList.toggle("open");
    productsButton.setAttribute("aria-expanded", String(open));
    return;
  }
  const link = event.target.closest("a");
  if (!link) return;
  document.querySelector("[data-nav]").classList.remove("open");
  document.querySelector(".nav-product-menu")?.classList.remove("open");
  if (!link.matches("[data-menu-home]")) return;
  event.preventDefault();
  closeProductDetail();
  toggleCart(false);
  if (window.location.search || !/\/(?:index\.html)?$/i.test(window.location.pathname)) {
    window.location.href = "index.html";
    return;
  }
  history.replaceState(null, "", window.location.pathname);
  window.scrollTo({ top: 0, behavior: "smooth" });
});
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
  const cartProduct = event.target.closest("[data-cart-product]");
  if (cartProduct && event.target === cartProduct && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openProductFromCart(cartProduct.dataset.cartProduct);
    return;
  }
  if (event.key === "Escape") {
    toggleSearch(false);
    closeProductDetail();
  }
});
document.querySelector("[data-search-submit]").addEventListener("click", openSearchView);
document.querySelector("[data-search-input]").addEventListener("keydown", event => {
  if (event.key === "Enter") openSearchView();
});
window.addEventListener("storage", event => {
  if (event.key === "pandoraMenuUpdatedAt") refreshPublicMenu();
  if (event.key === "pandoraProductsUpdatedAt") refreshProductAvailability();
  if (event.key === "pandoraPromotionsUpdatedAt") loadStoreData();
  if (event.key === "pandoraCart" && event.newValue === null) {
    cart = [];
    updateCart();
    refreshProductAvailability();
  }
});
window.addEventListener("focus", refreshProductAvailability);

renderProducts();
updateCart();
loadStoreData();
