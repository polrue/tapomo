# Licencia de arte y marca de Tapomo — propuesta

> **Estado: propuesta para que Pol decida.** No se aplica hasta que Pol la apruebe; hoy todo el repositorio está bajo GPL-3.0-or-later.

## Por qué separar el arte del código

- El **código** debe seguir siendo GPL-3.0: cualquiera puede leerlo, compilarlo, mejorarlo y redistribuirlo. Es lo que da confianza a una app que escucha el teclado.
- El **personaje** (Tapomo, su forma, su cara, sus animaciones, el armario y las medallas) y el **nombre** son lo que hace reconocible el proyecto. Si alguien publica una copia modificada —por ejemplo, con telemetría— con el mismo nombre y la misma mascota, los usuarios no podrían distinguirla de la oficial.

## Propuesta

1. **Código:** sigue en GPL-3.0-or-later. Sin cambios.
2. **Arte:** el SVG de Tapomo y sus variantes, en `ui/mascot.js`, `ui/wardrobe.js`, `ui/badges-art.js`, `assets/`, `web/img/` y `lab/`, pasa a **CC BY-NC-ND 4.0**.
   - Se puede compartir tal cual, citando la fuente.
   - No se permite el uso comercial ni distribuir versiones modificadas.
   - Los forks de la app tendrían que usar su propia mascota, o pedir permiso.
   - **Alternativa más abierta:** CC BY-SA 4.0, que permite modificar el arte pero obliga a citar la fuente y a compartir igual. No protege la identidad.
3. **Nombre y logotipo:** una política de marca corta, en `TRADEMARKS.md`.
   - Puedes decir que tu proyecto «está basado en Tapomo».
   - No puedes llamar «Tapomo» a una versión modificada ni usar la mascota para presentarla como oficial.
   - Registrar la marca (EUIPO, unos 850 €) es opcional y caro. La política escrita ya ayuda en las tiendas de apps y en GitHub.
4. **Compatibilidad con GPL:**
   - El arte va dentro del instalador como datos, no como código enlazado.
   - Mezclar una licencia CC para recursos con código GPL es habitual (juegos libres, por ejemplo), siempre que el README deje claro qué cubre cada licencia.
   - Las tiendas (Microsoft Store, winget) aceptan este modelo.

## Qué habría que hacer si se aprueba

- Añadir `LICENSE-ART` con el texto de CC BY-NC-ND 4.0 y `TRADEMARKS.md`.
- Añadir una cabecera breve en los archivos de arte: «Arte de Tapomo © Pol Rué, CC BY-NC-ND 4.0».
- Añadir en el README una sección «Licencias» con una tabla: código → GPL; arte y marca → CC BY-NC-ND y la política de marca.
- Avisar a quien haya contribuido arte. Hasta ahora solo hay contribuciones de Pol y de Claude a petición de Pol, así que no hace falta pedir permiso a nadie.
