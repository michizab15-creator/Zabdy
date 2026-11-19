# Sapti — Web app

Sitio web accesible de Sapti (consultoría en estrategia, operaciones y crecimiento), construido a partir del diseño "Consulting Web Page" y ampliado a una aplicación completa.

## Qué incluye

- **Sitio público** en español, accesible (WCAG AA: navegación por teclado, enlace "saltar al contenido", foco visible, etiquetas en todos los campos, mensajes de error anunciados, contraste suficiente, modo oscuro y respeto a "reducir movimiento").
- **Diagnóstico empresarial**: 12 preguntas en 3 áreas (Estrategia, Operaciones, Crecimiento) con puntaje, barras por área, prioridades y recomendaciones. Se puede imprimir/guardar en PDF y adjuntar al formulario de contacto.
- **Calculadora de impacto**: estima el costo anual de las ineficiencias y el valor recuperable.
- **Formulario de contacto** con validación, anti-spam (honeypot + límite por IP) y consentimiento.
- **Panel del equipo** en `/admin` (protegido con contraseña): lista de prospectos, búsqueda, filtros, embudo de estados (nuevo → contactado → reunión → propuesta → ganado/perdido), notas internas, métricas y exportación CSV.
- **PWA** instalable (manifest + service worker).

## Ejecutar localmente

```bash
ADMIN_PASSWORD=algo-seguro node server.js
```

Abre http://localhost:3000 y el panel en http://localhost:3000/admin.

No tiene dependencias externas (solo Node.js ≥ 18).

## Variables de entorno

| Variable | Uso |
|---|---|
| `ADMIN_PASSWORD` | Contraseña del panel `/admin` (obligatoria para usar el panel). |
| `SESSION_SECRET` | Firma de las sesiones. Si falta se genera una al arrancar. |
| `DATA_DIR` | Carpeta donde se guarda `leads.json` (por defecto `./data`). |

## Despliegue

Desplegado en Render como Web Service (ver `render.yaml`). Cada `git push` a `main` vuelve a desplegar.

> Nota: en el plan gratuito de Render el disco no es persistente: los prospectos guardados se pierden al redesplegar o reiniciar el servicio. Exporta el CSV con regularidad, o agrega un disco persistente (plan de pago) y apunta `DATA_DIR` a él.
