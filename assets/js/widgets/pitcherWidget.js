import {
  escapeHtml
} from "../engine/colorEngine.js";

export function renderPitcherWidget({
  container,
  module
}) {
  if (!container) return;

  if (!module) {
    container.innerHTML = `
      <div class="module-empty">
        Pitcher data unavailable.
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
      class="pitcher-card-link"
      href="${escapeAttribute(
        module.detailsUrl || "#"
      )}"
    >
      <div class="pitcher-card-heading">
        <div>
          <span class="data-label">
            ${escapeHtml(
              module.statusLabel || "STARTER TBD"
            )}
          </span>

          <h2>
            ${escapeHtml(
              module.name || "Starter TBD"
            )}
          </h2>

          <p>
            ${escapeHtml(module.team || "—")}
            · Age ${escapeHtml(module.age ?? "—")}
            · ${escapeHtml(module.handLabel || "Throws —")}
          </p>
        </div>

        <span class="open-data">
          Full data →
        </span>
      </div>

      <div class="table-scroll">
        <table class="data-table pitcher-data-table">
          <thead>
            <tr>
              <th>Metric</th>

              ${module.columns
                .map(column => `
                  <th>
                    ${escapeHtml(column.label)}
                  </th>
                `)
                .join("")}
            </tr>
          </thead>

          <tbody>
            ${
              metrics.length
                ? metrics
                    .map(renderPitcherMetricRow)
                    .join("")
                : renderEmptyRow(
                    module.columns.length + 1
                  )
            }
          </tbody>
        </table>
      </div>
    </a>
  `;
}

function renderPitcherMetricRow(metric) {
  return `
    <tr>
      <th>
        ${escapeHtml(metric.label || "—")}
      </th>

      ${(metric.values || [])
        .map(value => `
          <td class="${escapeHtml(
            value.heatClass || "metric-missing"
          )}">
            ${escapeHtml(value.display || "—")}
          </td>
        `)
        .join("")}
    </tr>
  `;
}

function renderEmptyRow(columnCount) {
  return `
    <tr>
      <td
        class="metric-missing"
        colspan="${columnCount}"
      >
        Data unavailable
      </td>
    </tr>
  `;
}

function escapeAttribute(value) {
  return escapeHtml(value || "#");
}