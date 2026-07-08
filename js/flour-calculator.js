(function () {
  "use strict";

  var RECIPE_INDEX_URL = "./recipes/recipes-index.json";
  var DEFAULT_BANNER_URL = "./banners/bannermain.jpg";

  var recipesMeta = [];
  var currentRecipe = null;
  var currentScaleFactor = 1;
  var currentAmounts = {};
  var activeIngredientId = null;
  var rootEl = null;

  function initFlourCalculator() {
    rootEl = document.getElementById("spajz-flour-calculator");

    if (!rootEl) {
      return;
    }

    renderSkeleton();
    loadRecipeIndex();
  }

  function renderSkeleton() {
    rootEl.innerHTML =
      '<div class="sfc-intro">' +
      '<h2 class="sfc-title">Liszt kalkulátor receptekhez</h2>' +
      '<p class="sfc-lead">Válassz egy receptet, állítsd be a rendelkezésre álló alapanyag mennyiségét és a kalkulátor arányosan újraszámolja az egész receptet.</p>' +
      '<div class="sfc-select-wrap">' +
      '<label class="sfc-select-label" for="sfc-recipe-select">Recept kiválasztása</label>' +
      '<select id="sfc-recipe-select" class="sfc-select"></select>' +
      '</div>' +
      '</div>' +
      '<div id="sfc-error" class="sfc-error" hidden></div>' +
      '<div id="sfc-recipe" class="sfc-recipe" hidden>' +
      '<div id="sfc-banner" class="sfc-banner"></div>' +
      '<div id="sfc-header" class="sfc-header"></div>' +
      '<div id="sfc-yield" class="sfc-yield"></div>' +
      '<div id="sfc-ingredients" class="sfc-ingredients"></div>' +
      '<div id="sfc-notes" class="sfc-notes"></div>' +
      '<div id="sfc-products" class="sfc-products"></div>' +
      '<div id="sfc-cart-notice" class="sfc-cart-notice"></div>' +
      '</div>';

    rootEl.querySelector("#sfc-recipe-select").addEventListener("change", function () {
      var recipeId = this.value;
      var selected = null;
      var i;

      for (i = 0; i < recipesMeta.length; i++) {
        if (recipesMeta[i].id === recipeId) {
          selected = recipesMeta[i];
          break;
        }
      }

      if (selected) {
        loadRecipe(selected);
      }
    });
  }

  function loadRecipeIndex() {
    fetchJson(RECIPE_INDEX_URL)
      .then(function (indexData) {
        if (indexData && indexData.recipes && indexData.recipes.length) {
          recipesMeta = indexData.recipes;
          populateRecipeSelect();

          loadRecipe(recipesMeta[0]);
        } else {
          showError("Nem található receptlista.");
        }
      })
      .catch(function (error) {
        console.error("Receptlista betöltési hiba:", error);
        showError("A receptlista betöltése nem sikerült.");
      });
  }

  function populateRecipeSelect() {
    var select = rootEl.querySelector("#sfc-recipe-select");
    var i;
    var option;

    select.innerHTML = "";

    for (i = 0; i < recipesMeta.length; i++) {
      option = document.createElement("option");
      option.value = recipesMeta[i].id;
      option.textContent = recipesMeta[i].name;
      select.appendChild(option);
    }
  }

  function fetchJson(url) {
    return fetch(url + "?v=" + Date.now())
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status + " – " + url);
        }

        return response.json();
      });
  }

  function loadRecipe(recipeMeta) {
    hideError();

    fetchJson(recipeMeta.file)
      .then(function (recipe) {
        if (!recipe.banner && recipeMeta.banner) {
          recipe.banner = recipeMeta.banner;
        }

        currentRecipe = recipe;
        currentScaleFactor = 1;
        activeIngredientId = null;
        currentAmounts = {};

        var ingredients = getAllIngredients(currentRecipe);
        var i;

        for (i = 0; i < ingredients.length; i++) {
          currentAmounts[ingredients[i].id] = ingredients[i].baseAmount;
        }

        renderRecipe(currentRecipe);
      })
      .catch(function (error) {
        console.error("Recept betöltési hiba:", error);
        showError("A recept betöltése nem sikerült.");
      });
  }

  function getAllIngredients(recipe) {
    var all = [];
    var i;
    var j;

    if (recipe.ingredientGroups && recipe.ingredientGroups.length) {
      for (i = 0; i < recipe.ingredientGroups.length; i++) {
        if (recipe.ingredientGroups[i].ingredients) {
          for (j = 0; j < recipe.ingredientGroups[i].ingredients.length; j++) {
            all.push(recipe.ingredientGroups[i].ingredients[j]);
          }
        }
      }

      return all;
    }

    return recipe.ingredients || [];
  }

  function findIngredientById(recipe, ingredientId) {
    var ingredients = getAllIngredients(recipe);
    var i;

    for (i = 0; i < ingredients.length; i++) {
      if (ingredients[i].id === ingredientId) {
        return ingredients[i];
      }
    }

    return null;
  }

  function formatNumberHu(value) {
    var rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
    var parts = String(rounded).split(".");

    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");

    return parts.length > 1 ? parts[0] + "," + parts[1] : parts[0];
  }

  function formatAmount(value, unit) {
    return formatNumberHu(value) + (unit ? "\u00a0" + unit : "");
  }

  function formatYieldValue(value) {
    return String(Math.round(value * 10) / 10).replace(".", ",");
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function roundForInput(value) {
    return Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function calculateScaleFactor(ingredientId, newValue) {
    var ingredient = findIngredientById(currentRecipe, ingredientId);

    if (!ingredient || !ingredient.baseAmount) {
      return 1;
    }

    return newValue / ingredient.baseAmount;
  }

  function handleIngredientChange(ingredientId, newValue) {
    var value = parseFloat(newValue);

    if (!currentRecipe || isNaN(value) || value <= 0) {
      return;
    }

    activeIngredientId = ingredientId;
    currentScaleFactor = calculateScaleFactor(ingredientId, value);

    updateAllIngredientValues(currentScaleFactor);

    currentAmounts[ingredientId] = value;

    refreshIngredientControls(ingredientId);
    renderYield(currentRecipe, currentScaleFactor);
    renderRecommendedProducts(currentRecipe, currentScaleFactor);
  }

  function updateAllIngredientValues(scaleFactor) {
    var ingredients = getAllIngredients(currentRecipe);
    var i;

    for (i = 0; i < ingredients.length; i++) {
      if (ingredients[i].scalable === false) {
        currentAmounts[ingredients[i].id] = ingredients[i].baseAmount;
      } else {
        currentAmounts[ingredients[i].id] = ingredients[i].baseAmount * scaleFactor;
      }
    }
  }

  function renderRecipe(recipe) {
    rootEl.querySelector("#sfc-recipe").hidden = false;

    renderBanner(recipe);
    renderRecipeHeader(recipe);
    renderYield(recipe, currentScaleFactor);
    renderIngredientControls(recipe);
    renderNotes(recipe);
    renderRecommendedProducts(recipe, currentScaleFactor);
    renderCartNotice(recipe);
  }

  function renderBanner(recipe) {
    var bannerEl = rootEl.querySelector("#sfc-banner");
    var bannerUrl = recipe.banner || DEFAULT_BANNER_URL;

    bannerEl.innerHTML =
      '<img class="sfc-banner-img" src="' + escapeHtml(bannerUrl) + '" alt="' +
      escapeHtml(recipe.name || "Recept") + '" loading="lazy">';

    bannerEl.querySelector("img").onerror = function () {
      this.onerror = null;
      this.src = DEFAULT_BANNER_URL;
    };
  }

  function renderRecipeHeader(recipe) {
    rootEl.querySelector("#sfc-header").innerHTML =
      '<h3 class="sfc-recipe-title">' + escapeHtml(recipe.name || "") + '</h3>' +
      (recipe.subtitle ? '<p class="sfc-recipe-subtitle">' + escapeHtml(recipe.subtitle) + '</p>' : "");
  }

  function renderYield(recipe, scaleFactor) {
    var yieldEl = rootEl.querySelector("#sfc-yield");
    var base;
    var baseText;
    var currentValue;
    var currentText;

    if (!recipe.baseYield) {
      yieldEl.innerHTML = "";
      return;
    }

    base = recipe.baseYield;
    baseText = base.display || (base.amount + " " + (base.label || base.unit || ""));
    currentValue = base.amount * scaleFactor;
    currentText = "kb. " + formatYieldValue(currentValue) + " " + (base.label || base.unit || "");

    yieldEl.innerHTML =
      '<div class="sfc-yield-row"><span class="sfc-yield-label">Alap recept:</span> ' +
      '<span class="sfc-yield-value">' + escapeHtml(baseText) + '</span></div>' +
      '<div class="sfc-yield-row sfc-yield-current"><span class="sfc-yield-label">Jelenlegi mennyiség:</span> ' +
      '<span class="sfc-yield-value">' + escapeHtml(currentText) + '</span></div>';
  }

  function renderIngredientControls(recipe) {
    var wrap = rootEl.querySelector("#sfc-ingredients");
    var ingredients;
    var grid;
    var i;

    wrap.innerHTML = "";

    if (recipe.ingredientGroups && recipe.ingredientGroups.length) {
      for (i = 0; i < recipe.ingredientGroups.length; i++) {
        renderIngredientGroup(wrap, recipe.ingredientGroups[i]);
      }

      return;
    }

    grid = document.createElement("div");
    grid.className = "sfc-ingredient-grid";

    ingredients = getAllIngredients(recipe);

    for (i = 0; i < ingredients.length; i++) {
      grid.appendChild(buildIngredientCard(ingredients[i]));
    }

    wrap.appendChild(grid);
  }

  function renderIngredientGroup(wrap, group) {
    var groupEl = document.createElement("div");
    var title = document.createElement("h4");
    var grid = document.createElement("div");
    var ingredients = group.ingredients || [];
    var i;

    groupEl.className = "sfc-ingredient-group";

    title.className = "sfc-group-title";
    title.textContent = group.title || "";
    groupEl.appendChild(title);

    grid.className = "sfc-ingredient-grid";

    for (i = 0; i < ingredients.length; i++) {
      grid.appendChild(buildIngredientCard(ingredients[i]));
    }

    groupEl.appendChild(grid);
    wrap.appendChild(groupEl);
  }

  function buildIngredientCard(ingredient) {
    var card = document.createElement("div");
    var amount = currentAmounts[ingredient.id] != null ? currentAmounts[ingredient.id] : ingredient.baseAmount;
    var slider = ingredient.slider || {};
    var min = slider.min != null ? slider.min : Math.max(1, Math.round(ingredient.baseAmount * 0.25));
    var max = slider.max != null ? slider.max : Math.round(ingredient.baseAmount * 3);
    var step = slider.step != null ? slider.step : 1;
    var isScalable = ingredient.scalable !== false;
    var numberInput;
    var rangeInput;

    card.className = "sfc-ingredient";
    card.setAttribute("data-ingredient-id", ingredient.id);

    card.innerHTML =
      '<div class="sfc-ingredient-top">' +
      '<span class="sfc-ingredient-name">' + escapeHtml(ingredient.name) +
      (ingredient.optional ? ' <span class="sfc-optional">opcionális</span>' : "") +
      '</span>' +
      '<span class="sfc-adjusted-badge" hidden>ehhez igazítva</span>' +
      '</div>' +
      '<div class="sfc-ingredient-controls">' +
      '<div class="sfc-amount-wrap">' +
      '<input type="number" class="sfc-amount-input" inputmode="decimal" min="0" step="' + step + '" value="' + roundForInput(amount) + '"' +
      (isScalable ? "" : " disabled") + '>' +
      '<span class="sfc-unit">' + escapeHtml(ingredient.unit || "") + '</span>' +
      '</div>' +
      '<input type="range" class="sfc-amount-slider" min="' + min + '" max="' + max + '" step="' + step + '" value="' + clamp(amount, min, max) + '"' +
      (isScalable ? "" : " disabled") + '>' +
      '</div>' +
      (ingredient.note ? '<p class="sfc-ingredient-note">' + escapeHtml(ingredient.note) + '</p>' : "");

    if (isScalable) {
      numberInput = card.querySelector(".sfc-amount-input");
      rangeInput = card.querySelector(".sfc-amount-slider");

      numberInput.oninput = function () {
        handleIngredientChange(ingredient.id, numberInput.value);
      };

      rangeInput.oninput = function () {
        numberInput.value = rangeInput.value;
        handleIngredientChange(ingredient.id, rangeInput.value);
      };
    }

    return card;
  }

  function refreshIngredientControls(sourceIngredientId) {
    var cards = rootEl.querySelectorAll(".sfc-ingredient");
    var i;
    var card;
    var id;
    var numberInput;
    var rangeInput;
    var badge;
    var value;
    var isActive;

    for (i = 0; i < cards.length; i++) {
      card = cards[i];
      id = card.getAttribute("data-ingredient-id");
      numberInput = card.querySelector(".sfc-amount-input");
      rangeInput = card.querySelector(".sfc-amount-slider");
      badge = card.querySelector(".sfc-adjusted-badge");
      value = currentAmounts[id];

      if (id !== sourceIngredientId && numberInput) {
        numberInput.value = roundForInput(value);
      }

      if (rangeInput) {
        rangeInput.value = clamp(value, parseFloat(rangeInput.min), parseFloat(rangeInput.max));
      }

      isActive = id === activeIngredientId;
      card.className = isActive ? "sfc-ingredient sfc-active" : "sfc-ingredient";

      if (badge) {
        badge.hidden = !isActive;
      }
    }
  }

  function renderNotes(recipe) {
    var notesEl = rootEl.querySelector("#sfc-notes");
    var html;
    var i;

    if (!recipe.notes || !recipe.notes.length) {
      notesEl.innerHTML = "";
      notesEl.hidden = true;
      return;
    }

    notesEl.hidden = false;
    html = '<h4 class="sfc-section-title">Jó tudni</h4><ul class="sfc-notes-list">';

    for (i = 0; i < recipe.notes.length; i++) {
      html += "<li>" + escapeHtml(recipe.notes[i]) + "</li>";
    }

    html += "</ul>";
    notesEl.innerHTML = html;
  }

  function renderRecommendedProducts(recipe, scaleFactor) {
    var productsEl = rootEl.querySelector("#sfc-products");
    var products = recipe.recommendedProducts;
    var html;
    var i;

    if (!products || !products.length) {
      productsEl.innerHTML = "";
      productsEl.hidden = true;
      return;
    }

    productsEl.hidden = false;
    html = '<h4 class="sfc-section-title">Ezekre lehet szükséged a recepthez</h4><div class="sfc-product-grid">';

    for (i = 0; i < products.length; i++) {
      html += renderProductCard(recipe, products[i], scaleFactor);
    }

    html += "</div>";
    productsEl.innerHTML = html;
  }

  function renderProductCard(recipe, product, scaleFactor) {
    var name = escapeHtml(product.name || "Termék");
    var url = product.url || "#";
    var buttonLabel = escapeHtml(product.buttonLabel || "Megnézem");
    var amountHtml = "";
    var ingredient;
    var needed;
    var neededPacks;

    if (product.relatedOnly) {
      if (product.customAmountText) {
        amountHtml = '<p class="sfc-product-amount">' + escapeHtml(product.customAmountText) + '</p>';
      }
    } else if (product.neededIngredientId) {
      ingredient = findIngredientById(recipe, product.neededIngredientId);

      if (ingredient) {
        needed = currentAmounts[ingredient.id] != null ? currentAmounts[ingredient.id] : ingredient.baseAmount * scaleFactor;

        amountHtml = '<p class="sfc-product-amount">Szükséges mennyiség: kb. ' + formatAmount(needed, ingredient.unit) + '</p>';

        if (product.packSize) {
          neededPacks = Math.ceil(needed / product.packSize);
          amountHtml += '<p class="sfc-product-packs">Javasolt mennyiség: ' + neededPacks + '\u00a0×\u00a0' + formatAmount(product.packSize, product.packUnit || ingredient.unit) + '</p>';
        }
      }
    }

    return '<div class="sfc-product-card">' +
      (product.image ? '<div class="sfc-product-img-wrap"><img class="sfc-product-img" src="' + escapeHtml(product.image) + '" alt="' + name + '" loading="lazy"></div>' : '<div class="sfc-product-img-wrap"></div>') +
      '<div class="sfc-product-body">' +
      '<p class="sfc-product-name">' + name + '</p>' +
      amountHtml +
      '<a class="sfc-product-btn" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + buttonLabel + '</a>' +
      '</div>' +
      '</div>';
  }

  function renderCartNotice(recipe) {
    var noticeEl = rootEl.querySelector("#sfc-cart-notice");

    if (recipe.cartNotice) {
      noticeEl.hidden = false;
      noticeEl.innerHTML = "<p>" + escapeHtml(recipe.cartNotice) + "</p>";
    } else {
      noticeEl.innerHTML = "";
      noticeEl.hidden = true;
    }
  }

  function showError(message) {
    var errEl = rootEl.querySelector("#sfc-error");
    errEl.textContent = message;
    errEl.hidden = false;
    rootEl.querySelector("#sfc-recipe").hidden = true;
  }

  function hideError() {
    var errEl = rootEl.querySelector("#sfc-error");
    errEl.hidden = true;
    errEl.textContent = "";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFlourCalculator);
  } else {
    initFlourCalculator();
  }
})();
