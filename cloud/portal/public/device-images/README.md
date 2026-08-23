# Imágenes de equipos

El portal busca la foto del dispositivo en este orden y usa la primera que exista:

1. `/device-images/<marca>-<modelo>.png` (o `.jpg`) — slug en minúsculas, espacios y símbolos → `-`.
   Ej.: `hp-color-laserjet-mfp-e47528.png`, `samsung-sl-m4072fd.png`, `lexmark-x656de.png`
2. Coincidencia parcial por palabra clave del modelo (ver `src/lib/deviceImage.ts`, tabla `KEYWORD_IMAGES`).
3. Placeholder genérico: `generic-mfp.svg` (multifunción) o `generic-printer.svg`.

Para agregar la foto de un modelo alcanza con copiar el PNG acá con el nombre del slug — no hace falta tocar código.
