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

  const panelId = `${
    container.id || "bullpen"
  }-roster-panel`;

  container.innerHTML = `
    <div class="bullpen-widget-shell">
      <div class="module-heading compact-heading">
        <div>
          <h3>
            ${escapeHtml(
              module.title || "BULLPEN"
            )}
          </h3>
        </div>

        <a
          class="open-data bullpen-details-link"
          href="${escapeAttribute(
            module.detailsUrl || "#"
          )}"
        >
          Workload →
        </a>
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

      ${renderBullpenRosterTable(
        module.roster,
        panelId
      )}

      ${
        module.note
          ? `
            <p class="module-note">
              ${escapeHtml(module.note)}
            </p>
          `
          : ""
      }
    </div>
  `;

  const toggle = container.querySelector(
    "[data-bullpen-toggle]"
  );

  const panel = container.querySelector(
    "[data-bullpen-panel]"
  );

  if (toggle && panel) {
    toggle.addEventListener("click", () => {
      const nextExpanded =
        toggle.getAttribute("aria-expanded")
        !== "true";

      saveBullpenExpandedPreference(
        nextExpanded
      );

      setAllBullpensExpanded(
        nextExpanded
      );
    });
  }

  if (readBullpenExpandedPreference()) {
    requestAnimationFrame(() => {
      setAllBullpensExpanded(true);
    });
  }

}

function setAllBullpensExpanded(
  expanded
) {
  const allToggles =
    document.querySelectorAll(
      "[data-bullpen-toggle]"
    );

  allToggles.forEach(
    bullpenToggle => {
      bullpenToggle.setAttribute(
        "aria-expanded",
        String(expanded)
      );

      bullpenToggle.classList.toggle(
        "is-open",
        expanded
      );

      const panelId =
        bullpenToggle.getAttribute(
          "aria-controls"
        );

      const bullpenPanel =
        panelId
          ? document.getElementById(panelId)
          : null;

      if (!bullpenPanel) {
        return;
      }

      bullpenPanel.hidden = !expanded;

      if (expanded) {
        requestAnimationFrame(() => {
          scrollBullpenToWhip(
            bullpenPanel
          );
        });
      }
    }
  );
}

function saveBullpenExpandedPreference(
  expanded
) {
  try {
    sessionStorage.setItem(
      "boringBetsBullpensExpanded",
      expanded ? "true" : "false"
    );
  } catch (error) {
    // Continue without saved state.
  }
}

function readBullpenExpandedPreference() {
  try {
    return sessionStorage.getItem(
      "boringBetsBullpensExpanded"
    ) === "true";
  } catch (error) {
    return false;
  }
}

function scrollBullpenToWhip(panel) {
  const scroller = panel.querySelector(
    ".bullpen-table-scroll"
  );

  const headers = panel.querySelectorAll(
    ".bullpen-roster-table thead th"
  );

  const playerHeader = headers[0];
  const whipHeader = headers[4];

  if (
    !scroller ||
    !playerHeader ||
    !whipHeader
  ) {
    return;
  }

  scroller.scrollLeft = Math.max(
    0,
    whipHeader.offsetLeft -
    playerHeader.offsetWidth
  );
}

function renderBullpenRosterTable(
  rows = [],
  panelId = "bullpen-roster-panel"
) {
  const roster =
    Array.isArray(rows)
      ? rows
      : [];

  if (!roster.length) {
    return `
      <section class="bullpen-roster-section">
        <div class="bullpen-roster-toggle bullpen-roster-unavailable">
          <span>BULLPEN ARMS</span>
          <small>Roster data unavailable</small>
        </div>
      </section>
    `;
  }

  const workload =
    summarizeBullpenWorkload(roster);

  return `
    <section class="bullpen-roster-section">
      <button
        type="button"
        class="bullpen-roster-toggle"
        data-bullpen-toggle
        aria-expanded="false"
        aria-controls="${escapeAttribute(panelId)}"
      >
        <span class="bullpen-toggle-title">
          BULLPEN ARMS
        </span>

        <span class="bullpen-toggle-summary">
          <span class="bullpen-toggle-stat">
            <small>Used Yesterday</small>
            <strong class="${bullpenWorkloadHeatClass(
              "used",
              workload.usedYesterday,
              workload.available
            )}">
              ${workload.usedYesterday}
            </strong>
          </span>

          <span class="bullpen-toggle-stat">
            <small>B2B Arms</small>
            <strong class="${bullpenWorkloadHeatClass(
              "b2b",
              workload.backToBack,
              workload.available
            )}">
              ${workload.backToBack}
            </strong>
          </span>

          <span class="bullpen-toggle-stat">
            <small>Fresh</small>
            <strong class="${bullpenWorkloadHeatClass(
              "fresh",
              workload.fresh,
              workload.available
            )}">
              ${workload.fresh}
            </strong>
          </span>
        </span>

        <span
          class="bullpen-toggle-chevron"
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      <div
        id="${escapeAttribute(panelId)}"
        class="bullpen-roster-panel"
        data-bullpen-panel
        hidden
      >
        <div class="bullpen-roster-heading">
          <span>SEASON STATISTICS</span>

          <small>
            Scroll for statistics
          </small>
        </div>

        <div class="bullpen-table-scroll">
          <table class="bullpen-roster-table">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">IP</th>
                <th scope="col">ERA</th>
                <th scope="col">FIP</th>
                <th scope="col">K/9</th>
                <th scope="col">BB/9</th>
                <th scope="col">WHIP</th>

                <th
                  scope="col"
                  title="Pitches thrown one day ago"
                >
                  1D
                </th>

                <th
                  scope="col"
                  title="Pitches thrown two days ago"
                >
                  2D
                </th>

                <th
                  scope="col"
                  title="Pitches thrown three days ago"
                >
                  3D
                </th>
              </tr>
            </thead>

            <tbody>
              ${roster
                .map(renderBullpenArm)
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function summarizeBullpenWorkload(
  rows = []
) {
  const available = rows.filter(
    arm => !arm?.isIl
  );

  const usedYesterday =
    available.filter(
      arm =>
        Number(arm?.pitches1d) > 0
    ).length;

  const backToBack =
    available.filter(
      arm =>
        Number(arm?.pitches1d) > 0 &&
        Number(arm?.pitches2d) > 0
    ).length;

  const fresh =
    available.filter(
      arm =>
        Number(arm?.pitches1d) === 0 &&
        Number(arm?.pitches2d) === 0
    ).length;

  return {
    usedYesterday,
    backToBack,
    fresh,
    available: available.length
  };
}

function bullpenWorkloadHeatClass(
  type,
  value,
  available
) {
  const count = Number(value);
  const pool = Number(available);

  if (!Number.isFinite(count)) {
    return "metric-missing";
  }

  if (type === "used") {
    if (count === 0) return "metric-elite";
    if (count === 1) return "metric-good";
    if (count === 2) return "metric-average";
    if (count === 3) return "metric-poor";
    return "metric-awful";
  }

  if (type === "b2b") {
    if (count === 0) return "metric-elite";
    if (count === 1) return "metric-average";
    if (count === 2) return "metric-poor";
    return "metric-awful";
  }

  if (type === "fresh") {
    if (
      !Number.isFinite(pool) ||
      pool <= 0
    ) {
      return "metric-missing";
    }

    const ratio = count / pool;

    if (ratio >= .75) return "metric-elite";
    if (ratio >= .60) return "metric-good";
    if (ratio >= .45) return "metric-average";
    if (ratio >= .30) return "metric-poor";
    return "metric-awful";
  }

  return "metric-average";
}

function renderBullpenArmName(arm) {
  const name =
    arm?.name || "Unknown reliever";

  const signalClass =
    arm?.nameSignalClass ||
    "pitcher-signal-neutral";

  const signalLabel =
    arm?.nameSignalLabel ||
    "Pitcher signal unavailable";

  const commonClass = [
    "bullpen-arm-player-name",
    "pitcher-name-signal",
    signalClass
  ].join(" ");

  if (
    arm?.detailsUrl &&
    arm.detailsUrl !== "#"
  ) {
    return `
      <a
        class="${escapeAttribute(
          commonClass
        )} bullpen-arm-player-link"
        href="${escapeAttribute(
          arm.detailsUrl
        )}"
        title="${escapeAttribute(
          signalLabel
        )}"
        aria-label="${escapeAttribute(
          `${name}. ${signalLabel}. Open pitcher page.`
        )}"
      >
        ${escapeHtml(name)}
      </a>
    `;
  }

  return `
    <span
      class="${escapeAttribute(
        commonClass
      )}"
      title="${escapeAttribute(
        signalLabel
      )}"
    >
      ${escapeHtml(name)}
    </span>
  `;
}


function renderBullpenArm(arm) {
  const statusText = [
    arm?.status,
    arm?.injuryNote
  ].filter(Boolean).join(" · ");

  const limitedSample =
    bullpenInningsBelowTen(
      arm?.inningsPitched
    );

  return `
    <tr class="${
      arm?.isIl
        ? "bullpen-arm-il"
        : ""
    }">
      <th
        scope="row"
        class="bullpen-arm-name"
        title="${escapeAttribute(statusText)}"
      >
        <span class="bullpen-arm-name-inner">
          ${renderBullpenArmName(arm)}

          <span class="bullpen-role bullpen-role-${
            escapeAttribute(
              String(
                arm?.role || "MR"
              ).toLowerCase()
            )
          }">
            ${escapeHtml(arm?.role || "MR")}
          </span>

          ${
            arm?.isIl
              ? `
                <b class="bullpen-il-badge">
                  IL
                </b>
              `
              : ""
          }

          ${
            limitedSample
              ? `
                <b
                  class="bullpen-small-sample-warning"
                  title="Small sample: fewer than 10 innings pitched, so these stats may be less reliable"
                  aria-label="Small sample warning: fewer than 10 innings pitched, so these stats may be less reliable"
                >
                  !
                </b>
              `
              : ""
          }
        </span>
      </th>

      <td class="${escapeHtml(
        arm?.inningsHeatClass ||
        "metric-missing"
      )}">
        ${escapeHtml(
          arm?.inningsPitched || "—"
        )}
      </td>

      <td class="${escapeHtml(
        arm?.eraHeatClass ||
        "metric-missing"
      )}">
        ${escapeHtml(arm?.era || "—")}
      </td>

      <td class="${escapeHtml(
        arm?.fipHeatClass ||
        "metric-missing"
      )}">
        ${escapeHtml(arm?.fip || "—")}
      </td>

      <td class="${escapeHtml(
        arm?.kPer9HeatClass ||
        "metric-missing"
      )}">
        ${escapeHtml(arm?.kPer9 || "—")}
      </td>

      <td class="${escapeHtml(
        arm?.bbPer9HeatClass ||
        "metric-missing"
      )}">
        ${escapeHtml(arm?.bbPer9 || "—")}
      </td>

      <td class="${escapeHtml(
        arm?.whipHeatClass ||
        "metric-missing"
      )}">
        ${escapeHtml(arm?.whip || "—")}
      </td>

      ${renderPitchCount(arm?.pitches1d)}
      ${renderPitchCount(arm?.pitches2d)}
      ${renderPitchCount(arm?.pitches3d)}
    </tr>
  `;
}

function bullpenInningsBelowTen(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "—"
  ) {
    return false;
  }

  const innings = Number(value);

  return (
    Number.isFinite(innings) &&
    innings < 10
  );
}

function renderPitchCount(value) {
  const pitches = Math.max(
    0,
    Number(value) || 0
  );

  if (pitches === 0) {
    return `
      <td
        class="bullpen-pitches bullpen-zero"
        title="No pitches thrown"
        aria-label="No pitches thrown"
      >
        —
      </td>
    `;
  }

  const workloadRatio = (
    Math.min(pitches, 40) - 1
  ) / 39;

  const hue = Math.round(
    120 * (1 - workloadRatio)
  );

  const alpha = (
    0.14 +
    workloadRatio * 0.12
  ).toFixed(3);

  return `
    <td
      class="bullpen-pitches bullpen-pitch-gradient"
      style="
        --bullpen-pitch-hue: ${hue};
        --bullpen-pitch-alpha: ${alpha};
      "
      title="${escapeAttribute(
        `${pitches} pitches thrown`
      )}"
    >
      ${escapeHtml(pitches)}
    </td>
  `;
}

function renderBullpenMetric(metric) {
  const rank = Number(metric?.rank);

  const hasRank =
    Number.isFinite(rank) &&
    rank >= 1 &&
    rank <= 30;

  const valueHeatClass =
    metric?.heatClass ||
    "metric-missing";

  const rankHeatClass =
    hasRank
      ? valueHeatClass
      : "metric-missing";

  return `
    <span class="summary-stat bullpen-summary-stat">
      <small class="bullpen-summary-label ${escapeHtml(
        valueHeatClass
      )}">
        ${escapeHtml(
          metric?.label || "—"
        )}
      </small>

      <strong class="bullpen-summary-value ${escapeHtml(
        valueHeatClass
      )}">
        ${escapeHtml(
          metric?.display || "—"
        )}
      </strong>

      <small class="bullpen-summary-rank ${escapeHtml(
        rankHeatClass
      )}">
        ${
          hasRank
            ? escapeHtml(rank)
            : "—"
        }
      </small>
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
