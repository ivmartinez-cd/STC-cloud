#!/bin/bash
cd ~/proyectos/stc-cloud
docker cp fresh_dump_20260819.sql stc_postgres:/tmp/restore.sql
docker exec -e PGPASSWORD=stc_secret stc_postgres psql -U stc_admin -d stc_cloud -f /tmp/restore.sql 2>&1 | tail -30
