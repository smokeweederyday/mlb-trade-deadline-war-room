#!/usr/bin/env python3
from __future__ import annotations
import json, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
GAMES_PATH=ROOT/'data'/'games.json'
OUT_PATH=ROOT/'data'/'venues.json'

# Reliable fallbacks for current MLB primary venues. The builder prefers MLB's
# own venue location payload and uses these only when coordinates/time zones are absent.
FALLBACKS={
  1:(33.8003,-117.8827,'Anaheim','America/Los_Angeles',160),
  2:(38.6226,-90.1928,'St. Louis','America/Chicago',466),
  3:(39.2841,-76.6215,'Baltimore','America/New_York',20),
  4:(41.4962,-81.6852,'Cleveland','America/New_York',653),
  5:(40.7571,-73.8458,'New York','America/New_York',10),
  7:(39.9061,-75.1665,'Philadelphia','America/New_York',20),
  10:(47.5914,-122.3325,'Seattle','America/Los_Angeles',15),
  12:(37.7786,-122.3893,'San Francisco','America/Los_Angeles',10),
  14:(33.4455,-112.0667,'Phoenix','America/Phoenix',1082),
  15:(35.0523,-80.6813,'Charlotte','America/New_York',750),
  17:(42.3467,-71.0972,'Boston','America/New_York',20),
  19:(39.7559,-104.9942,'Denver','America/Denver',5200),
  22:(32.7513,-97.0825,'Arlington','America/Chicago',551),
  31:(41.9484,-87.6553,'Chicago','America/Chicago',600),
  32:(40.4469,-80.0058,'Pittsburgh','America/New_York',730),
  2392:(34.0739,-118.2400,'Los Angeles','America/Los_Angeles',515),
  2394:(42.3390,-83.0485,'Detroit','America/Detroit',585),
  2395:(40.8296,-73.9262,'New York','America/New_York',55),
  2529:(38.8730,-77.0074,'Washington','America/New_York',25),
  2602:(41.8300,-87.6338,'Chicago','America/Chicago',595),
  2603:(29.7573,-95.3555,'Houston','America/Chicago',40),
  2609:(44.9817,-93.2776,'Minneapolis','America/Chicago',840),
  2680:(43.0280,-87.9712,'Milwaukee','America/Chicago',635),
  2681:(39.0979,-84.5082,'Cincinnati','America/New_York',490),
  2889:(37.7516,-122.2005,'Oakland','America/Los_Angeles',25),
  4169:(25.7781,-80.2197,'Miami','America/New_York',10),
  4705:(33.8908,-84.4677,'Atlanta','America/New_York',1000),
  5325:(43.6414,-79.3894,'Toronto','America/Toronto',250),
  680:(32.7073,-117.1566,'San Diego','America/Los_Angeles',20),
}

def get_json(url):
    req=urllib.request.Request(url,headers={'User-Agent':'BoringBets/1.0'})
    with urllib.request.urlopen(req,timeout=20) as response:return json.load(response)

def main():
    raw=json.loads(GAMES_PATH.read_text())
    games=raw.get('games',raw) if isinstance(raw,dict) else raw
    unique={g.get('venue',{}).get('id'):g.get('venue',{}).get('name') for g in games if g.get('venue',{}).get('id')}
    venues=[]
    for venue_id,name in sorted(unique.items()):
        payload={}
        try: payload=get_json(f'https://statsapi.mlb.com/api/v1/venues/{venue_id}?hydrate=location')
        except Exception as error: print(f'Venue {venue_id}: MLB lookup failed: {error}')
        item=(payload.get('venues') or [{}])[0]
        loc=item.get('location') or {}
        coords=loc.get('defaultCoordinates') or {}
        fallback=FALLBACKS.get(venue_id,(None,None,loc.get('city'),None,None))
        latitude=coords.get('latitude',fallback[0]);longitude=coords.get('longitude',fallback[1])
        city=loc.get('city') or fallback[2]
        timezone=(item.get('timeZone') or {}).get('id') or fallback[3]
        venues.append({'id':venue_id,'name':item.get('name') or name,'city':city,'state':loc.get('stateAbbrev'),'latitude':latitude,'longitude':longitude,'timezone':timezone,'altitude_ft':fallback[4],'center_field_bearing':None,'roof':None,'surface':None,'dimensions':None,'weather_ready':latitude is not None and longitude is not None})
    OUT_PATH.write_text(json.dumps({'venues':venues},indent=2))
    print(f'Wrote {len(venues)} venues to {OUT_PATH}')

if __name__=='__main__':main()
