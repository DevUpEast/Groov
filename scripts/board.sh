#!/usr/bin/env bash
# GitHub Projects helper: `source scripts/board.sh; board_status 19 "In Progress"`
# Project "Groov Roadmap" (#2, owner DevUpEast). Status option ids are stable.
PROJECT_ID="PVT_kwHODFdkCs4Bm6um"
STATUS_FIELD="PVTSSF_lAHODFdkCs4Bm6umzhlhugI"
declare -A STATUS_OPT=( ["Backlog"]="35fb265a" ["Todo"]="24a61247" ["Blocked: needs Isaac"]="4ef80794" ["In Progress"]="a5ff40f5" ["In Review"]="0e4ee860" ["Done"]="fc943356" )
board_item_id() { gh project item-list 2 --owner DevUpEast --limit 300 --format json --jq ".items[] | select(.content.number == $1) | .id"; }
board_status() {
  local item; item="$(board_item_id "$1")"
  if [ -z "$item" ]; then
    item="$(gh project item-add 2 --owner DevUpEast --url "https://github.com/DevUpEast/Groov/issues/$1" --format json --jq .id)"
  fi
  gh project item-edit --project-id "$PROJECT_ID" --id "$item" --field-id "$STATUS_FIELD" --single-select-option-id "${STATUS_OPT[$2]}" >/dev/null && echo "#$1 -> $2"
}
