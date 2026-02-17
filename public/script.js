async function loadProducts() {
  try {
    const res = await fetch("/api/products");
    const data = await res.json();

    const container = document.getElementById("products");
    container.innerHTML = "";

    data.forEach((p) => {
      container.innerHTML += `
        <div class="card">
          <img src="${p.image_url}" />
          <h3>${p.name}</h3>
          <p>₹ ${p.price}</p>
          <p>${p.category}</p>
          <a href="/product.html?id=${p.id}">
            <button>View Product</button>
          </a>
        </div>
      `;
    });
  } catch (error) {
    console.error("Error loading products:", error);
  }
}

loadProducts();
async function checkout() {
  const token = localStorage.getItem("token");

  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: {
      "Authorization": token
    }
  });

  const data = await res.json();

  alert(data.message);

  if (data.orderId) {
    window.location.href = "/";
  }
}
