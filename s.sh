#!/bin/bash
set -e
cd /tmp
rm -rf merl-temp
git clone -b claude/merl-standalone-N8bWh --single-branch https://github.com/welinrj/vcap2-online-geodatabase.git merl-temp
cd merl-temp
rm -rf .git s.sh
git init -b main
git add -A
git commit -m "feat: initial standalone MERL Dashboard"
git remote add origin https://github.com/welinrj/merl-dashboard.git
git push -u origin main --force
echo ""
echo "Done! MERL Dashboard pushed to https://github.com/welinrj/merl-dashboard"
