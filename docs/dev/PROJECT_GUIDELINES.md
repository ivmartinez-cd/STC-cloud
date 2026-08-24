# STC Cloud - Project Guidelines

> **En migración (ver [ADR-001](../adr/001-adoptar-architecture-guide.md)):** el
> estándar de arquitectura y convenciones de código vigente para código nuevo es
> [`ARCHITECTURE_GUIDE.md`](./ARCHITECTURE_GUIDE.md), migrando por fases según
> [`ARCHITECTURE_MIGRATION_PLAN.md`](./ARCHITECTURE_MIGRATION_PLAN.md). La
> estructura de "Convenciones de Estructura" de abajo describe el estado
> **actual, no migrado todavía** — no agregar código nuevo siguiéndola como si
> fuera el target.

## 🛡️ Estándares de Seguridad
- **Backend**: Uso obligatorio de Fastify y Knex. No usar queries de string directo.
- **Tokens**: JWT Agent (30d) vs JWT Portal (8h).
- **Cifrado**: AES-256-GCM para reposo local del agente.

## 📁 Convenciones de Estructura (estado actual, pre-migración)
- `/cloud/src/api`: Definición de rutas y esquemas.
- `/cloud/src/services`: Lógica de negocio pesada.
- `/cloud/src/shared/domain/errors`: jerarquía de errores base
  (`AppError`/`DomainError`/`ApplicationError`/`InfrastructureError`) — usar para
  código nuevo; el código existente migra a esto módulo por módulo.
- `/agent/src/snmp`: Mapeo de OIDs por marca.
- `/shared`: Modelos de datos compartidos.

## 🚀 Despliegue
- El despliegue se realiza vía `deploy.sh` en entornos Docker.
- Las variables de entorno críticas se gestionan vía `.env.production`.
