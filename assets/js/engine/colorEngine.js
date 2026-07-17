/**
 * Converts MLB ranks into reusable heat classes.
 *
 * Rank 1 is best.
 * Rank 30 is worst.
 */
export function getRankHeatClass(rank, leagueSize = 30) {
  const numericRank = Number(rank);
  const numericLeagueSize = Number(leagueSize);

  if (
    !Number.isFinite(numericRank) ||
    !Number.isFinite(numericLeagueSize) ||
    numericRank < 1 ||
    numericLeagueSize < 1 ||
    numericRank > numericLeagueSize
  ) {
    return "metric-missing";
  }

  const percentile = numericRank / numericLeagueSize;

  if (percentile <= 0.20) {
    return "metric-elite";
  }

  if (percentile <= 0.40) {
    return "metric-good";
  }

  if (percentile <= 0.60) {
    return "metric-average";
  }

  if (percentile <= 0.80) {
    return "metric-poor";
  }

  return "metric-awful";
}

/**
 * Returns a complete value/rank cell.
 */
export function renderRankedMetric({
  value,
  rank,
  formattedValue = null,
  leagueSize = 30
}) {
  const heatClass = getRankHeatClass(
    rank,
    leagueSize
  );

  const displayValue =
    formattedValue ??
    formatBasicValue(value);

  const displayRank =
    Number.isFinite(Number(rank))
      ? `#${Number(rank)}`
      : "—";

  return `
    <td class="${heatClass}">
      <span class="metric-value">
        ${escapeHtml(displayValue)}
      </span>

      <small class="metric-rank">
        ${escapeHtml(displayRank)}
      </small>
    </td>
  `;
}

/**
 * Use for cells that have no rank yet.
 */
export function renderUnrankedMetric(
  value,
  formattedValue = null
) {
  const displayValue =
    formattedValue ??
    formatBasicValue(value);

  const missing =
    value === null ||
    value === undefined ||
    value === "";

  return `
    <td class="${
      missing
        ? "metric-missing"
        : "metric-average"
    }">
      <span class="metric-value">
        ${escapeHtml(displayValue)}
      </span>
    </td>
  `;
}

export function formatBasicValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return String(value);
}

export function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]
  );
}