#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/interaction-assessment"
DATABASE_NAME="interaction_mvp"
DATABASE_USER="interaction_app"
DATE="$(date +%Y-%m-%d_%H-%M-%S)"

mkdir -p "$BACKUP_DIR"
pg_dump -U "$DATABASE_USER" -d "$DATABASE_NAME" -F c -f "$BACKUP_DIR/${DATABASE_NAME}_${DATE}.dump"
find "$BACKUP_DIR" -type f -name "${DATABASE_NAME}_*.dump" -mtime +30 -delete

echo "Backup created: $BACKUP_DIR/${DATABASE_NAME}_${DATE}.dump"
