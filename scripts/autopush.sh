#!/bin/bash
# Pousse automatiquement sur GitHub toute modif du projet qal (vérifie toutes les 20 s).
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
while true; do
  if [ -n "$(git status --porcelain)" ]; then
    sleep 5   # laisse finir les écritures en cours
    git add -A
    git commit -q -m "maj auto $(date '+%d/%m %H:%M')" && git push -q origin main \
      && echo "$(date '+%F %T') poussé" || echo "$(date '+%F %T') échec du push"
  fi
  sleep 20
done
