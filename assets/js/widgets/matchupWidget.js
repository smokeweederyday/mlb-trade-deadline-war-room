import {
  escapeHtml
} from "../engine/colorEngine.js";

export function renderMatchupWidget({
  container,
  module
}) {
  if (!container) return;

  if (!module) {
    container.innerHTML = `
      <div class="module-empty">
        Matchup data unavailable.
      </div>
    `;

    return;
  }

  const metrics =
    Array.isArray(module.metrics)
      ? module.metrics
      : [];

  container.innerHTML = `
    <button
      class="module-button"
      type="button"
    >
      <div class="module-heading compact-heading">
        <div>
          <span class="data-label">
            PITCHER VS PROJECTED LINEUP
          </span>

          <h3>
            ${escapeHtml(
              module.title || "Starter vs Opponent"
            )}
          </h3>
        </div>

        <span class="open-data">
          Batter detail →
        </span>
      </div>

      <div class="matchup-summary-grid">
        ${
          metrics.length
            ? metrics
                .map(renderMatchupMetric)
                .join("")
            : renderEmptyMetric()
        }
      </div>
    </button>
  `;
}

function renderMatchupMetric(metric) {
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