#!/bin/bash
set -e
cd ~/proyectos/stc-cloud
docker run --rm \
  -v stc-cloud_pgdata:/to \
  -v "$(pwd)/pgdata_backup.tar.gz:/backup.tar.gz" \
  alpine sh -c "rm -rf /to/* /to/.[!.]* 2>/dev/null; tar xzf /backup.tar.gz -C /to"
echo "OK"
