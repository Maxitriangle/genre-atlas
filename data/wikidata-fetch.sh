#!/usr/bin/env bash
# Fetch the five Wikidata extracts that wikidata-build-electronic.py reads.
#
# Each query is kept deliberately small: a single query joining labels, parents,
# inception, country and MusicBrainz ids is truncated by the server's time limit.
# Writes a_labels.csv, b_parents.csv, c_inception.csv, d_country.csv and e_mb.csv
# next to this script. Needs network access to query.wikidata.org.
set -euo pipefail
cd "$(dirname "$0")"

ENDPOINT=https://query.wikidata.org/sparql
AGENT='genre-atlas-build/1.0 (https://github.com/Maxitriangle/genre-atlas)'
GENRE='?genre wdt:P31 wd:Q188451 .'   # instance of (P31) = music genre (Q188451)

query() {
  case "$1" in
    # wikipedia_links counts every Wikimedia sitelink, not Wikipedia alone: that is
    # what the committed import file was built from, and it is only a tie-break
    # between candidate parents, so the wider count is kept for continuity.
    a_labels)    echo "SELECT ?genre ?label ?wikipedia_links WHERE {
                         $GENRE
                         ?genre rdfs:label ?label . FILTER(LANG(?label) = \"en\")
                         ?genre wikibase:sitelinks ?wikipedia_links .
                       }" ;;
    b_parents)   echo "SELECT ?genre ?parent WHERE { $GENRE ?genre wdt:P279 ?parent . }" ;;
    c_inception) echo "SELECT ?genre (YEAR(?date) AS ?year) WHERE { $GENRE ?genre wdt:P571 ?date . }" ;;
    d_country)   echo "SELECT ?genre ?country WHERE {
                         $GENRE
                         ?genre wdt:P495 ?c .
                         ?c rdfs:label ?country . FILTER(LANG(?country) = \"en\")
                       }" ;;
    e_mb)        echo "SELECT ?genre ?musicbrainz_id WHERE { $GENRE ?genre wdt:P8052 ?musicbrainz_id . }" ;;
  esac
}

# A timed-out query is NOT an error status: the endpoint returns 200, streams the
# rows it already had, then appends a Java stack trace to the same body. So a
# response is only accepted once it parses as CSV with the expected column count.
validate() {
  python3 - "$1" "$2" <<'PYCHECK'
import csv, io, sys
path, want = sys.argv[1], int(sys.argv[2])
rows = list(csv.reader(io.open(path, encoding='utf-8', newline='')))
if len(rows) < 2:
    sys.exit('no rows')
bad = [i for i, r in enumerate(rows) if len(r) != want]
if bad:
    sys.exit('truncated: %d malformed row(s), first on line %d' % (len(bad), bad[0] + 1))
if any('org.eclipse.jetty' in c or 'TimeoutException' in c for r in rows for c in r):
    sys.exit('truncated: server stack trace in body')
PYCHECK
}

# The endpoint also answers 429 or 502 under load, so each query gets five
# attempts with a widening pause. A rejected file is never left behind.
fetch() {
  local name=$1 cols=$2 attempt=1 pause=5 code why
  while [ "$attempt" -le 5 ]; do
    # the fallback must not sit inside the substitution, or a transfer that
    # dies after the status line reports a code like "200000"
    code=$(curl -sS -o "$name.csv.part" -w '%{http_code}' \
      -H 'Accept: text/csv' -H "User-Agent: $AGENT" \
      --get --data-urlencode "query=$(query "$name")" \
      "$ENDPOINT" --max-time 300) || code=000
    if [ "$code" = 200 ]; then
      if why=$(validate "$name.csv.part" "$cols" 2>&1); then
        mv "$name.csv.part" "$name.csv"
        printf '%-12s %6s rows\n' "$name" "$(($(wc -l < "$name.csv") - 1))"
        return 0
      fi
      why="200 but $why"
    else
      why="http=$code"
    fi
    echo "$name: $why, retrying in ${pause}s (attempt $attempt of 5)" >&2
    rm -f "$name.csv.part"
    sleep "$pause"; pause=$((pause * 2)); attempt=$((attempt + 1))
  done
  echo "$name: giving up" >&2
  return 1
}

fetch a_labels 3
fetch b_parents 2
fetch c_inception 2
fetch d_country 2
fetch e_mb 2
echo 'Done. Now run: python3 wikidata-build-electronic.py'
