#!/bin/bash

pi=${1:-mqtt-checkers}
tmp_folder="~/omada-checker"

echo "copying files to test machine (${pi}:${tmp_folder})"
rsync -au * ${pi}:${tmp_folder}
rsync .env ${pi}:${tmp_folder}
rsync .nvmrc ${pi}:${tmp_folder}

# echo running install script
# ssh ${pi} << EOF
#   cd ${tmp_folder}
#   ./scripts/install.sh
# EOF