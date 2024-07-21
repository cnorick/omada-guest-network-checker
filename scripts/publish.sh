#!/bin/bash

pi=${1:-welcome}

echo "copying files to test machine (${pi})"
rsync -au * ${pi}:~/omada-checker
rsync .env ${pi}:~/omada-checker
rsync .nvmrc ${pi}:~/omada-checker