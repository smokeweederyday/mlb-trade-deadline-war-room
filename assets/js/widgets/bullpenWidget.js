import {
  escapeHtml
} from "../engine/colorEngine.js";

export function renderBullpenWidget({
  container,
  module
}) {
  if (!container) return;

  if (!module) {
    container.innerHTML = `
      <div class="module-empty">
        Bullpen data unavailable.
      </div>
    `;

    return;
  }

  const metrics =
    Array.isArray(module.metrics)
      ? module.metrics
      : [];

  container.innerHTML = `
    <a
      class="module-link"
      href="${escapeAttribute(
        module.detailsUrl || "#"
      )}"
    >
      <div class="module-heading compact-heading">
        <div>
          <span class="data-label">
            BULLPEN
          </span>

          <h3>
            ${escapeHtml(
              module.title || "Bullpen"
            )}
          </h3>
        </div>

        <span class="open-data">
          Workload →
        </span>
      </div>

      <div class="matchup-summary-grid bullpen-summary-grid">
        ${
          metrics.length
            ? metrics
                .map(renderBullpenMetric)
                .join("")
            : renderEmptyMetric()
        }
      </div>

      ${
        module.note
          ? `
            <p class="module-note">
              ${escapeHtml(module.note)}
            </p>
          `
          : ""
      }
    </a>
  `;
}

function renderBullpenMetric(metric) {
  return `
    <span class="summary-stat">
      <small>
        ${escapeHtml(
          metric?.label || "—"
        )}
      </small>

      <strong class="${escapeHtml(
        metric?.heatClass ||
        "metric-missing"
      )}">
        ${escapeHtml(
          metric?.display || "—"
        )}
      </strong>
    </span>
  `;
}

function renderEmptyMetric() {
  return `
    <span class="summary-stat">
      <small>Data</small>
      <strong class="metric-missing">
        —
      </strong>
    </span>
  `;
}

function escapeAttribute(value) {
  return escapeHtml(value || "#");
}