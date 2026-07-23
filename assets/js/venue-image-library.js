/*
  BORING BETS: UNIVERSAL VENUE IMAGE LIBRARY V2

  Shared synchronous resolver for every sport and event page.
  Supports both legacy flat variants and recursive folder variants such as:
    weather/cloudy/day
    event-state/rain-delay/night
    roof/closed/night
*/
(function () {
  "use strict";

  const SPORT_ALIASES = {
    mlb: "baseball",
    milb: "baseball",
    baseball: "baseball",
    softball: "baseball",
    football: "football",
    nfl: "football",
    ncaaf: "football",
    soccer: "soccer",
    futbol: "soccer",
    mls: "soccer",
    epl: "soccer",
    hockey: "hockey",
    nhl: "hockey",
    basketball: "basketball",
    nba: "basketball",
    wnba: "basketball",
    tennis: "tennis",
    atp: "tennis",
    wta: "tennis",
    mma: "mma",
    ufc: "mma",
    boxing: "boxing",
    racing: "racing",
    golf: "golf"
  };

  function slugify(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeVariantPath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .split("/")
      .map(slugify)
      .filter(Boolean)
      .join("/");
  }

  function normalizeSport(value) {
    const slug = slugify(value);
    return SPORT_ALIASES[slug] || slug || "unknown";
  }

  function currentEntries() {
    const payload = window.BORING_BETS_VENUE_IMAGE_INDEX;
    return Array.isArray(payload?.venues)
      ? payload.venues
      : [];
  }

  function findVenue(options) {
    const entries = currentEntries();
    const sport = normalizeSport(options?.sport);
    const venueId = String(options?.venueId || "").trim();
    const venueSlug = slugify(
      options?.venueSlug || options?.venueName
    );

    const sportMatches = entries.filter((entry) =>
      normalizeSport(entry?.sport) === sport
    );

    for (const candidates of [sportMatches, entries]) {
      if (venueId) {
        const idMatch = candidates.find((entry) =>
          String(entry?.venue_id || "").trim() === venueId
        );
        if (idMatch) return idMatch;
      }

      if (venueSlug) {
        const slugMatch = candidates.find((entry) =>
          entry?.slug === venueSlug ||
          (
            Array.isArray(entry?.aliases) &&
            entry.aliases.includes(venueSlug)
          )
        );
        if (slugMatch) return slugMatch;
      }
    }

    return null;
  }

  function getCandidates(options = {}) {
    const venue = findVenue(options);
    if (!venue || !venue.files) return [];

    const variants = Array.isArray(options.variants)
      ? options.variants
      : [];

    const paths = [];

    for (const rawVariant of variants) {
      const variant = normalizeVariantPath(rawVariant);
      const files = venue.files[variant];

      if (!Array.isArray(files)) continue;

      for (const file of files) {
        const path = String(file?.path || "").trim();
        if (path && !paths.includes(path)) {
          paths.push(path);
        }
      }
    }

    return paths;
  }

  window.BoringBetsVenueImages = Object.freeze({
    version: 2,
    slugify,
    normalizeVariantPath,
    normalizeSport,
    findVenue,
    getCandidates,
    get index() {
      return window.BORING_BETS_VENUE_IMAGE_INDEX || {
        version: 2,
        venues: []
      };
    }
  });
})();
