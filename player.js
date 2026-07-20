import {
  escapeHtml,
  getRankHeatClass
} from "./assets/js/engine/colorEngine.js";

const params =
  new URLSearchParams(
    window.location.search
  );

const playerId =
  params.get("id");

const requestedRole =
  normalizeRole(
    params.get("role")
  );

const loading =
  document.getElementById(
    "playerLoading"
  );

const profileRoot =
  document.getElementById(
    "playerProfile"
  );

const backLink =
  document.getElementById(
    "playerBackLink"
  );

let profile = null;
let activeRole = requestedRole;

boot();

async function boot() {
  configureBackLink();

  if (!playerId) {
    showError(
      "No MLB player ID was supplied."
    );
    return;
  }

  try {
    const response =
      await fetch(
        `data/players.json?v=${Date.now()}`,
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        "Player profile data has not been built."
      );
    }

    const payload =
      await response.json();

    profile =
      payload?.players?.[
        String(playerId)
      ] || null;

    if (!profile) {
      throw new Error(
        `Player ${playerId} is not present in the current player index.`
      );
    }

    activeRole =
      resolveAvailableRole(
        profile,
        activeRole
      );

    render();
  } catch (error) {
    showError(
      error?.message ||
      "Unable to load this player."
    );
  }
}

function render() {
  if (!profile) return;

  loading.hidden = true;
  profileRoot.hidden = false;

  document.title =
    `${profile.name || "Player"} | Boring Bets`;

  const signal =
    getRoleData()?.signal || {};

  const name =
    document.getElementById(
      "playerName"
    );

  name.textContent =
    profile.name || "Player";

  name.className =
    `player-profile-name ${
      signal.class_name ||
      "player-signal-neutral"
    }`;

  const portrait =
    document.getElementById(
      "playerPortrait"
    );

  portrait.textContent =
    initials(
      profile.name
    );

  renderRoleTabs();
  renderBio();
  renderSignal(signal);
  renderSummary();
  renderMetrics();
}

function renderRoleTabs() {
  const container =
    document.getElementById(
      "playerRoleTabs"
    );

  const roles =
    availableRoles(profile);

  container.innerHTML =
    roles.map(role => `
      <button
        type="button"
        role="tab"
        data-player-role="${role}"
        class="${
          role === activeRole
            ? "active"
            : ""
        }"
        aria-selected="${
          role === activeRole
            ? "true"
            : "false"
        }"
      >
        ${
          role === "pitching"
            ? "Pitching"
            : "Hitting"
        }
      </button>
    `).join("");

  container
    .querySelectorAll(
      "[data-player-role]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          activeRole =
            button.dataset.playerRole;

          const next =
            new URL(
              window.location.href
            );

          next.searchParams.set(
            "role",
            activeRole
          );

          history.replaceState(
            {},
            "",
            next
          );

          render();
        }
      );
    });
}

function renderBio() {
  const bio =
    document.getElementById(
      "playerBio"
    );

  const roleData =
    getRoleData();

  const position =
    activeRole === "pitching"
      ? "Pitcher"
      : (
          roleData?.position ||
          profile.primary_position ||
          "Hitter"
        );

  const team =
    profile.team?.name ||
    profile.team?.abbr ||
    "Team unavailable";

  const handText =
    activeRole === "pitching"
      ? `Throws ${profile.throws || "—"}`
      : `Bats ${profile.bats || "—"}`;

  const birthPlace = [
    profile.birth_city,
    profile.birth_state,
    profile.birth_country
  ].filter(Boolean).join(", ");

  const rows = [
    ["Position", position],
    ["Team", team],
    ["Hand", handText],
    ["Age", profile.age ?? "—"],
    ["Height", profile.height || "—"],
    [
      "Weight",
      profile.weight
        ? `${profile.weight} lb`
        : "—"
    ],
    ["Born", profile.birth_date || "—"],
    ["Birthplace", birthPlace || "—"],
    ["MLB debut", profile.mlb_debut || "—"]
  ];

  bio.innerHTML =
    rows.map(([label, value]) => `
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join("");
}

function renderSignal(signal) {
  const label =
    document.getElementById(
      "playerSignalLabel"
    );

  const detail =
    document.getElementById(
      "playerSignalDetail"
    );

  label.textContent =
    signal.label ||
    "League-relative signal unavailable";

  detail.textContent =
    activeRole === "pitching"
      ? "Pitching · Season / All"
      : "Hitting · Season / All";
}

function renderSummary() {
  const roleData =
    getRoleData();

  const stats =
    roleData?.stats || {};

  const title =
    document.getElementById(
      "playerSummaryTitle"
    );

  title.textContent =
    `${profile.season || "Season"} ${
      activeRole === "pitching"
        ? "Pitching"
        : "Hitting"
    }`;

  const metrics =
    activeRole === "pitching"
      ? [
          ["ERA", stats.era, number2],
          ["WHIP", stats.whip, number2],
          ["FIP", stats.fip, number2],
          ["xFIP", stats.xfip, number2],
          ["IP", stats.innings_pitched, valueText],
          ["SO", stats.strikeouts, integer],
          ["K%", stats.k_rate, percent1],
          ["BB%", stats.bb_rate, percent1]
        ]
      : [
          ["AVG", stats.avg, average3],
          ["OBP", stats.obp, average3],
          ["SLG", stats.slg, average3],
          ["OPS", stats.ops, average3],
          ["HR", stats.home_runs, integer],
          ["RBI", stats.rbi, integer],
          ["K%", stats.k_rate, percent1],
          ["BB%", stats.bb_rate, percent1]
        ];

  const grid =
    document.getElementById(
      "playerSummaryGrid"
    );

  grid.innerHTML =
    metrics.map(
      ([label, value, formatter]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(
            formatter(value)
          )}</strong>
        </div>
      `
    ).join("");
}

function renderMetrics() {
  const roleData =
    getRoleData();

  const stats =
    roleData?.stats || {};

  const ranks =
    roleData?.ranks || {};

  const pool =
    roleData?.rank_pool_size || {};

  const metrics =
    activeRole === "pitching"
      ? [
          ["ERA", "era", number2],
          ["WHIP", "whip", number2],
          ["FIP", "fip", number2],
          ["xFIP", "xfip", number2],
          ["AVG Against", "avg_against", average3],
          ["K%", "k_rate", percent1],
          ["BB%", "bb_rate", percent1],
          ["GO/AO", "go_ao", number2]
        ]
      : [
          ["AVG", "avg", average3],
          ["OBP", "obp", average3],
          ["SLG", "slg", average3],
          ["OPS", "ops", average3],
          ["HR", "home_runs", integer],
          ["K%", "k_rate", percent1],
          ["BB%", "bb_rate", percent1]
        ];

  const body =
    document.getElementById(
      "playerMetricRows"
    );

  body.innerHTML =
    metrics.map(
      ([label, key, formatter]) => {
        const rank =
          Number(ranks[key]);

        const poolSize =
          Number(pool[key]);

        const heatClass =
          getRankHeatClass(
            rank,
            poolSize
          );

        return `
          <tr>
            <th>${escapeHtml(label)}</th>
            <td class="${escapeHtml(heatClass)}">
              ${escapeHtml(
                formatter(stats[key])
              )}
            </td>
            <td class="${escapeHtml(heatClass)}">
              ${
                Number.isFinite(rank)
                  ? escapeHtml(rank)
                  : "—"
              }
            </td>
            <td>
              ${
                Number.isFinite(poolSize)
                  ? escapeHtml(poolSize)
                  : "—"
              }
            </td>
          </tr>
        `;
      }
    ).join("");
}

function getRoleData() {
  return (
    profile?.roles?.[activeRole] ||
    {}
  );
}

function availableRoles(value) {
  return [
    "pitching",
    "hitting"
  ].filter(
    role =>
      value?.roles?.[role]
        ?.available
  );
}

function resolveAvailableRole(
  value,
  requested
) {
  const roles =
    availableRoles(value);

  if (roles.includes(requested)) {
    return requested;
  }

  return (
    roles[0] ||
    requested ||
    "hitting"
  );
}

function normalizeRole(value) {
  return value === "pitching"
    ? "pitching"
    : "hitting";
}

function initials(value) {
  return String(value || "BB")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function configureBackLink() {
  if (
    !backLink ||
    !document.referrer
  ) {
    return;
  }

  try {
    const referrer =
      new URL(
        document.referrer
      );

    const current =
      new URL(
        window.location.href
      );

    if (
      referrer.origin ===
        current.origin &&
      !referrer.pathname.endsWith(
        "/player.html"
      )
    ) {
      backLink.href =
        referrer.href;
    }
  } catch {
    // Keep Today’s Card as fallback.
  }
}

function showError(message) {
  loading.hidden = false;
  loading.textContent = message;
  profileRoot.hidden = true;
}

function number2(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toFixed(2)
    : "—";
}

function average3(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toFixed(3)
    : "—";
}

function percent1(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? `${number.toFixed(1)}%`
    : "—";
}

function integer(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? String(Math.round(number))
    : "—";
}

function valueText(value) {
  return (
    value === null ||
    value === undefined ||
    value === ""
  )
    ? "—"
    : String(value);
}
