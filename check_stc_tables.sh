#!/bin/bash
docker exec -e PGPASSWORD=stc_secret stc_postgres psql -U stc_admin -d stc_cloud -c "\dt" -c "SELECT count(*) FROM readings;" 2>&1
