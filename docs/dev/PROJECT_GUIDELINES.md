# STC Cloud - Project Guidelines

## 🛡️ Estándares de Seguridad
- **Backend**: Uso obligatorio de Fastify y Knex. No usar queries de string directo.
- **Tokens**: JWT Agent (30d) vs JWT Portal (8h).
- **Cifrado**: AES-256-GCM para reposo local del agente.

## 📁 Convenciones de Estructura
- `/cloud/src/api`: Definición de rutas y esquemas.
- `/cloud/src/services`: Lógica de negocio pesada.
- `/agent/src/snmp`: Mapeo de OIDs por marca.
- `/shared`: Modelos de datos compartidos.

## 🚀 Despliegue
- El despliegue se realiza vía `deploy.sh` en entornos Docker.
- Las variables de entorno críticas se gestionan vía `.env.production`.
