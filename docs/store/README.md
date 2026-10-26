# Enviar Tapomo a la Microsoft Store, paso a paso

Producto reservado en Partner Center: **Tapomo** (`PolRu.Tapomo`), tipo «Aplicación MSIX o PWA».
Todo lo que hay que pegar está en esta carpeta.

| Qué | Dónde |
|---|---|
| Paquete para subir | Artefacto `tapomo-msix` del workflow «Microsoft Store package» (GitHub → Actions): `Tapomo_1.0.0_x64.msix`, **el que no lleva `_test`** |
| Paquete para probar antes en tu PC | El mismo artefacto, carpeta `test/` (instrucciones en `test/LEEME.txt`) |
| Textos de la ficha (5 idiomas) | `listing-es.md`, `listing-en.md`, `listing-ca.md`, `listing-fr.md`, `listing-de.md` |
| Notas para los revisores | `certification-notes.md` |
| Cuestionario de edades | `age-rating.md` |
| Capturas | `img/screenshot-*.png` |
| Logos de la ficha | `img/boxart-1080x1080.png` (1:1) e `img/poster-720x1080.png` (2:3) |

## 0. Antes de enviar

1. Prueba el paquete `test/` en tu PC siguiendo `test/LEEME.txt`.
2. Comprueba que https://tapomo.app/privacy.html se abre (la Store la revisa).

## 1. Precios y disponibilidad

- **Mercados:** todos.
- **Visibilidad:** pública.
- **Publicación:** «Publicar manualmente» si quieres elegir el día (después de certificar aparece un botón «Publicar ahora»); si no, «tan pronto como se certifique».
- **Precio:** gratis. Sin versión de prueba.

## 2. Propiedades

- **Categoría:** Productividad (sin subcategoría).
- **URL de la política de privacidad:** `https://tapomo.app/privacy.html`
- **Sitio web:** `https://tapomo.app`
- **Información de contacto de soporte:** `https://github.com/polrue/tapomo/issues`
- **Requisitos del sistema → Hardware necesario:** Teclado. (Ratón: recomendado.)
- **Declaraciones del producto:** deja todas sin marcar, salvo que haya alguna marcada por defecto que no cambie nada. No marques la de accesibilidad (no está auditada).

## 3. Clasificaciones por edades

Sigue `age-rating.md`. Resultado esperado: PEGI 3 / ESRB Everyone.

## 4. Paquetes

- Arrastra `Tapomo_1.0.0_x64.msix`.
- Familias de dispositivos: solo **Windows 10/11 Desktop**.
- Si pregunta por la capacidad restringida **runFullTrust**, pega esto:

```
Tapomo is a Win32 desktop app (Tauri + WebView2) packaged with the Desktop Bridge. It needs runFullTrust to measure typing speed system-wide: a low-level keyboard hook timestamps keystrokes and classifies each one into a category (letter, space, backspace...) without storing characters or text, and UI Automation is used only to detect password fields and pause there. Details: https://tapomo.app/privacy.html
```

## 5. Fichas de Store (una por idioma)

Partner Center crea una ficha por cada idioma del paquete: español, inglés, catalán, francés y alemán.
En cada una, copia los campos del `listing-xx.md` correspondiente:

- Descripción del producto, Novedades de esta versión, Características del producto, Términos de búsqueda, Copyright, Términos de licencia adicionales, Desarrollado por.
- **Capturas de pantalla (Escritorio):** sube las de `img/` (la primera es la que más se ve).
- **Logotipos de Store:** 1:1 → `boxart-1080x1080.png`, 2:3 → `poster-720x1080.png`.
- La descripción corta solo se usa en algunas vistas; pégala si aparece el campo.

Truco: rellena primero la ficha en español; en las demás puedes reutilizar las mismas imágenes.

## 6. Opciones de envío

- **Notas para la certificación:** pega `certification-notes.md`.
- Envía. La certificación suele tardar de unas horas a 3 días laborables.

## 7. Después de la aprobación

- Avísame: publico la 1.0.0 también en GitHub (mismo código) y añadimos el botón de la Store en la web y el README.
- Cada versión nueva se sube igual: el workflow genera el `.msix` en cada etiqueta `v*`, y en Partner Center se crea un envío nuevo con ese paquete.
