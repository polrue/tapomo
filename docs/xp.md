# Tapomo — Diseño de XP, retos, logros y atajos

> Propuesta del 13-10-2026, **pendiente de revisión por Pol** antes de implementar la 0.3.2.
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
| Primer atajo masterizado (fase B) | Bronce |
| 10 atajos masterizados | Oro |

## Niveles

XP **acumulada** para llegar al nivel *n*: `100 × (n − 1)^1.8`.

| Nivel | XP | Recompensa (accesorio de Tapomo) |
|---|---|---|
| 2 | 100 | Lacito |
| 3 | 348 | Gafas redondas |
| 5 | 1.213 | Bufanda |
| 8 | 3.320 | Auriculares |
| 10 | 5.220 | Gorrito de lana |
| 15 | 11.562 | Pajarita |
| 20 | 20.033 | Capa |
| 25 | 30.506 | Gorro de chef |
| 30 | 42.886 | Corona de flores |
| 40 | 73.100 | Aureola de estrellitas |
| 50 | 110.243 | Tapomo dorado (solo color del brillo, no la forma) |

Los niveles intermedios no dan accesorio, pero sí la celebración de Tapomo. Los accesorios se eligen en Ajustes; regla del personaje: accesorios sí, cambiar la forma no.

### Simulación (días naturales hasta cada nivel)

Modelo con medias y sin azar (script en el scratchpad, `sim.py`):

| Perfil | Uso | XP por día activo | Nv 2 | Nv 3 | Nv 5 | Nv 10 | Nv 20 | Nv 30 |
|---|---|---|---|---|---|---|---|---|
| Ligero | 3 días/sem, 4.000 car., objetivo 60 %, 1,5 retos | ~90 | 2 | 9 | 36 | 150 (5 meses) | 590 | 3,5 años |
| Normal | 5 días/sem, 15.000 car., objetivo 90 %, 2,3 retos | ~195 | 1 | 2 | 9 | 37 (5 sem.) | 143 (5 meses) | 10 meses |
| Intenso | 6 días/sem, 40.000 car., objetivo siempre, 2,8 retos | ~260 | 1 | 2 | 5 | 24 | 89 | 6 meses |

- Un usuario intenso solo va 1,5 veces más rápido que uno normal, aunque escribe casi 3 veces más.
- El ligero tarda más porque usa la app menos días, no porque escriba despacio. Aun así, tiene su primer accesorio en la primera semana y la bufanda en el primer mes.

## Atajos: niveles por días de uso (fase B)

Cada atajo del catálogo tiene su propio nivel, según los **días distintos** en que lo has usado (no el número de veces):

| Días usados | Nivel | XP al llegar |
|---|---|---|
| 0 | Por descubrir (silueta en el álbum) | — |
| 1–3 | Aprendiendo | +5 |
| 4–7 | Cogiendo el tranquillo | +10 |
| 8–10 | Dominando | +15 |
| 11 o más | Masterizado | +25 |

- **Por qué días y no veces:** mide hábito, y además es imposible de farmear, porque 500 `Ctrl+C` en un día cuentan como un día.
- **Datos guardados por atajo:** solo `days_used` y `last_day`, sin historial por día. Un día cuenta si se usó al menos una vez.
- **Excepciones por idioma:** el uso de cualquier variante cuenta para el mismo atajo (en Word en español, `Ctrl+G` y `Ctrl+S` cuentan los dos para «Guardar»).
- **«Ya lo sé»:** marca el atajo como conocido para que deje de sugerirlo, pero **no da nivel**. El nivel solo llega usándolo.
- **Nunca baja.** Si dejas de usar un atajo durante meses, conserva su nivel.
- **Celebraciones sin ruido:**
  - Con Tapomo y globo, solo al llegar a «Masterizado» y la primera vez que usas un atajo que te sugirió («¡Ya usas `Ctrl+Mayús+T`!»).
  - Los demás cambios de nivel se ven en el álbum con un puntito de novedad.
  - Si en un mismo día suben muchos, se agrupan en un único globo («¡6 atajos nuevos en tu álbum!»).
- **Atajos cotidianos:** `Ctrl+C` y `Ctrl+V` llegarán a «Masterizado» en dos semanas en casi todo el mundo. Es bueno, porque da victorias tempranas. El aprendizaje de verdad está en los atajos menos habituales.
- **XP máxima del catálogo v1:** 30 atajos × 55 = 1.650 XP en total, una sola vez.

## XP retroactiva (usuarios con historial)

- Se calcula a partir de las ráfagas guardadas: escribir (con el mismo tope diario), objetivo diario cumplido y días seguidos.
- No se calculan retos, récords ni atajos, porque no existían.
- Se da de golpe con una única celebración: «Tapomo ha repasado tu historial: ¡empiezas en el nivel 6!».

## Preguntas abiertas para Pol

1. ¿Los nombres «Retos del día» y «Masterizado» (o «Maestro»)?
2. ¿Te parece bien el reparto, con un 55 % de escribir y un 45 % de hábitos?
3. ¿El ritmo de los niveles: el nivel 10 en unas 5 semanas para un usuario normal?
4. ¿Lista de accesorios y en qué niveles?
