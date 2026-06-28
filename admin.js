import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured
} from "./supabase-config.js";

const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
}).format(value || 0);

let supabase;
let products = [];
let orders = [];
let categories = [];
let categoriesHaveImageColumn = true;
let menuItems = [];
let promotions = [];
const editedImages = new WeakMap();
let cropState = null;

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
})[character]);

function message(selector, text, error = false) {
  const element = $(selector);
  element.textContent = text;
  element.classList.toggle("error", error);
}

function showLogin() {
  $("[data-login-view]").classList.remove("hidden");
  $("[data-dashboard]").classList.add("hidden");
}

function showDashboard(email) {
  $("[data-login-view]").classList.add("hidden");
  $("[data-dashboard]").classList.remove("hidden");
  $("[data-admin-email]").textContent = email;
}

function renderProducts() {
  const list = $("[data-product-list]");
  list.innerHTML = products.map(product => `
    <article class="admin-product">
      <img src="${product.image_url}" alt="">
      <div>
        <h3>${product.name}</h3>
        <p>${product.category} · ${money(product.price)} · Stock: ${getAdminAvailableStock(product)}${product.product_type === "composite" ? " calculado" : ""}</p>
      </div>
      <span class="status ${product.published ? "" : "draft"}">${product.published ? "Publicado" : "Oculto"}</span>
      <button type="button" data-edit-product="${product.id}">EDITAR</button>
    </article>
  `).join("");
  $("[data-products-empty]").classList.toggle("hidden", products.length > 0);
  $("[data-metric-published]").textContent = products.filter(product => product.published).length;
  $("[data-metric-empty]").textContent = products.filter(product => getAdminAvailableStock(product) === 0).length;
  $("[data-metric-stock]").textContent = products
    .filter(product => product.product_type !== "composite")
    .reduce((total, product) => total + product.stock, 0);
}

function getAdminAvailableStock(product) {
  if (product.product_type !== "composite") return Number(product.stock) || 0;
  if (!product.components?.length) return 0;
  return Math.min(...product.components.map(component => {
    const physicalProduct = products.find(item => item.id === component.component_product_id);
    return Math.floor((Number(physicalProduct?.stock) || 0) / component.quantity);
  }));
}

function renderOrders() {
  const activeOrders = orders.filter(order => ["pending", "contacted"].includes(order.status));
  const labels = { pending: "Sin contactar", contacted: "Contactado", completed: "Completado" };
  $("[data-order-list]").innerHTML = activeOrders.map(order => {
    const items = Array.isArray(order.items) ? order.items : [];
    const phoneLink = String(order.phone).replace(/\D/g, "");
    return `
      <article class="admin-order">
        <div class="order-top">
          <div>
            <h3>${escapeHtml(order.order_number)} · ${escapeHtml(order.customer_name)}</h3>
            <p>${new Date(order.created_at).toLocaleString("es-AR")}</p>
          </div>
          <span class="order-status ${order.status}">${labels[order.status] || order.status}</span>
        </div>
        <div class="order-details">
          <div><span>Teléfono</span><strong>${escapeHtml(order.phone)}</strong></div>
          <div><span>Pago</span><strong>${escapeHtml(order.payment_method)}</strong></div>
          <div><span>Entrega</span><strong>${escapeHtml(order.delivery_method)}</strong></div>
          <div><span>Total</span><strong>${money(order.total)}</strong></div>
        </div>
        <ul class="order-products">
          ${items.map(item => `<li>${escapeHtml(item.name)} × ${Number(item.quantity) || 1}</li>`).join("")}
        </ul>
        <div class="order-actions">
          <a href="https://wa.me/${phoneLink}" target="_blank" rel="noopener">CONTACTAR POR WHATSAPP ↗</a>
          ${order.status === "pending"
            ? `<button class="primary-order-action" type="button" data-order-status="contacted" data-order-id="${order.id}">MARCAR CONTACTADO</button>`
            : ""}
          <button type="button" data-order-status="completed" data-order-id="${order.id}">MARCAR COMPLETADO</button>
        </div>
      </article>
    `;
  }).join("");
  $("[data-orders-empty]").classList.toggle("hidden", activeOrders.length > 0);
  $("[data-metric-pending]").textContent = orders.filter(order => order.status === "pending").length;
  $("[data-metric-contacted]").textContent = orders.filter(order => order.status === "contacted").length;
  $("[data-metric-completed]").textContent = orders.filter(order => order.status === "completed").length;
}

async function loadOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  orders = data;
  renderOrders();
}

async function loadProducts() {
  const [{ data, error }, { data: componentRows, error: componentsError }] = await Promise.all([
    supabase
    .from("products")
    .select("*")
    .order("sort_order")
    .order("id"),
    supabase.from("product_components").select("*")
  ]);
  if (error) throw error;
  if (componentsError) throw componentsError;
  products = (data || []).map(product => ({
    ...product,
    components: (componentRows || []).filter(row => row.composite_product_id === product.id)
  }));
  renderProducts();
}

function renderCategories() {
  $("[data-category-list]").innerHTML = categories.map(category => `
    <article class="admin-product ${category.image_url ? "" : "no-image"}">
      ${category.image_url
        ? `<img src="${escapeHtml(category.image_url)}" alt="Foto de ${escapeHtml(category.name)}">`
        : ""}
      <div><h3>${escapeHtml(category.name)}</h3><p>${escapeHtml(category.id)} · Orden ${category.sort_order}</p></div>
      <span class="status ${category.published ? "" : "draft"}">${category.published ? "Publicada" : "Oculta"}</span>
      <div class="category-actions">
        <button type="button" data-edit-category="${escapeHtml(category.id)}">EDITAR</button>
        <button class="delete-category" type="button" data-delete-category="${escapeHtml(category.id)}">ELIMINAR</button>
      </div>
    </article>`).join("");
  const select = $("[data-product-form]").elements.category;
  select.innerHTML = categories.map(category =>
    `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("");
}

async function loadCategories() {
  const [{ data, error }, { data: categoryImages, error: imagesError }] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("site_content").select("key,value").like("key", "category_%_image")
  ]);
  if (error) throw error;
  if (imagesError) throw imagesError;
  categoriesHaveImageColumn = !data?.length ||
    Object.prototype.hasOwnProperty.call(data[0], "image_url");
  const imageValues = Object.fromEntries((categoryImages || []).map(item => [item.key, item.value]));
  categories = (data || []).map(category => ({
    ...category,
    image_url: category.image_url || imageValues[`category_${category.id}_image`] || null
  }));
  renderCategories();
  updateMenuTargetHelp();
}

const menuTypeLabels = {
  category: "Categoría",
  section: "Sección",
  page: "Página interna",
  external: "Link externo"
};

function renderMenuItems() {
  $("[data-menu-list]").innerHTML = menuItems.map(item => `
    <article class="admin-product">
      <div>
        <h3>${escapeHtml(item.label)}</h3>
        <p>${menuTypeLabels[item.target_type]} · ${escapeHtml(item.target_value)} · Orden ${item.sort_order}</p>
      </div>
      <span class="status ${item.published ? "" : "draft"}">${item.published ? "Activa" : "Oculta"}</span>
      <div class="category-actions">
        <button type="button" data-edit-menu="${item.id}">EDITAR</button>
        <button class="delete-category" type="button" data-delete-menu="${item.id}">ELIMINAR</button>
      </div>
    </article>`).join("");
}

async function loadMenuItems() {
  const { data, error } = await supabase.from("menu_items").select("*").order("sort_order").order("id");
  if (error) throw error;
  menuItems = data || [];
  renderMenuItems();
}

function resetMenuForm() {
  const form = $("[data-menu-form]");
  form.reset();
  form.elements.id.value = "";
  form.elements.published.checked = true;
  $("[data-menu-form-title]").textContent = "Menú principal";
  $("[data-cancel-menu]").classList.add("hidden");
  updateMenuTargetHelp();
}

function updateMenuTargetHelp() {
  const form = $("[data-menu-form]");
  const type = form.elements.target_type.value;
  const help = {
    category: "Elegí el identificador de una categoría.",
    section: "Usá el identificador de sección: inicio, productos, novedades o nosotras.",
    page: "Ingresá la página interna, por ejemplo: account.html.",
    external: "Ingresá el link completo, por ejemplo: https://instagram.com/."
  };
  const options = type === "category"
    ? categories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("")
    : type === "section"
      ? ["inicio", "productos", "novedades", "nosotras"].map(value => `<option value="${value}"></option>`).join("")
      : type === "page"
        ? ["index.html", "account.html", "checkout.html"].map(value => `<option value="${value}"></option>`).join("")
        : "";
  $("[data-menu-target-options]").innerHTML = options;
  $("[data-menu-target-help]").textContent = help[type];
}

function resetCategoryForm() {
  const form = $("[data-category-form]");
  editedImages.delete(form.elements.image);
  form.reset();
  form.elements.original_id.value = "";
  form.elements.image_url.value = "";
  form.elements.published.checked = true;
  $("[data-category-form-title]").textContent = "Categorías";
  $("[data-cancel-category]").classList.add("hidden");
}

async function loadContent() {
  const { data, error } = await supabase.from("site_content").select("key,value");
  if (error) throw error;
  const form = $("[data-content-form]");
  data.forEach(item => {
    if (form.elements[item.key]) form.elements[item.key].value = item.value;
    if (item.key === "promotions_config") {
      try {
        promotions = JSON.parse(item.value) || [];
      } catch {
        promotions = [];
      }
    }
  });
  document.querySelectorAll(".photo-field").forEach(updatePhotoPreview);
  renderPromotions();
  if (!$("[data-promotion-requirements]").children.length) renderPromotionRequirements();
}

function promotionMatcherOptions(matcher, selectedValue = "") {
  const options = matcher === "product"
    ? products.map(product => ({ value: product.id, label: product.name }))
    : matcher === "category"
      ? categories.map(category => ({ value: category.id, label: category.name }))
      : [
          { value: "base", label: "Pulsera sola / base" },
          { value: "charm", label: "Dije / charm" },
          { value: "composite", label: "Pulsera armada" },
          { value: "simple", label: "Producto simple / otro" }
        ];
  return options.map(option =>
    `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(selectedValue) ? "selected" : ""}>${escapeHtml(option.label)}</option>`
  ).join("");
}

function addPromotionRequirement(requirement = {}) {
  const matcher = requirement.matcher || "product_type";
  const row = document.createElement("div");
  row.className = "promotion-requirement-row";
  row.innerHTML = `
    <select data-promotion-matcher>
      <option value="product_type" ${matcher === "product_type" ? "selected" : ""}>Tipo de producto</option>
      <option value="category" ${matcher === "category" ? "selected" : ""}>Categoría</option>
      <option value="product" ${matcher === "product" ? "selected" : ""}>Producto específico</option>
    </select>
    <select data-promotion-value required>${promotionMatcherOptions(matcher, requirement.value)}</select>
    <input data-promotion-quantity type="number" min="1" step="1" value="${requirement.quantity || 1}" aria-label="Cantidad necesaria" required>
    <button type="button" data-remove-promotion-requirement aria-label="Quitar requisito">×</button>`;
  $("[data-promotion-requirements]").append(row);
}

function renderPromotionRequirements(requirements = []) {
  $("[data-promotion-requirements]").innerHTML = "";
  (requirements.length ? requirements : [{}]).forEach(addPromotionRequirement);
}

function renderPromotions() {
  $("[data-promotion-list]").innerHTML = promotions.map(promotion => `
    <article class="admin-product">
      <div><h3>${escapeHtml(promotion.name)}</h3><p>${money(promotion.price)} · ${promotion.requirements.length} requisitos · Prioridad ${promotion.priority || 0}</p></div>
      <span class="status ${promotion.active ? "" : "draft"}">${promotion.active ? "Activa" : "Inactiva"}</span>
      <div class="category-actions">
        <button type="button" data-edit-promotion="${escapeHtml(promotion.id)}">EDITAR</button>
        <button class="delete-category" type="button" data-delete-promotion="${escapeHtml(promotion.id)}">ELIMINAR</button>
      </div>
    </article>`).join("");
}

function resetPromotionForm() {
  const form = $("[data-promotion-form]");
  form.reset();
  form.elements.id.value = "";
  form.elements.active.checked = true;
  $("[data-promotion-form-title]").textContent = "Promociones automáticas";
  $("[data-cancel-promotion]").classList.add("hidden");
  renderPromotionRequirements();
}

async function persistPromotions(messageText) {
  const { error } = await supabase.from("site_content").upsert({
    key: "promotions_config",
    value: JSON.stringify(promotions),
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
  localStorage.setItem("pandoraPromotionsUpdatedAt", String(Date.now()));
  renderPromotions();
  message("[data-promotion-message]", messageText);
}

function updatePhotoPreview(field) {
  const fileInput = field.querySelector('input[type="file"]');
  const key = fileInput.name.replace(/_file$/, "");
  const url = field.dataset.previewUrl || field.querySelector(`input[name="${key}"]`).value;
  let preview = field.querySelector(".photo-preview");
  if (!preview) {
    preview = document.createElement("div");
    preview.className = "photo-preview";
    preview.style.aspectRatio = String(cropRatios[fileInput.name] || 1);
    field.prepend(preview);
  }
  preview.style.backgroundImage = url ? `url("${url}")` : "none";
  preview.style.backgroundPosition =
    `${field.querySelector(`[name="${key}_position_x"]`).value}% ${field.querySelector(`[name="${key}_position_y"]`).value}%`;
}

function openProduct(product = null) {
  const form = $("[data-product-form]");
  form.reset();
  form.elements.id.value = product?.id || "";
  form.elements.name.value = product?.name || "";
  form.elements.category.value = product?.category || "dijes";
  form.elements.product_type.value = product?.product_type || "simple";
  form.elements.badge.value = product?.badge || "";
  form.elements.price.value = product?.price || "";
  form.elements.old_price.value = product?.old_price || "";
  form.elements.stock.value = product?.stock ?? 0;
  form.elements.sort_order.value = product?.sort_order ?? 0;
  form.elements.image_url.value = product?.image_url || "";
  form.elements.gallery_urls.value = JSON.stringify(product?.gallery_urls || []);
  form.elements.published.checked = product?.published ?? true;
  renderComponentRows(product?.components || []);
  updateProductTypeFields();
  $("[data-product-form-title]").textContent = product ? "Editar producto" : "Nuevo producto";
  $("[data-delete-product]").classList.toggle("hidden", !product);
  message("[data-product-message]", "");
  $("[data-product-modal]").classList.remove("hidden");
}

function componentOptions(selectedId = "") {
  const currentId = Number($("[data-product-form]").elements.id.value);
  return products
    .filter(product => ["charm", "base"].includes(product.product_type) && product.id !== currentId)
    .map(product => `<option value="${product.id}" ${String(product.id) === String(selectedId) ? "selected" : ""}>
      ${escapeHtml(product.name)} · ${product.product_type === "base" ? "Pulsera base" : "Dije"} · Stock ${product.stock}
    </option>`).join("");
}

function addComponentRow(component = {}) {
  const row = document.createElement("div");
  row.className = "component-row";
  row.innerHTML = `
    <select data-component-product required>
      <option value="">Elegí un producto</option>
      ${componentOptions(component.component_product_id)}
    </select>
    <input data-component-quantity type="number" min="1" step="1" value="${component.quantity || 1}" aria-label="Cantidad utilizada" required>
    <button type="button" data-remove-component aria-label="Quitar componente">×</button>`;
  $("[data-component-list]").append(row);
}

function renderComponentRows(components) {
  $("[data-component-list]").innerHTML = "";
  components.forEach(addComponentRow);
}

function updateProductTypeFields() {
  const form = $("[data-product-form]");
  const composite = form.elements.product_type.value === "composite";
  $("[data-components-editor]").classList.toggle("hidden", !composite);
  $("[data-product-stock-field]").classList.toggle("hidden", composite);
  form.elements.stock.required = !composite;
  if (composite) form.elements.stock.value = 0;
}

function closeProduct() {
  $("[data-product-modal]").classList.add("hidden");
}

async function uploadImage(file, bucket = "products") {
  const extension = file.name.split(".").pop().toLowerCase();
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

const cropRatios = {
  hero_image_file: 1.25,
  editorial_main_image_file: 0.82,
  editorial_small_image_file: 1.5,
  category_1_image_file: 0.78,
  category_2_image_file: 0.78,
  category_3_image_file: 0.78,
  image: 0.78
};

function drawCrop() {
  if (!cropState) return;
  const canvas = $("[data-crop-canvas]");
  const context = canvas.getContext("2d");
  const { image, ratio } = cropState;
  const outputWidth = ratio >= 1 ? 1200 : Math.round(1200 * ratio);
  const outputHeight = Math.round(outputWidth / ratio);
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const coverScale = Math.max(outputWidth / image.naturalWidth, outputHeight / image.naturalHeight);
  const scale = coverScale * Number($("[data-crop-zoom]").value);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const availableX = Math.max(0, (width - outputWidth) / 2);
  const availableY = Math.max(0, (height - outputHeight) / 2);
  const offsetX = Number($("[data-crop-x]").value) / 100 * availableX;
  const offsetY = Number($("[data-crop-y]").value) / 100 * availableY;

  context.fillStyle = "#f5f1e8";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.drawImage(
    image,
    (outputWidth - width) / 2 + offsetX,
    (outputHeight - height) / 2 + offsetY,
    width,
    height
  );
}

function closeImageEditor(resetInput = false) {
  if (resetInput && cropState?.input) cropState.input.value = "";
  if (cropState?.objectUrl) URL.revokeObjectURL(cropState.objectUrl);
  cropState = null;
  $("[data-image-editor]").classList.add("hidden");
}

function openImageEditor(input, file) {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    cropState = {
      input,
      image,
      objectUrl,
      ratio: cropRatios[input.name] || 1
    };
    $("[data-crop-zoom]").value = "1";
    $("[data-crop-x]").value = "0";
    $("[data-crop-y]").value = "0";
    $("[data-image-editor]").classList.remove("hidden");
    drawCrop();
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    input.value = "";
    alert("No se pudo abrir esa imagen.");
  };
  image.src = objectUrl;
}

document.querySelectorAll('input[type="file"][accept*="image"]:not([data-no-editor])').forEach(input => {
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (file) openImageEditor(input, file);
  });
});
document.querySelectorAll(".photo-field").forEach(field => {
  field.querySelectorAll('input[type="range"]').forEach(control =>
    control.addEventListener("input", () => updatePhotoPreview(field))
  );
});

document.querySelectorAll("[data-crop-zoom],[data-crop-x],[data-crop-y]")
  .forEach(control => control.addEventListener("input", drawCrop));
document.querySelectorAll("[data-image-cancel]")
  .forEach(button => button.addEventListener("click", () => closeImageEditor(true)));
$("[data-image-apply]").addEventListener("click", () => {
  if (!cropState) return;
  const { input } = cropState;
  $("[data-crop-canvas]").toBlob(blob => {
    if (!blob) return;
    const file = new File([blob], `${crypto.randomUUID()}.webp`, { type: "image/webp" });
    editedImages.set(input, file);
    input.closest("label").classList.add("image-ready");
    const photoField = input.closest(".photo-field");
    if (photoField) {
      if (photoField.dataset.previewUrl) URL.revokeObjectURL(photoField.dataset.previewUrl);
      photoField.dataset.previewUrl = URL.createObjectURL(file);
      updatePhotoPreview(photoField);
    }
    closeImageEditor();
  }, "image/webp", 0.9);
});

async function verifyAdmin(user) {
  const { data, error } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) {
    await supabase.auth.signOut();
    throw new Error("Esta cuenta no tiene permisos de administración.");
  }
}

if (!isSupabaseConfigured) {
  $("[data-setup-warning]").classList.remove("hidden");
  $("[data-login-form] button").disabled = true;
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    try {
      await verifyAdmin(session.user);
      showDashboard(session.user.email);
      await Promise.all([loadOrders(), loadCategories(), loadProducts(), loadContent(), loadMenuItems()]);
    } catch (error) {
      showLogin();
      message("[data-login-message]", error.message, true);
    }
  }
}

$("[data-login-form]").addEventListener("submit", async event => {
  event.preventDefault();
  message("[data-login-message]", "Ingresando...");
  const form = new FormData(event.currentTarget);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: form.get("email"),
    password: form.get("password")
  });
  if (error) return message("[data-login-message]", "Correo o contraseña incorrectos.", true);
  try {
    await verifyAdmin(data.user);
    showDashboard(data.user.email);
    await Promise.all([loadOrders(), loadCategories(), loadProducts(), loadContent(), loadMenuItems()]);
  } catch (adminError) {
    message("[data-login-message]", adminError.message, true);
  }
});

$("[data-logout]").addEventListener("click", async () => {
  await supabase.auth.signOut();
  showLogin();
});

document.querySelectorAll("[data-tab]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach(item => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-panel]").forEach(panel =>
      panel.classList.toggle("hidden", panel.dataset.panel !== button.dataset.tab)
    );
  });
});

$("[data-menu-form]").elements.target_type.addEventListener("change", updateMenuTargetHelp);

$("[data-menu-form]").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value;
  const targetType = form.elements.target_type.value;
  const targetValue = form.elements.target_value.value.trim();
  message("[data-menu-message]", "Guardando...");
  try {
    if (targetType === "category" && !categories.some(category => String(category.id) === targetValue)) {
      throw new Error("Elegí una categoría válida.");
    }
    if (targetType === "external" && !/^https?:\/\//i.test(targetValue)) {
      throw new Error("El link externo debe comenzar con http:// o https://.");
    }
    if (targetType === "page" && (!/^[a-z0-9][a-z0-9._/-]*(?:[?#].*)?$/i.test(targetValue) || targetValue.includes(".."))) {
      throw new Error("Ingresá una ruta interna válida.");
    }
    const record = {
      label: form.elements.label.value.trim(),
      target_type: targetType,
      target_value: targetValue.replace(/^#/, ""),
      sort_order: Number(form.elements.sort_order.value),
      published: form.elements.published.checked
    };
    const query = id
      ? supabase.from("menu_items").update(record).eq("id", Number(id))
      : supabase.from("menu_items").insert(record);
    const { data, error } = await query.select("id").single();
    if (error) throw error;
    if (!data) throw new Error("La opción no pudo guardarse.");
    resetMenuForm();
    await loadMenuItems();
    localStorage.setItem("pandoraMenuUpdatedAt", String(Date.now()));
    message("[data-menu-message]", id ? "Opción actualizada." : "Opción agregada.");
  } catch (error) {
    message("[data-menu-message]", error.message, true);
  }
});

$("[data-menu-list]").addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit-menu]");
  const deleteButton = event.target.closest("[data-delete-menu]");
  if (editButton) {
    const item = menuItems.find(menuItem => menuItem.id === Number(editButton.dataset.editMenu));
    if (!item) return loadMenuItems();
    const form = $("[data-menu-form]");
    form.elements.id.value = item.id;
    form.elements.label.value = item.label;
    form.elements.target_type.value = item.target_type;
    form.elements.target_value.value = item.target_value;
    form.elements.sort_order.value = item.sort_order;
    form.elements.published.checked = item.published;
    updateMenuTargetHelp();
    $("[data-menu-form-title]").textContent = `Editar ${item.label}`;
    $("[data-cancel-menu]").classList.remove("hidden");
    message("[data-menu-message]", `Estás editando la opción ${item.label}.`);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (!deleteButton) return;
  const item = menuItems.find(menuItem => menuItem.id === Number(deleteButton.dataset.deleteMenu));
  if (!item || !confirm(`¿Querés eliminar la opción “${item.label}”?`)) return;
  const { error } = await supabase.from("menu_items").delete().eq("id", item.id);
  if (error) return message("[data-menu-message]", error.message, true);
  if ($("[data-menu-form]").elements.id.value === String(item.id)) resetMenuForm();
  await loadMenuItems();
  localStorage.setItem("pandoraMenuUpdatedAt", String(Date.now()));
  message("[data-menu-message]", "Opción eliminada.");
});

$("[data-cancel-menu]").addEventListener("click", () => {
  resetMenuForm();
  message("[data-menu-message]", "");
});

document.querySelectorAll("[data-admin-home-logo]").forEach(logo => {
  logo.addEventListener("click", event => {
    event.preventDefault();
    const firstTab = document.querySelector("[data-tab]");
    if (firstTab && !firstTab.classList.contains("active")) firstTab.click();
    history.replaceState(null, "", window.location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

$("[data-refresh-orders]").addEventListener("click", loadOrders);
$("[data-order-list]").addEventListener("click", async event => {
  const button = event.target.closest("[data-order-status]");
  if (!button) return;
  button.disabled = true;
  const status = button.dataset.orderStatus;
  const update = { status };
  if (status === "contacted") update.contacted_at = new Date().toISOString();
  if (status === "completed") update.completed_at = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update(update)
    .eq("id", Number(button.dataset.orderId));
  if (error) {
    button.disabled = false;
    alert(error.message);
    return;
  }
  await loadOrders();
});

$("[data-new-product]").addEventListener("click", () => openProduct());
$("[data-product-list]").addEventListener("click", event => {
  const button = event.target.closest("[data-edit-product]");
  if (button) openProduct(products.find(product => product.id === Number(button.dataset.editProduct)));
});
document.querySelectorAll("[data-close-product]").forEach(button => button.addEventListener("click", closeProduct));
$("[data-product-form]").elements.product_type.addEventListener("change", () => {
  updateProductTypeFields();
  if ($("[data-product-form]").elements.product_type.value === "composite" &&
      !$("[data-component-list]").children.length) addComponentRow();
});
$("[data-add-component]").addEventListener("click", () => addComponentRow());
$("[data-component-list]").addEventListener("click", event => {
  const button = event.target.closest("[data-remove-component]");
  if (button) button.closest(".component-row").remove();
});

$("[data-category-form]").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  message("[data-category-message]", "Guardando...");
  try {
    let imageUrl = form.elements.image_url.value;
    const categoryImage = editedImages.get(form.elements.image) || form.elements.image.files[0];
    if (categoryImage) imageUrl = await uploadImage(categoryImage, "site");
    const record = {
      id: form.elements.id.value.trim().toLowerCase(),
      name: form.elements.name.value.trim(),
      sort_order: Number(form.elements.sort_order.value),
      published: form.elements.published.checked
    };
    if (categoriesHaveImageColumn) record.image_url = imageUrl || null;
    const originalId = form.elements.original_id.value;
    const query = originalId
      ? supabase.from("categories").update(record).eq("id", originalId)
      : supabase.from("categories").insert(record);
    const { data, error } = await query.select("id").single();
    if (error) throw error;
    if (!data) throw new Error("La categoría no pudo guardarse. Actualizá la lista e intentá nuevamente.");
    if (imageUrl) {
      const { error: imageError } = await supabase.from("site_content").upsert({
        key: `category_${record.id}_image`,
        value: imageUrl,
        updated_at: new Date().toISOString()
      });
      if (imageError) throw imageError;
    }
    resetCategoryForm();
    await Promise.all([loadCategories(), loadProducts()]);
    message("[data-category-message]", originalId ? "Categoría actualizada." : "Categoría creada.");
  } catch (error) {
    message("[data-category-message]", error.message, true);
  }
});

$("[data-category-list]").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-category]");
  const deleteButton = event.target.closest("[data-delete-category]");
  if (deleteButton) {
    deleteCategory(deleteButton.dataset.deleteCategory);
    return;
  }
  if (!editButton) return;
  const categoryId = String(editButton.dataset.editCategory);
  const category = categories.find(item => String(item.id) === categoryId);
  if (!category) {
    message("[data-category-message]", "No se encontró la categoría. La lista se actualizará.", true);
    loadCategories().catch(error => message("[data-category-message]", error.message, true));
    return;
  }
  const form = $("[data-category-form]");
  form.elements.original_id.value = String(category.id);
  form.elements.id.value = category.id;
  form.elements.name.value = category.name;
  form.elements.image_url.value = category.image_url || "";
  form.elements.sort_order.value = category.sort_order;
  form.elements.published.checked = category.published;
  $("[data-category-form-title]").textContent = `Editar ${category.name}`;
  $("[data-cancel-category]").classList.remove("hidden");
  message("[data-category-message]", `Estás editando la categoría ${category.name}.`);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => form.elements.name.focus(), 450);
});

$("[data-cancel-category]").addEventListener("click", () => {
  resetCategoryForm();
  message("[data-category-message]", "");
});

async function deleteCategory(categoryId) {
  const category = categories.find(item => String(item.id) === String(categoryId));
  if (!category || !confirm(`¿Querés eliminar la categoría “${category.name}”?`)) return;
  message("[data-category-message]", "Eliminando...");
  const { error } = await supabase.from("categories").delete().eq("id", category.id);
  if (error) {
    const text = error.code === "23503"
      ? "No se puede eliminar porque tiene productos asociados. Cambiá esos productos de categoría primero."
      : error.message;
    message("[data-category-message]", text, true);
    return;
  }
  if ($("[data-category-form]").elements.original_id.value === String(category.id)) resetCategoryForm();
  await loadCategories();
  message("[data-category-message]", "Categoría eliminada.");
}

$("[data-product-form]").addEventListener("submit", async event => {
  event.preventDefault();
  message("[data-product-message]", "Guardando...");
  const form = event.currentTarget;
  const id = form.elements.id.value;
  try {
    if (!form.elements.category.value ||
        !categories.some(category => category.id === form.elements.category.value)) {
      throw new Error("Elegí una categoría válida para el producto.");
    }
    const productType = form.elements.product_type.value;
    const components = [...$("[data-component-list]").querySelectorAll(".component-row")]
      .map(row => ({
        productId: Number(row.querySelector("[data-component-product]").value),
        quantity: Number(row.querySelector("[data-component-quantity]").value)
      }))
      .filter(component => component.productId);
    if (productType === "composite") {
      if (!components.length) throw new Error("Agregá la pulsera base y los dijes de la composición.");
      if (new Set(components.map(component => component.productId)).size !== components.length) {
        throw new Error("Cada componente debe aparecer una sola vez. Ajustá su cantidad en la misma fila.");
      }
      const selectedProducts = components.map(component =>
        products.find(product => product.id === component.productId)
      );
      if (selectedProducts.filter(product => product?.product_type === "base").length !== 1) {
        throw new Error("La pulsera armada debe usar exactamente una pulsera base.");
      }
      if (selectedProducts.some(product => !product || !["base", "charm"].includes(product.product_type))) {
        throw new Error("La composición solo puede incluir una pulsera base y dijes.");
      }
    }
    let imageUrl = form.elements.image_url.value;
    const productImage = editedImages.get(form.elements.image) || form.elements.image.files[0];
    if (productImage) imageUrl = await uploadImage(productImage);
    if (!imageUrl) throw new Error("Subí una foto o ingresá la URL de una imagen.");
    let galleryUrls = JSON.parse(form.elements.gallery_urls.value || "[]");
    if (form.elements.gallery.files.length) {
      const uploadedGallery = await Promise.all(
        [...form.elements.gallery.files].map(file => uploadImage(file))
      );
      galleryUrls = [...galleryUrls, ...uploadedGallery];
    }
    const record = {
      name: form.elements.name.value.trim(),
      category: form.elements.category.value,
      badge: form.elements.badge.value.trim() || null,
      price: Number(form.elements.price.value),
      old_price: form.elements.old_price.value ? Number(form.elements.old_price.value) : null,
      stock: productType === "composite" ? 0 : Number(form.elements.stock.value),
      product_type: productType,
      sort_order: Number(form.elements.sort_order.value || 0),
      image_url: imageUrl,
      gallery_urls: galleryUrls,
      published: form.elements.published.checked,
      updated_at: new Date().toISOString()
    };
    const query = id
      ? supabase.from("products").update(record).eq("id", Number(id))
      : supabase.from("products").insert(record);
    const { data: savedProduct, error } = await query.select("id").single();
    if (error) throw error;
    const { error: componentsError } = await supabase.rpc("replace_product_components", {
      p_product_id: savedProduct.id,
      p_components: productType === "composite" ? components : []
    });
    if (componentsError) throw componentsError;
    await loadProducts();
    localStorage.setItem("pandoraProductsUpdatedAt", String(Date.now()));
    closeProduct();
  } catch (error) {
    message("[data-product-message]", error.message, true);
  }
});

$("[data-delete-product]").addEventListener("click", async () => {
  const id = Number($("[data-product-form]").elements.id.value);
  if (!id || !confirm("¿Querés eliminar este producto definitivamente?")) return;
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return message("[data-product-message]", error.message, true);
  await loadProducts();
  localStorage.setItem("pandoraProductsUpdatedAt", String(Date.now()));
  closeProduct();
});

$("[data-add-promotion-requirement]").addEventListener("click", () => addPromotionRequirement());
$("[data-promotion-requirements]").addEventListener("change", event => {
  const matcher = event.target.closest("[data-promotion-matcher]");
  if (!matcher) return;
  const row = matcher.closest(".promotion-requirement-row");
  row.querySelector("[data-promotion-value]").innerHTML = promotionMatcherOptions(matcher.value);
});
$("[data-promotion-requirements]").addEventListener("click", event => {
  const button = event.target.closest("[data-remove-promotion-requirement]");
  if (button) button.closest(".promotion-requirement-row").remove();
});

$("[data-promotion-form]").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const requirements = [...form.querySelectorAll(".promotion-requirement-row")].map(row => ({
    matcher: row.querySelector("[data-promotion-matcher]").value,
    value: row.querySelector("[data-promotion-value]").value,
    quantity: Number(row.querySelector("[data-promotion-quantity]").value)
  })).filter(requirement => requirement.value && requirement.quantity > 0);
  if (!requirements.length) return message("[data-promotion-message]", "Agregá al menos un requisito.", true);
  const promotion = {
    id: form.elements.id.value || crypto.randomUUID(),
    name: form.elements.name.value.trim(),
    price: Number(form.elements.price.value),
    priority: Number(form.elements.priority.value || 0),
    startsAt: form.elements.starts_at.value || null,
    endsAt: form.elements.ends_at.value || null,
    active: form.elements.active.checked,
    requirements
  };
  const index = promotions.findIndex(item => item.id === promotion.id);
  if (index >= 0) promotions[index] = promotion;
  else promotions.push(promotion);
  try {
    await persistPromotions(index >= 0 ? "Promoción actualizada." : "Promoción creada.");
    resetPromotionForm();
  } catch (error) {
    message("[data-promotion-message]", error.message, true);
  }
});

$("[data-promotion-list]").addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit-promotion]");
  const deleteButton = event.target.closest("[data-delete-promotion]");
  if (editButton) {
    const promotion = promotions.find(item => item.id === editButton.dataset.editPromotion);
    if (!promotion) return;
    const form = $("[data-promotion-form]");
    form.elements.id.value = promotion.id;
    form.elements.name.value = promotion.name;
    form.elements.price.value = promotion.price;
    form.elements.priority.value = promotion.priority || 0;
    form.elements.starts_at.value = promotion.startsAt || "";
    form.elements.ends_at.value = promotion.endsAt || "";
    form.elements.active.checked = promotion.active;
    renderPromotionRequirements(promotion.requirements);
    $("[data-promotion-form-title]").textContent = `Editar ${promotion.name}`;
    $("[data-cancel-promotion]").classList.remove("hidden");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (!deleteButton) return;
  const promotion = promotions.find(item => item.id === deleteButton.dataset.deletePromotion);
  if (!promotion || !confirm(`¿Querés eliminar la promoción “${promotion.name}”?`)) return;
  promotions = promotions.filter(item => item.id !== promotion.id);
  try {
    await persistPromotions("Promoción eliminada.");
    resetPromotionForm();
  } catch (error) {
    message("[data-promotion-message]", error.message, true);
  }
});

$("[data-cancel-promotion]").addEventListener("click", () => {
  resetPromotionForm();
  message("[data-promotion-message]", "");
});

$("[data-content-form]").addEventListener("submit", async event => {
  event.preventDefault();
  message("[data-content-message]", "Guardando...");
  const form = event.currentTarget;
  const imageKeys = ["hero_image","editorial_main_image","editorial_small_image","category_1_image","category_2_image","category_3_image"];
  try {
    for (const key of imageKeys) {
      const input = form.elements[`${key}_file`];
      const file = editedImages.get(input) || input.files[0];
      if (file) form.elements[key].value = await uploadImage(file, "site");
    }
  } catch (error) {
    return message("[data-content-message]", error.message, true);
  }
  const records = [...form.elements]
    .filter(element => element.name && !element.name.endsWith("_file") && element.type !== "submit")
    .map(element => ({ key: element.name, value: element.value.trim() }));
  const { error } = await supabase.from("site_content").upsert(records);
  message(
    "[data-content-message]",
    error ? error.message : "Los textos fueron actualizados.",
    Boolean(error)
  );
});
