(function () {
  function parse(value) {
    try {
      const parsed = JSON.parse(value || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function isActive(promotion, now = new Date()) {
    if (!promotion.active) return false;
    if (promotion.startsAt && new Date(promotion.startsAt) > now) return false;
    if (promotion.endsAt && new Date(`${promotion.endsAt}T23:59:59`) < now) return false;
    return true;
  }

  function matches(product, requirement) {
    if (requirement.matcher === "product") return String(product.id) === String(requirement.value);
    if (requirement.matcher === "category") return product.category === requirement.value;
    if (requirement.matcher === "product_type") return product.product_type === requirement.value;
    return false;
  }

  function allocate(promotion, state, productList) {
    const next = [...state];
    const allocated = [];
    let regularAmount = 0;
    const requirements = [...(promotion.requirements || [])]
      .sort((a, b) => ({ product: 0, product_type: 1, category: 2 }[a.matcher] -
        ({ product: 0, product_type: 1, category: 2 }[b.matcher])));

    for (const requirement of requirements) {
      let needed = Number(requirement.quantity) || 0;
      if (needed <= 0) return null;
      const eligible = productList
        .map((product, index) => ({ product, index }))
        .filter(({ product, index }) => next[index] > 0 && matches(product, requirement))
        .sort((a, b) => Number(b.product.price) - Number(a.product.price) || a.product.id - b.product.id);

      for (const { product, index } of eligible) {
        const used = Math.min(needed, next[index]);
        if (!used) continue;
        next[index] -= used;
        needed -= used;
        regularAmount += Number(product.price) * used;
        allocated.push({ productId: product.id, quantity: used });
        if (!needed) break;
      }
      if (needed > 0) return null;
    }

    const promotionalAmount = Number(promotion.price);
    const saving = regularAmount - promotionalAmount;
    if (saving <= 0) return null;
    return { next, allocated, regularAmount, promotionalAmount, saving };
  }

  function calculate(cart, products, promotions) {
    const productMap = new Map(products.map(product => [String(product.id), product]));
    const counts = new Map();
    cart.forEach(item => counts.set(String(item.id), (counts.get(String(item.id)) || 0) + 1));
    const productList = [...counts.keys()].map(id => productMap.get(id) || cart.find(item => String(item.id) === id));
    const initialState = productList.map(product => counts.get(String(product.id)) || 0);
    const applicable = promotions.filter(promotion => isActive(promotion) && promotion.requirements?.length);
    const memo = new Map();

    function best(state) {
      const key = state.join(",");
      if (memo.has(key)) return memo.get(key);
      let result = { discount: 0, priority: 0, applications: [] };
      for (const promotion of applicable) {
        const allocation = allocate(promotion, state, productList);
        if (!allocation) continue;
        const tail = best(allocation.next);
        const candidate = {
          discount: allocation.saving + tail.discount,
          priority: (Number(promotion.priority) || 0) + tail.priority,
          applications: [{
            id: promotion.id,
            name: promotion.name,
            regularAmount: allocation.regularAmount,
            promotionalAmount: allocation.promotionalAmount,
            saving: allocation.saving,
            allocated: allocation.allocated
          }, ...tail.applications]
        };
        if (candidate.discount > result.discount ||
            (candidate.discount === result.discount && candidate.priority > result.priority)) {
          result = candidate;
        }
      }
      memo.set(key, result);
      return result;
    }

    const plan = best(initialState);
    const grouped = Object.values(plan.applications.reduce((groups, application) => {
      const key = String(application.id);
      if (!groups[key]) groups[key] = { ...application, applications: 0, regularAmount: 0, promotionalAmount: 0, saving: 0, allocated: [] };
      groups[key].applications += 1;
      groups[key].regularAmount += application.regularAmount;
      groups[key].promotionalAmount += application.promotionalAmount;
      groups[key].saving += application.saving;
      groups[key].allocated.push(...application.allocated);
      return groups;
    }, {}));
    const subtotal = cart.reduce((sum, item) => sum + Number(item.price), 0);
    return { subtotal, discount: plan.discount, total: subtotal - plan.discount, applications: grouped };
  }

  window.PromotionEngine = { parse, calculate, isActive };
})();
