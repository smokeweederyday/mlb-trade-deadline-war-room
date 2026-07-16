import {
  escapeHtml
} from "../engine/colorEngine.js";

export function renderMarketWidget({
  container,
  module
}) {
  if (!container) return;

  if (!module || !module.hasMarketData) {
    container.href =
      module?.detailsUrl || "#";

    container.innerHTML = `
      <p class="kicker">
        MARKET
      </p>

      <h3>
        Market pending
      </h3>

      <p>
        Current sportsbook prices are unavailable.
      </p>
    `;

    return;
  }

  container.href =
    module.detailsUrl || "#";

  const away = module.teams?.away || {};
  const home = module.teams?.home || {};

  container.innerHTML = `
    <p class="kicker">
      MARKET
    </p>

    <h3 class="market-headline">
      ${escapeHtml(
        module.headline || "Current market"
      )}
    </h3>

    <div class="market-widget-grid">
      ${renderTeamPrice(away)}
      ${renderTeamPrice(home)}
    </div>

    <div class="market-widget-secondary">
      ${renderTotal(module.total)}
      ${renderRunLine(module.runLine)}
    </div>

    <p class="market-widget-summary">
      ${escapeHtml(
        module.summary || "Current prices"
      )}
    </p>

    <p class="market-widget-updated">
      ${escapeHtml(
        formatUpdatedLabel(
          module.lastUpdated,
          module.source
        )
      )}
    </p>
  `;
}

function renderTeamPrice(team) {
  return `
    <div class="market-team-price">
      <span class="market-team-abbr">
        ${escapeHtml(
          team.abbr || "—"
        )}
      </span>

      <strong class="market-best-price">
        ${escapeHtml(
          formatAmericanOdds(
            team.bestPrice
          )
        )}
      </strong>

      <span class="market-bookmaker">
        ${escapeHtml(
          team.bestBook || "Best price unavailable"
        )}
      </span>

      <span class="market-consensus">
        Consensus
        ${escapeHtml(
          formatAmericanOdds(
            team.consensusPrice
          )
        )}
      </span>

      <span class="market-fair-price">
        No-vig fair
        ${escapeHtml(
          formatAmericanOdds(
            team.fairPrice
          )
        )}
      </span>
    </div>
  `;
}

function renderTotal(total) {
  if (!total) {
    return `
      <div class="market-mini-block">
        <span>Total</span>
        <strong>—</strong>
      </div>
    `;
  }

  const point =
    total.over?.point ??
    total.under?.point ??
    null;

  return `
    <div class="market-mini-block">
      <span>Total</span>

      <strong>
        ${escapeHtml(
          formatLine(point)
        )}
      </strong>

      <small>
        O ${escapeHtml(
          formatAmericanOdds(
            total.over?.price
          )
        )}
        ·
        U ${escapeHtml(
          formatAmericanOdds(
            total.under?.price
          )
        )}
      </small>
    </div>
  `;
}

function renderRunLine(runLine) {
  if (!runLine) {
    return `
      <div class="market-mini-block">
        <span>Run line</span>
        <strong>—</strong>
      </div>
    `;
  }

  const away = runLine.away;
  const home = runLine.home;

  return `
    <div class="market-mini-block">
      <span>Run line</span>

      <strong>
        ${escapeHtml(
          away
            ? `${away.team} ${formatSignedLine(away.point)}`
            : "—"
        )}
      </strong>

      <small>
        ${escapeHtml(
          away
            ? formatAmericanOdds(away.price)
            : "—"
        )}
        ·
        ${escapeHtml(
          home
            ? `${home.team} ${formatSignedLine(home.point)} ` +
              formatAmericanOdds(home.price)
            : "—"
        )}
      </small>
    </div>
  `;
}

function formatAmericanOdds(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return number > 0
    ? `+${Math.round(number)}`
    : `${Math.round(number)}`;
}

function formatLine(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return Number.isInteger(number)
    ? number.toString()
    : number.toFixed(1);
}

function formatSignedLine(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  const formatted =
    Number.isInteger(number)
      ? number.toString()
      : number.toFixed(1);

  return number > 0
    ? `+${formatted}`
    : formatted;
}

function formatUpdatedLabel(
  value,
  source
) {
  const sourceLabel =
    source || "Market source";

  if (!value) {
    return sourceLabel;
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return sourceLabel;
  }

  const time = date.toLocaleTimeString(
    "en-US",
    {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }
  );

  return `${sourceLabel} · Updated ${time}`;
}
