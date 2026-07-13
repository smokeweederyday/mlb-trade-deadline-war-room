#!/usr/bin/env python3
"""Refresh public site data.

Automated:
- Official MLB transaction page, filtered for trade language.
- MLB standings from the public Stats API when available.

Editorial/manual:
- Rumors in data/manual-rumors.json.
- Team tier, need and betting-note overrides in data/manual-overrides.json.

The script fails softly: if a remote feed changes, it retains the last good data.
"""
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
import json, re, urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/site-data.json"
RUMORS = ROOT / "data/manual-rumors.json"
OVERRIDES = ROOT / "data/manual-overrides.json"

TEAM_MAP = {
  108:"LAA",109:"ARI",110:"BAL",111:"BOS",112:"CHC",113:"CIN",114:"CLE",115:"COL",
  116:"DET",117:"HOU",118:"KC",119:"LAD",120:"WSH",121:"NYM",133:"ATH",134:"PIT",
  135:"SD",136:"SEA",137:"SF",138:"STL",139:"TB",140:"TEX",141:"TOR",142:"MIN",
  143:"PHI",144:"ATL",145:"CWS",146:"MIA",147:"NYY",158:"MIL"
}

def get_json(url: str):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 TradeDeadlineWarRoom/1.0"})
    with urllib.request.urlopen(req,timeout=25) as r:
        return json.loads(r.read())

def get_text(url: str):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 TradeDeadlineWarRoom/1.0"})
    with urllib.request.urlopen(req,timeout=25) as r:
        return r.read().decode("utf-8","replace")

def classify(wcgb: float) -> str:
    if wcgb <= .5:return "Aggressive Buyer"
    if wcgb <= 3.5:return "Buyer"
    if wcgb <= 6.5:return "Bubble"
    if wcgb <= 10.5:return "Seller"
    return "Rebuilder"

def refresh_standings(previous):
    # MLB public Stats API. Preserve previous snapshot if response format changes.
    url="https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=2026&standingsTypes=regularSeason&hydrate=team"
    raw=get_json(url)
    prev={x["team"]:x for x in previous}
    rows=[]
    for rec in raw.get("records",[]):
        division=rec.get("division",{}).get("nameShort","")
        for tr in rec.get("teamRecords",[]):
            abbr=TEAM_MAP.get(tr.get("team",{}).get("id"))
            if not abbr: continue
            wcgb_raw=tr.get("wildCardGamesBack","-")
            wcgb=0.0 if wcgb_raw in ("-","E") else float(wcgb_raw)
            base=prev.get(abbr,{})
            rows.append({
              "team":abbr,"division":division,
              "w":int(tr.get("wins",0)),"l":int(tr.get("losses",0)),
              "wcgb":wcgb,"run_diff":int(tr.get("runDifferential",0)),
              "tier":base.get("tier",classify(wcgb)),
              "need":base.get("need","Editorial review needed"),
              "betting_note":base.get("betting_note","Review roster and market impact")
            })
    return rows or previous

def refresh_trades(previous):
    # MLB page embeds transaction descriptions. Capture trade sentences only.
    html=get_text("https://www.mlb.com/transactions")
    text=re.sub(r"<[^>]+>"," ",html)
    text=re.sub(r"\s+"," ",text)
    matches=re.findall(r"(\d{2}/\d{2}/\d{2}).{0,140}?([A-Z][^.]{10,240}? traded [^.]{10,300}\.)",text,re.I)
    found=[]
    seen=set()
    for date,desc in matches:
        clean=re.sub(r"\s+"," ",desc).strip()
        key=(date,clean.lower())
        if key in seen:continue
        seen.add(key)
        found.append({
          "date":datetime.strptime(date,"%m/%d/%y").strftime("%Y-%m-%d"),
          "from":"See description","to":"See description","players":clean,"return":"See official source",
          "betting_impact":"Editorial review required.",
          "source":"https://www.mlb.com/transactions"
        })
    # Keep previous curated items; append newly detected descriptions.
    keys={x.get("players","").lower() for x in previous}
    return previous+[x for x in found if x["players"].lower() not in keys]

def main():
    current=json.loads(OUT.read_text())
    overrides=json.loads(OVERRIDES.read_text())
    try: current["teams"]=refresh_standings(current.get("teams",[]))
    except Exception as e: print("Standings refresh retained prior data:",e)
    try: current["trades"]=refresh_trades(current.get("trades",[]))
    except Exception as e: print("Transactions refresh retained prior data:",e)

    # Apply editorial overrides after automated feeds.
    for t in current.get("teams",[]):
        ov=overrides.get("team_overrides",{}).get(t["team"],{})
        t.update(ov)
    current["trades"].extend(overrides.get("manual_trades",[]))
    current["rumors"]=json.loads(RUMORS.read_text())
    current["meta"]["updated_at"]=datetime.now(timezone.utc).isoformat()
    OUT.write_text(json.dumps(current,indent=2)+"\n")
    print(f"Updated {len(current['teams'])} teams, {len(current['trades'])} trades, {len(current['rumors'])} rumors.")

if __name__=="__main__":
    main()
