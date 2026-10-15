# Códigos de mecenas

Quien apoya Tapomo (Ko-fi o GitHub Sponsors) recibe un **código de mecenas** que desbloquea un agradecimiento cosmético en la app: la skin «Mecenas» y la insignia «Mecenas». **Nada de Tapomo se bloquea nunca detrás de un pago**: todo sigue siendo GPL y gratis.

- Generar un código: `node packaging/supporter/make-code.mjs <número de mecenas>`. Usa la clave privada `~/data/secrets/tapomo-supporter-ed25519.pem` (o `TAPOMO_SUPPORTER_KEY`).
- **Guarda una copia de esa clave fuera del servidor**: sin ella no se pueden hacer códigos nuevos (los ya entregados siguen funcionando).
- La app comprueba el código sin conexión con la clave pública (`public.hex`, copiada en `src-tauri/src/supporter.rs`).
- Ko-fi permite entregar el código automáticamente como «producto digital» o en el mensaje de agradecimiento.
- Como el código es abierto, alguien podría compilar Tapomo quitando la comprobación: es un sistema de confianza, pensado para dar las gracias, no para impedir nada.
