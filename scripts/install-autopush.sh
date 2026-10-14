#!/bin/bash
# À lancer UNE fois : installe le push automatique (démarre aussi à chaque ouverture de session).
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.qiyoune.qal-autopush.plist"
chmod +x "$DIR/scripts/autopush.sh"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.qiyoune.qal-autopush</string>
  <key>ProgramArguments</key><array><string>$DIR/scripts/autopush.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/qal-autopush.log</string>
  <key>StandardErrorPath</key><string>/tmp/qal-autopush.log</string>
</dict></plist>
PL
UID_=$(id -u)
launchctl bootout gui/$UID_/com.qiyoune.qal-autopush 2>/dev/null
launchctl unload "$PLIST" 2>/dev/null
launchctl bootstrap gui/$UID_ "$PLIST" || launchctl load "$PLIST"
launchctl enable gui/$UID_/com.qiyoune.qal-autopush
launchctl kickstart -k gui/$UID_/com.qiyoune.qal-autopush
sleep 2
launchctl print gui/$UID_/com.qiyoune.qal-autopush | grep -E "state =|last exit|pid =" 
echo "✦ push automatique activé. Journal : tail -f /tmp/qal-autopush.log"
echo "  Pour l'arrêter : launchctl bootout gui/$(id -u)/com.qiyoune.qal-autopush"
