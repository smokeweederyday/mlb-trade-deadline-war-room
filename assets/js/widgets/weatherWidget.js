import {
  escapeHtml
} from "../engine/colorEngine.js";

export function renderWeatherWidget({
  container,
  module
}) {
  if (!container) return;

  if (!module) {
    container.innerHTML = `
      <div class="module-empty">
        Weather data unavailable.
      </div>
    `;

    return;
  }

  container.href =
    module.detailsUrl || "#";

  container.innerHTML = `
    <p class="kicker">
      WEATHER
    </p>

    <h3>
      ${escapeHtml(
        module.headline || "Conditions pending"
      )}
    </h3>

    <p>
      ${escapeHtml(
        module.summary || "Weather data pending"
      )}
    </p>
  `;
}