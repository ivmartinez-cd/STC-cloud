#!/bin/bash
cd ~/proyectos/stc-cloud
docker exec -e PGPASSWORD=stc_secret stc_postgres psql -U stc_admin -d stc_cloud -f /tmp/restore.sql 2>&1 | grep -i "^psql:.*ERROR" | sort | uniq -c
