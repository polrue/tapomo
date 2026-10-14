# Tapomo — Diseño de XP, retos, logros y atajos

> Propuesta del 13-10-2026, **aprobada por Pol el 14-10-2026**. Es el diseño de la 0.3.2.
> Sustituye a los números provisionales de `roadmap.md` §0.3.2 en cuanto se apruebe.

## Principios

1. **Constancia antes que volumen.** Quien escribe mucho sube algo más rápido, pero no 8 veces más rápido. Por eso escribir tiene rendimiento decreciente y tope diario.
2. **Nada se pierde nunca.** Ni XP, ni niveles, ni ligas, ni niveles de atajos.
3. **Nada se puede farmear.** Toda fuente tiene tope diario o se da una sola vez.
4. **Todo es local** y se guarda como `xp_events(ts, kind, amount)`, sin texto ni teclas.
5. **Siempre en positivo.** No hay retos fallados: los que no se hacen desaparecen a medianoche sin aviso.

## Fuentes de XP

| Fuente | XP | Tope | Notas |
|---|---|---|---|
| Escribir | 1 por cada 100 caracteres hasta 10.000; después, 1 por cada 500 | **150/día** | Solo caracteres dentro de ráfagas |
| Objetivo diario cumplido | +30 | 1/día | |
| Días seguidos | +2 por día de racha | **+20/día** | Pequeño a propósito: perder la racha no duele en la XP |
| Récord personal | +10 | 2/día | Pico de 10 s, mejor racha sin borrar |
| Reto del día | +15 cada uno | 3/día | Ver más abajo |
| Pleno (los 3 retos) | +15 | 1/día | |
| Atajos, fase A (contador) | 1 por cada 10 atajos | **10/día** | |
| Atajos, fase B (niveles) | +5 / +10 / +15 / +25 | Una vez por atajo y nivel | Ver «Atajos» |
| Logro | +25 bronce / +50 plata / +100 oro | Una vez | |
| Lección (0.4) | +10, más +10 con un 95 % de precisión la primera vez | — | Se ajusta en la 0.4 |

Un día normal da unos **200 XP**: algo más de la mitad viene de escribir y el resto de los hábitos.

**Cambios respecto al borrador del roadmap:**
- El objetivo diario sube de +20 a +30, porque es el hábito central.
- La racha baja de +5 (máx. 50) a +2 (máx. 20). Con +50, romper la racha costaba más que un día entero de escritura de un usuario ligero, y eso se siente como un castigo.
- Escribir ya tiene tope.

## Retos del día

- Hay **3 cada día**, elegidos de un repertorio y **calibrados con tu propia media de los últimos 14 días**, nunca con cifras absolutas. Así son alcanzables tanto si escribes a 25 ppm como a 90.
- Se ven en la pestaña Hoy como tarjetitas. Al completarlos se marcan con un sello de Tapomo. Los que no se hacen no aparecen como fallados.
- Repertorio inicial:
  - Haz 3 ráfagas de más de 1 minuto.
  - Supera tu ritmo medio en una ráfaga.
  - Escribe 300 caracteres seguidos sin borrar (ajustado a tu media).
  - Cumple el objetivo antes de las 13:00 (solo si sueles cumplirlo).
  - Escribe en 3 programas distintos.
  - Usa 10 atajos (con atajos activados).
  - Usa hoy el atajo que aprendiste ayer (fase B).
  - Haz una lección (0.4).
- **Prohibido** cualquier reto que empuje a escribir más tiempo del sano, como «escribe 2 horas». El volumen ya lo premia el objetivo diario.
- Mientras el usuario tenga menos de 3 días de historial, los retos son de bienvenida y muy fáciles.

## Logros (insignias)

Se amplía la lista de la 0.3.3 con niveles de rareza:

| Logro | Rareza |
|---|---|
| Primera ráfaga | Bronce |
| 100 ráfagas | Bronce |
| 1.000 ráfagas | Plata |
| 10.000 ráfagas | Oro |
| 1.000 caracteres sin borrar | Plata |
| 5.000 sin borrar | Oro |
| 10.000 caracteres en un día | Plata |
| Primer récord batido | Bronce |
| Superándote (zona morada) 5 veces | Plata |
| 7 días seguidos | Bronce |
| 30 días seguidos | Plata |
| 100 días seguidos | Oro |
| Madrugador (antes de las 8) | Bronce |
| Búho (después de las 23) | Bronce |
| Una semana entera con el objetivo cumplido | Plata |
| Primer pleno de retos | Bronce |
| 30 plenos | Plata |
| Coronado (cara de corona) | Plata |
| Ni tocas el ratón (100 atajos en un día) | Plata |
| Maestro de atajos (1.000 atajos) | Oro |
| Primer atajo dominado (fase B) | Bronce |
| 10 atajos dominados | Oro |

## Niveles

> Aprobado por Pol el 14-10-2026: curva y premios.

XP **acumulada** para llegar al nivel *n*: `47 × (n − 1)^1.8`.

- **Ritmo:**
  - Al principio se sube rápido: el primer día, 2 niveles.
  - Después se espacia.
  - Un usuario normal llega al nivel 50 en un año.
  - No hay tope: se puede seguir subiendo después del 50.
- **Premios:**
  - Hay uno cada 3 niveles y otro final en el 50.
  - En la primera semana, un usuario normal recibe como mucho un premio, y uno intenso, dos.

| Nivel | XP | Premio |
|---|---|---|
| 4 | 340 | Lacito |
| 7 | 1.182 | Gafas redondas |
| 10 | 2.453 | Skin fresa |
| 13 | 4.117 | Bufanda |
| 16 | 6.153 | Auriculares |
| 19 | 8.543 | Skin matcha |
| 22 | 11.274 | Gorrito de lana |
| 25 | 14.338 | Pajarita |
| 28 | 17.724 | Skin mango |
| 31 | 21.425 | Capa |
| 34 | 25.434 | Gorro de chef |
| 37 | 29.747 | Skin arándano |
| 40 | 34.357 | Corona de flores |
| 43 | 39.260 | Skin sésamo negro |
| 46 | 44.451 | Aureola de estrellitas |
| 50 | 51.814 | Skin Tapomo dorado |

- **Reglas del personaje:**
  - Los accesorios se añaden encima de Tapomo.
  - Las skins solo cambian el color del mochi, nunca la forma.
- **Ajustes:** ahí se eligen el accesorio y la skin.
- **Niveles sin premio:** también tienen la celebración de Tapomo.
- **Próximo premio:** siempre se ve, con su barra de progreso («Gafas redondas en el nivel 7»).

### Simulación (días naturales hasta cada nivel)

Es un modelo con medias y sin azar:

| Perfil | Uso | XP por día activo | Nv 4 | Nv 7 | Nv 10 | Nv 20 | Nv 30 | Nv 40 | Nv 50 |
|---|---|---|---|---|---|---|---|---|---|
| Ligero | 3 días/sem., 4.000 car., objetivo 60 %, 1,5 retos | ~90 | 8 | 30 | 64 | 241 | 520 | 890 | 1.340 (3,7 años) |
| Normal | 5 días/sem., 15.000 car., objetivo 90 %, 2,3 retos | ~195 | 2 | 9 | 17 | 67 | 144 | 247 | 372 (1 año) |
| Intenso | 6 días/sem., 40.000 car., objetivo siempre, 2,8 retos | ~260 | 2 | 5 | 11 | 43 | 90 | 155 | 233 (8 meses) |

- **Uso de la app:** un usuario intenso solo va 1,6 veces más rápido que uno normal, aunque escribe casi 3 veces más.
- **Usuario ligero:**
  - Tarda más porque abre la app menos días, no porque escriba despacio.
  - Aun así, recibe su primer premio en la primera semana y el nivel 10 a los 2 meses.

## Atajos: niveles por días de uso (fase B)

Cada atajo del catálogo tiene su propio nivel, según los **días distintos** en que lo has usado (no el número de veces):

| Días usados | Nivel | XP al llegar |
|---|---|---|
| 0 | Por descubrir (silueta en el álbum) | — |
| 1–3 | Aprendiendo | +5 |
| 4–7 | Cogiendo el tranquillo | +10 |
| 8–10 | Casi lo tienes | +15 |
| 11 o más | Dominado | +25 |

- **Por qué días y no veces:** mide hábito, y además es imposible de farmear, porque 500 `Ctrl+C` en un día cuentan como un día.
- **Datos guardados por atajo:** solo `days_used` y `last_day`, sin historial por día. Un día cuenta si se usó al menos una vez.
- **Excepciones por idioma:** el uso de cualquier variante cuenta para el mismo atajo (en Word en español, `Ctrl+G` y `Ctrl+S` cuentan los dos para «Guardar»).
- **«Ya lo sé»:** marca el atajo como conocido para que deje de sugerirlo, pero **no da nivel**. El nivel solo llega usándolo.
- **Nunca baja.** Si dejas de usar un atajo durante meses, conserva su nivel.
- **Celebraciones sin ruido:**
  - Con Tapomo y globo, solo al llegar a «Dominado» y la primera vez que usas un atajo que te sugirió («¡Ya usas `Ctrl+Mayús+T`!»).
  - Los demás cambios de nivel se ven en el álbum con un puntito de novedad.
  - Si en un mismo día suben muchos, se agrupan en un único globo («¡6 atajos nuevos en tu álbum!»).
- **Atajos cotidianos:** `Ctrl+C` y `Ctrl+V` llegarán a «Dominado» en dos semanas en casi todo el mundo. Es bueno, porque da victorias tempranas. El aprendizaje de verdad está en los atajos menos habituales.
- **XP máxima del catálogo v1:** 30 atajos × 55 = 1.650 XP en total, una sola vez.

## XP retroactiva (usuarios con historial)

- Se calcula a partir de las ráfagas guardadas: escribir (con el mismo tope diario), objetivo diario cumplido y días seguidos.
- No se calculan retos, récords ni atajos, porque no existían.
- Se da de golpe con una única celebración: «Tapomo ha repasado tu historial: ¡empiezas en el nivel 6!».

## Decisiones de Pol (14-10-2026)

1. **Nombres:**
   - «Retos del día».
   - Niveles de atajo: «Aprendiendo», «Cogiendo el tranquillo», «Casi lo tienes» y «Dominado».
2. **Reparto:** se queda en un 55 % escribir y un 45 % hábitos.
3. **Ritmo de los niveles:** el usuario normal llega al nivel 50 en un año. Ver «Niveles».
4. **Premios:** uno cada 3 niveles, con accesorios y skins.
