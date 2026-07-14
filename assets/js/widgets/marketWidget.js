import {
  escapeHtml
} from "../engine/colorEngine.js";

export function renderMarketWidget({
  container,
  module
}) {
  if (!container) return;

  if (!module) {
    container.innerHTML = `
      <div class="module-empty">
        Market data unavailable.
      </div>
    `;

    return;
  }

  container.href =
    module.detailsUrl || "#";

  container.innerHTML = `
    <p class="kicker">
      MARKET
    </p>

    <h3>
      ${escapeHtml(
        module.headline || "Market pending"
      )}
    </h3>

    <p>
      ${escapeHtml(
        module.summary || "Prices pending"
      )}
    </p>
  `;
}