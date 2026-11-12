#!/bin/sh
# Arranca el servicio MiTV fetch como root, sin jailer, para que
# bootstrap-node.js pueda registrar su rol LS2 (pushRole solo si uid 0).
cd /media/developer/apps/usr/palm/services/com.mitv.webos.fetch || exit 1
export NODE_PATH=/usr/palm/frameworks:/usr/lib/nodejs:/usr/lib/node_modules
exec /usr/bin/node /usr/palm/services/jsservicelauncher/bootstrap-node.js \
  -- /tmp/run-js-service-no-cgroup /var/palm/ls2-dev \
  /media/developer/apps/usr/palm/services/com.mitv.webos.fetch --disable-timeouts