import {
  escapeHtml
} from "../engine/colorEngine.js";

export function renderPitcherWidget({
  container,
  module,
  onLocationChange,
  onStartModeChange,
  onStartCountChange
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

  const metrics = Array.isArray(module.metrics) ? module.metrics : [];
  const columns = Array.isArray(module.columns) ? module.columns : [];

  const startOptions =
    Array.isArray(module.startOptions) &&
    module.startOptions.length
      ? module.startOptions.map(Number)
      : [1, 3, 7, 10, 20];

  const requestedStartIndex =
    startOptions.indexOf(
      Number(module.activeStartCount)
    );

  const activeStartIndex =
    requestedStartIndex >= 0
      ? requestedStartIndex
      : startOptions.indexOf(7);

  applyPitcherAtmosphere(
    container,
    module
  );

  container.innerHTML = `
    <div class="pitcher-card-link">
      <div class="pitcher-card-heading">
        <div>
          <span class="data-label">
            ${escapeHtml(module.statusLabel || "STARTER TBD")}
          </span>
          <h2>
            <a
              class="pitcher-name-signal pitcher-name-link ${escapeHtml(
                module.nameSignalClass ||
                "pitcher-signal-neutral"
              )}"
              href="${escapeAttribute(
                module.detailsUrl || "#"
              )}"
              title="${escapeAttribute(
                module.nameSignalLabel ||
                "League-relative pitcher signal"
              )}"
            >
              ${escapeHtml(module.name || "Starter TBD")}
            </a>
          </h2>
          <div class="pitcher-meta-line">
            <p>
              ${escapeHtml(module.team || "—")}
              · ${escapeHtml(module.contextLabel || "")}
              · Age ${escapeHtml(module.age ?? "—")}
              · ${escapeHtml(module.handLabel || "Throws —")}
            </p>
            <span class="pitcher-lineup-inline ${escapeHtml(module.lineupStatusClass || "")}"
              title="${escapeAttribute(module.lineupStatusLabel || "Projected lineup")}">
              ${escapeHtml(module.lineupHandednessLabel || "LHH/RHH unavailable")}
              ${module.lineupChanged ? '<strong class="lineup-change-flag">UPDATED</strong>' : ''}
            </span>
          </div>
        </div>
        <a class="open-data" href="${escapeAttribute(module.detailsUrl || "#")}">Full data →</a>
      </div>


      <div class="pitcher-filter-row">
        <div
          class="pitcher-location-control"
          role="group"
          aria-label="Pitcher location split"
        >
          ${["all", "home", "away"].map(location => `
            <button
              type="button"
              data-pitcher-location="${location}"
              class="${module.activeLocation === location ? "active" : ""}"
            >
              ${location[0].toUpperCase() + location.slice(1)}
            </button>
          `).join("")}
        </div>

        <div
          class="pitcher-start-compact ${
            module.startMode
              ? "active"
              : "inactive"
          }"
          role="group"
          aria-label="Recent pitcher starts"
          title="${escapeAttribute(
            module.startMode
              ? `${module.startSampleLabel || `Last ${module.activeStartCount} starts`}. Click the selected number again for Season.`
              : "Season active. Select a number to use recent starts."
          )}"
        >
          <span
            class="pitcher-start-track"
            aria-hidden="true"
          ></span>

          ${startOptions.map(option => `
            <button
              type="button"
              data-pitcher-start-count="${option}"
              class="${
                Number(module.activeStartCount) === option
                  ? "selected"
                  : ""
              }"
              aria-pressed="${
                module.startMode &&
                Number(module.activeStartCount) === option
                  ? "true"
                  : "false"
              }"
              title="${
                module.startMode &&
                Number(module.activeStartCount) === option
                  ? `Last ${option} starts active. Click again for Season.`
                  : `Use last ${option} starts`
              }"
            >
              <span
                class="pitcher-start-dot"
                aria-hidden="true"
              ></span>
              <small>${option}</small>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="table-scroll">
        <table class="data-table pitcher-data-table pitcher-rank-table">
          <thead>
            <tr class="pitcher-group-heading">
              <th>Metric</th>
              ${columns.map(column => `
                <th>${escapeHtml(column.label)}</th>
              `).join("")}
            </tr>
          </thead>
          <tbody>
            ${metrics.length
              ? metrics.map(renderPitcherMetricRow).join("")
              : renderEmptyRow(columns.length + 1)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container
    .querySelectorAll(
      "[data-pitcher-start-count]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
          event.preventDefault();
          event.stopPropagation();

          const count = Number(
            button.dataset
              .pitcherStartCount
          );

          const selectedIsActive =
            Boolean(module.startMode) &&
            Number(
              module.activeStartCount
            ) === count;

          if (selectedIsActive) {
            onStartModeChange?.(false);
            return;
          }

          onStartCountChange?.(count);
        }
      );
    });

  container.querySelectorAll("[data-pitcher-location]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      onLocationChange?.(button.dataset.pitcherLocation);
    });
  });
}

function applyPitcherAtmosphere(
  container,
  module
) {
  if (
    !document.body ||
    !document.body.classList.contains(
      "game-page"
    )
  ) {
    return;
  }

  const side =
    module.side === "away" ||
    module.side === "home"
      ? module.side
      : null;

  if (!side) return;

  const rawScore = Number(
    module.atmosphereSignalScore ??
    module.nameSignalScore
  );

  const score =
    Number.isFinite(rawScore)
      ? Math.max(
          -1,
          Math.min(1, rawScore)
        )
      : 0;

  const strength = Math.abs(score);

  const greenAlpha =
    score >= 0.08
      ? 0.025 + strength * 0.17
      : 0;

  const redAlpha =
    score <= -0.08
      ? 0.025 + strength * 0.16
      : 0;

  document.body.style.setProperty(
    `--${side}-pitcher-green-alpha`,
    greenAlpha.toFixed(3)
  );

  document.body.style.setProperty(
    `--${side}-pitcher-red-alpha`,
    redAlpha.toFixed(3)
  );

  document.body.style.setProperty(
    `--${side}-pitcher-signal`,
    score.toFixed(3)
  );

  document.body.dataset[
    `${side}PitcherSignal`
  ] = (
    module.nameSignalClass ||
    "pitcher-signal-neutral"
  );

  container.dataset.pitcherSignal =
    module.nameSignalClass ||
    "pitcher-signal-neutral";
}

function renderPitcherMetricRow(metric) {
  return `
    <tr>
      <th>${escapeHtml(metric.label || "—")}</th>
      ${(metric.values || []).map(renderPitcherStatCell).join("")}
    </tr>
  `;
}

function renderPitcherStatCell(value) {
  const heatClass = escapeHtml(value.heatClass || "metric-missing");
  const rank = Number(value.rank);
  const poolSize = Number(value.poolSize);

  const hasRank =
    value.rank !== null &&
    value.rank !== undefined &&
    Number.isFinite(rank) &&
    rank > 0;

  const hasVisibleValue =
    value.display !== null &&
    value.display !== undefined &&
    value.display !== "" &&
    value.display !== "—";

  const unrankedTooltip = [
    value.unrankedReason,
    value.sampleLabel ? `Sample: ${value.sampleLabel}` : "",
    value.minimumLabel ? `Required: ${value.minimumLabel}` : "",
    value.contextLabel
  ].filter(Boolean).join(" · ");

  const tooltip = hasRank
    ? buildRankTooltip(rank, poolSize, value.contextLabel)
    : hasVisibleValue && unrankedTooltip
      ? unrankedTooltip
      : (value.contextLabel || "No qualifying league rank for this selection");

  return `
    <td
      class="${heatClass} pitcher-stat-cell"
      title="${escapeAttribute(tooltip)}"
      aria-label="${escapeAttribute(tooltip)}"
    >
      <span class="metric-value">${escapeHtml(value.display || "—")}</span>
    </td>
  `;
}

function buildRankTooltip(rank, poolSize, contextLabel) {
  const poolText = Number.isFinite(poolSize)
    ? `Rank ${rank} among ${poolSize} qualifying MLB pitchers`
    : `Pitcher rank ${rank}`;
  return contextLabel ? `${poolText} · ${contextLabel}` : poolText;
}

function renderEmptyRow(columnCount) {
  return `
    <tr>
      <td class="metric-missing" colspan="${columnCount}">
        Data unavailable
      </td>
    </tr>
  `;
}

function escapeAttribute(value) {
  return escapeHtml(value || "#");
}
