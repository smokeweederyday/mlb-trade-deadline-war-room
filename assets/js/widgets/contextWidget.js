import {
  escapeHtml
} from "../engine/colorEngine.js";

export function renderContextWidget({
  container,
  context
}) {
  if (!container) return;

  if (!context) {
    container.innerHTML = `
      <div class="context-empty">
        Context data unavailable.
      </div>
    `;
    return;
  }

  const alerts = Array.isArray(context.alerts)
    ? context.alerts
    : [];

  const positives = Array.isArray(context.positives)
    ? context.positives
    : [];

  const information = Array.isArray(context.information)
    ? context.information
    : [];

  container.innerHTML = `
    <div class="context-header">
      <div>
        <p class="kicker">CONTEXT</p>
        <h2>${escapeHtml(context.label || "MIXED")}</h2>
      </div>

      <div class="context-score">
        <strong>${escapeHtml(context.score ?? "—")}</strong>
        <span>/100</span>
      </div>
    </div>

    <div class="context-columns">
      ${renderContextGroup(
        "Alerts",
        alerts,
        "No major alerts."
      )}

      ${renderContextGroup(
        "Positive Conditions",
        positives,
        "No positive conditions identified."
      )}

      ${renderContextGroup(
        "Information",
        information,
        "No additional context available."
      )}
    </div>

    <div class="context-future-sources">
      ${renderFutureSource(
        "Travel",
        context.sources?.travel
      )}

      ${renderFutureSource(
        "Trade Deadline",
        context.sources?.trade_deadline
      )}

      ${renderFutureSource(
        "Standings",
        context.sources?.standings
      )}

      ${renderFutureSource(
        "Streaks",
        context.sources?.streaks
      )}

      ${renderFutureSource(
        "Injuries",
        context.sources?.injuries
      )}
    </div>
  `;
}

function renderContextGroup(
  title,
  items,
  emptyMessage
) {
  const body = items.length
    ? items
        .map(item => `
          <article class="context-item context-${escapeHtml(
            item.level || "info"
          )}">
            <strong>
              ${escapeHtml(
                item.title || "Context"
              )}
            </strong>

            <p>
              ${escapeHtml(
                item.summary || ""
              )}
            </p>
          </article>
        `)
        .join("")
    : `
        <p class="context-group-empty">
          ${escapeHtml(emptyMessage)}
        </p>
      `;

  return `
    <section class="context-group">
      <h3>${escapeHtml(title)}</h3>
      <div class="context-list">
        ${body}
      </div>
    </section>
  `;
}

function renderFutureSource(
  label,
  active
) {
  return `
    <span class="${
      active
        ? "context-source-active"
        : "context-source-backlog"
    }">
      ${escapeHtml(label)}
      ·
      ${active ? "LIVE" : "BACKLOG"}
    </span>
  `;
}
