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

async function loadContent() {
  const { data, error } = await supabase.from("site_content").select("key,value");
  if (error) throw error;
  const form = $("[data-content-form]");
  data.forEach(item => {
    if (form.elements[item.key]) form.elements[item.key].value = item.value;
  });
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
  form.elements.published.checked = product?.published ?? true;
  $("[data-product-form-title]").textContent = product ? "Editar producto" : "Nuevo producto";
  $("[data-delete-product]").classList.toggle("hidden", !product);
  message("[data-product-message]", "");
  $("[data-product-modal]").classList.remove("hidden");
}

function closeProduct() {
  $("[data-product-modal]").classList.add("hidden");
}

async function uploadImage(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("products").upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });
  if (error) throw error;
  return supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
}

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
      await Promise.all([loadProducts(), loadContent()]);
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
    await Promise.all([loadProducts(), loadContent()]);
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

$("[data-new-product]").addEventListener("click", () => openProduct());
$("[data-product-list]").addEventListener("click", event => {
  const button = event.target.closest("[data-edit-product]");
  if (button) openProduct(products.find(product => product.id === Number(button.dataset.editProduct)));
});
document.querySelectorAll("[data-close-product]").forEach(button => button.addEventListener("click", closeProduct));

$("[data-product-form]").addEventListener("submit", async event => {
  event.preventDefault();
  message("[data-product-message]", "Guardando...");
  const form = event.currentTarget;
  const id = form.elements.id.value;
  try {
    let imageUrl = form.elements.image_url.value;
    if (form.elements.image.files[0]) imageUrl = await uploadImage(form.elements.image.files[0]);
    if (!imageUrl) throw new Error("Subí una foto o ingresá la URL de una imagen.");
    const record = {
      name: form.elements.name.value.trim(),
      category: form.elements.category.value,
      badge: form.elements.badge.value.trim() || null,
      price: Number(form.elements.price.value),
      old_price: form.elements.old_price.value ? Number(form.elements.old_price.value) : null,
      stock: Number(form.elements.stock.value),
      sort_order: Number(form.elements.sort_order.value || 0),
      image_url: imageUrl,
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
  const values = new FormData(event.currentTarget);
  const records = [...values.entries()].map(([key, value]) => ({ key, value: value.trim() }));
  const { error } = await supabase.from("site_content").upsert(records);
  message(
    "[data-content-message]",
    error ? error.message : "Los textos fueron actualizados.",
    Boolean(error)
  );
});
