# STC Cloud - Production Readiness Guide
**Versión:** 1.3.1 | **Departamento:** IT / Infraestructura | **Fecha:** Mayo 2026

Este documento detalla la arquitectura, seguridad y requisitos de red de **STC Cloud** para su validación previa al despliegue en producción.

## 1. Arquitectura del Sistema
STC Cloud utiliza una arquitectura híbrida de alta disponibilidad:
- **Agente (DCA):** Binario ligero basado en Node.js que se ejecuta como servicio de Windows.
- **Backend:** API REST en Fastify con WebSockets persistentes para comunicación bidireccional.
- **Base de Datos:** PostgreSQL (Nube) para persistencia y SQLite (Local) para redundancia offline.

## 2. Comunicaciones y Red (Firewall)
Para el correcto funcionamiento, los agentes deben tener salida a internet por los siguientes puertos:
| Destino | Puerto | Protocolo | Función |
| :--- | :--- | :--- | :--- |
| `stc-cloud-api.render.com` | 443 | HTTPS/WSS | Heartbeat, Logs y Comandos |
| `127.0.0.1` | 8000 | TCP (Local) | Bridge de Diagnóstico Local |

### Ciclos de Monitoreo STC (Engine Loops)
STC Cloud implementa una arquitectura de triple bucle para garantizar la integridad de los datos:
1. **Bucle de Latido (60s):** Notificación de estado y sincronización de logs en tiempo real.
2. **Bucle de Sincronización (60s):** Transmisión de lecturas acumuladas desde la base de datos local.
3. **Bucle de Escaneo (15m):** Interrogación SNMP profunda a dispositivos (configurable).

## 3. Seguridad y Cifrado
- **Autenticación:** JWT (JSON Web Tokens) con rotación obligatoria de Refresh Tokens.
- **Aislamiento:** Cada agente tiene un identificador de hardware único (`hardwareId`) y una llave de activación de un solo uso de 64 caracteres.
- **Almacenamiento Local:** Los datos en tránsito se almacenan en una base de datos SQLite local cifrada en la carpeta `AppData`.

## 4. Auditoría y Logs
El sistema integra una **Terminal de Diagnóstico Remota** que permite:
- Ejecución de `ping` y `snmp-check` en tiempo real desde el portal.
- Exportación de logs en formato oficial DD/MM/AAAA con zona horaria Argentina (UTC-3).

---
**Validado por:** Antigravity AI Architect
