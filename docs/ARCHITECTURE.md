# Boring Bets Architecture

## Product Principle

Boring Bets is a fast, data-dense research terminal for bettors.

The interface stays familiar across sports, but each sport uses its own research model.

- MLB: starting pitcher versus opposing offense first; bullpen and offense-versus-offense as secondary context.
- NHL: goalie, shot quality, special teams, rest, and travel.
- NFL: offense versus defense, line play, personnel, pace, and weather.
- NBA: lineup versus lineup, rotations, pace, and shot profile.
- Soccer: formations, projected lineups, tactical matchups, possession, and chance creation.

## Core Data Flow

```text
data provider(s)
    ↓
sport engine
    ↓
normalized widget data
    ↓
reusable widgets
    ↓
game workspace
```

For MLB:

```text
games.json
    ↓
assets/js/sports/mlbEngine.js
    ↓
pitcher / offense / bullpen / matchup data
    ↓
assets/js/widgets/
    ↓
game.js
    ↓
game.html
```

## Directory Structure

```text
assets/
├── css/
│   └── variables.css
├── images/
└── js/
    ├── home.js
    ├── engine/
    │   └── colorEngine.js
    ├── sports/
    │   └── mlbEngine.js
    └── widgets/
        ├── pitcherWidget.js
        ├── offenseWidget.js
        ├── bullpenWidget.js
        ├── matchupWidget.js
        ├── weatherWidget.js
        └── marketWidget.js

data/
├── games.json
└── todays-card.json

game.html
game.js
styles.css
```

## Responsibilities

### `game.js`

The page orchestrator.

It should:

- load game and card data
- read the game ID from the URL
- keep current UI state
- call the sport engine
- send normalized data to widgets
- update the page title and navigation

It should not contain large table renderers or sport-specific metric definitions.

### `assets/js/sports/mlbEngine.js`

Owns baseball logic.

It should:

- pair each starting pitcher with the opposing offense
- select the correct offense split based on pitcher handedness
- select timeframe and location data
- define which MLB metrics appear
- prepare pitcher-versus-projected-lineup summaries
- normalize bullpen, weather, and market data for widgets

### `assets/js/widgets/*.js`

Own presentation only.

Widgets should receive normalized data and render it.

They should not decide:

- which metrics matter for a sport
- which handedness split to use
- whether lower or higher is better
- how to pair opponents

### `assets/js/engine/colorEngine.js`

Owns heat-map classes.

Primary grading should use rank or percentile rather than fixed values.

Standard classes:

- `metric-elite`
- `metric-good`
- `metric-average`
- `metric-poor`
- `metric-awful`
- `metric-missing`

### `data/games.json`

The current game-level data store.

Each game should contain:

- teams and IDs
- starters and starter status
- 7-day, 30-day, and season pitcher data
- all, home, and away splits
- offense data and ranks
- projected lineups
- pitcher-versus-lineup history
- bullpens and availability
- weather
- market
- injuries
- related Boring Bets plays

## MLB First-Screen Hierarchy

The first screen should show evidence, not a verdict.

```text
matchup logos
status strip
timeframe + location controls

away starter        home starter
home offense         away offense
starter vs lineup    starter vs lineup

away bullpen         home bullpen

weather | market | injuries | plays
```

Every major module should be clickable for deeper detail.

## Navigation

Each game uses a stable ID:

```text
game.html?id=2026-07-08-tor-sf
```

Every play should store an explicit `game_id`.

Game switching should eventually work without a full page reload.

## Design Rules

1. Data over hype.
2. Fast beats flashy.
3. Evidence before conclusions.
4. One screen, one game, one decision.
5. Every click must earn its existence.
6. The phone is a full research terminal, not a stripped-down site.
7. Each sport gets its own research model.
8. Color accelerates reading but never makes the decision for the user.
9. Missing data displays as `—`; never invent values.
10. Public recommendations come after the evidence.
