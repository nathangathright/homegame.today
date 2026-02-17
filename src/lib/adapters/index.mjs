// Adapter dispatcher — returns the correct sport adapter
import * as mlb from "./mlb.mjs";
import * as nhl from "./nhl.mjs";
import * as nba from "./nba.mjs";
import * as nfl from "./nfl.mjs";

const adapters = { mlb, nhl, nba, nfl };

export function getAdapter(sport) {
  const adapter = adapters[sport || "mlb"];
  if (!adapter) throw new Error(`Unknown sport adapter: ${sport}`);
  return adapter;
}
