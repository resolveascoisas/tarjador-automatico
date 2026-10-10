#!/bin/sh
cd "$(dirname "$0")"
PORT=8000
(sleep 1; (xdg-open "http://localhost:$PORT" || open "http://localhost:$PORT") >/dev/null 2>&1) &
python3 -m http.server $PORT
