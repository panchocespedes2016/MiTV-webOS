# Roles Luna del servicio MiTV fetch — instalación en la TV

Estos archivos viven FUERA del paquete de la app: van en el sistema de la TV,
no dentro del `.ipk`. Sin ellos el servicio no puede arrancar ni la app puede
llamarlo.

## Qué es cada archivo

- `com.mitv.webos.app.json` — rol de la APP. Va en
  `/var/luna-service2/roles.d/`. Permite que `com.mitv.webos` llame en salida
  a los servicios `com.mitv.webos-*`.
- `com.mitv.webos.fetch.service.json` — rol del SERVICIO. Va en
  `/var/luna-service2/roles.d/`. Permite que `com.mitv.webos.fetch` reciba
  (inbound) y emita (outbound) por el bus.
- `services.d/com.mitv.webos.fetch.service` — activación D-Bus. Va en
  `/var/luna-service2/services.d/`. Su `Exec` apunta a `run-root.sh`, que
  arranca el servicio como root, sin jailer (ver
  `../com.mitv.webos.fetch/run-root.sh`).

## Por qué dos roles con nombres distintos

`ls-hubd` lee `/var/luna-service2/roles.d/` y distingue por el sufijo:
`.app.json` para apps, `.service.json` para servicios. El nombre anterior
(`com.mitv.webos.fetch.json`, sin sufijo, esquema de servicio) NO funcionaba
y esa es una de las razones por las que el servicio no arrancaba.

## Instalación (en la TV, como root)

```sh
cp com.mitv.webos.app.json com.mitv.webos.fetch.service.json /var/luna-service2/roles.d/
cp services.d/com.mitv.webos.fetch.service /var/luna-service2/services.d/
# el servicio debe estar en /media/developer/apps/usr/palm/services/com.mitv.webos.fetch/
# (lo instala el .ipk) con run-root.sh ejecutable; luego:
kill -HUP $(pidof ls-hubd)
luna-send -n 1 -f luna://com.mitv.webos.fetch/ping '{}'
# esperado: {"returnValue": true, "service": "com.mitv.webos.fetch"}
```

Nota: en la TV que corre hoy, el sistema de archivos raíz está al 100% (0 KB
libres). Estos archivos van en `/var`, que admite escritura, y el servicio
arranca vía `run-root.sh` sin crear nada en la raíz.
