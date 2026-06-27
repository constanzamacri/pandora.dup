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
        <p>${product.category} · ${money(product.price)} · Stock: ${product.stock}</p>
      </div>
      <span class="status ${product.published ? "" : "draft"}">${product.published ? "Publicado" : "Oculto"}</span>
      <button type="button" data-edit-product="${product.id}">EDITAR</button>
    </article>
  `).join("");
  $("[data-products-empty]").classList.toggle("hidden", products.length > 0);
  $("[data-metric-published]").textContent = products.filter(product => product.published).length;
  $("[data-metric-empty]").textContent = products.filter(product => product.stock === 0).length;
  $("[data-metric-stock]").textContent = products.reduce((total, product) => total + product.stock, 0);
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
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("sort_order")
    .order("id");
  if (error) throw error;
  products = data;
  renderProducts();
}

function renderCategories() {
  $("[data-category-list]").innerHTML = categories.map(category => `
    <article class="admin-product">
      <div><h3>${escapeHtml(category.name)}</h3><p>${escapeHtml(category.id)} · Orden ${category.sort_order}</p></div>
      <span class="status ${category.published ? "" : "draft"}">${category.published ? "Publicada" : "Oculta"}</span>
      <button type="button" data-edit-category="${category.id}">EDITAR</button>
    </article>`).join("");
  const select = $("[data-product-form]").elements.category;
  select.innerHTML = categories.map(category =>
    `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("");
}

async function loadCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw error;
  categories = data;
  renderCategories();
}

async function loadContent() {
  const { data, error } = await supabase.from("site_content").select("key,value");
  if (error) throw error;
  const form = $("[data-content-form]");
  data.forEach(item => {
    if (form.elements[item.key]) form.elements[item.key].value = item.value;
  });
  document.querySelectorAll(".photo-field").forEach(updatePhotoPreview);
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
  form.elements.badge.value = product?.badge || "";
  form.elements.price.value = product?.price || "";
  form.elements.old_price.value = product?.old_price || "";
  form.elements.stock.value = product?.stock ?? 0;
  form.elements.sort_order.value = product?.sort_order ?? 0;
  form.elements.image_url.value = product?.image_url || "";
  form.elements.gallery_urls.value = JSON.stringify(product?.gallery_urls || []);
  form.elements.published.checked = product?.published ?? true;
  $("[data-product-form-title]").textContent = product ? "Editar producto" : "Nuevo producto";
  $("[data-delete-product]").classList.toggle("hidden", !product);
  message("[data-product-message]", "");
  $("[data-product-modal]").classList.remove("hidden");
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
      await Promise.all([loadOrders(), loadCategories(), loadProducts(), loadContent()]);
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
    await Promise.all([loadOrders(), loadCategories(), loadProducts(), loadContent()]);
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

$("[data-category-form]").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    let imageUrl = form.elements.image_url.value;
    const categoryImage = editedImages.get(form.elements.image) || form.elements.image.files[0];
    if (categoryImage) imageUrl = await uploadImage(categoryImage, "site");
    const record = {
      id: form.elements.id.value.trim().toLowerCase(),
      name: form.elements.name.value.trim(),
      image_url: imageUrl || null,
      sort_order: Number(form.elements.sort_order.value),
      published: form.elements.published.checked
    };
    const { error } = await supabase.from("categories").upsert(record);
    if (error) throw error;
    editedImages.delete(form.elements.image);
    message("[data-category-message]", "Categoría guardada.");
    form.reset();
    form.elements.id.readOnly = false;
    $("[data-category-form-title]").textContent = "Categorías";
    await loadCategories();
  } catch (error) {
    message("[data-category-message]", error.message, true);
  }
});

$("[data-category-list]").addEventListener("click", event => {
  const button = event.target.closest("[data-edit-category]");
  if (!button) return;
  const category = categories.find(item => item.id === button.dataset.editCategory);
  const form = $("[data-category-form]");
  form.elements.id.value = category.id;
  form.elements.id.readOnly = true;
  form.elements.name.value = category.name;
  form.elements.image_url.value = category.image_url || "";
  form.elements.sort_order.value = category.sort_order;
  form.elements.published.checked = category.published;
  $("[data-category-form-title]").textContent = `Editar ${category.name}`;
  message("[data-category-message]", `Estás editando la categoría ${category.name}.`);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => form.elements.name.focus(), 450);
});

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
      stock: Number(form.elements.stock.value),
      sort_order: Number(form.elements.sort_order.value || 0),
      image_url: imageUrl,
      gallery_urls: galleryUrls,
      published: form.elements.published.checked,
      updated_at: new Date().toISOString()
    };
    const query = id
      ? supabase.from("products").update(record).eq("id", Number(id))
      : supabase.from("products").insert(record);
    const { error } = await query;
    if (error) throw error;
    await loadProducts();
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
  closeProduct();
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
