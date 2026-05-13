# STC Cloud - Project Specific Skills

Este archivo coordina las habilidades necesarias para mantener y evolucionar STC Cloud.

## 🛠️ Core Skills
- **snmp-monitor**: Experto en OIDs para HP, Lexmark, Samsung, Ricoh.
- **fastify-security**: Hardening de API, JWT, Rate Limiting y validación de esquemas.
- **crypto-binding**: Manejo de AES-256-GCM con derivación de hardware ID (Sección 9.1).
- **timescale-db**: Gestión de series temporales para contadores de impresión.

## 📋 Reglas de Desarrollo
1. **Security First**: Todo nuevo endpoint debe pasar por `agentAuth` o `portalAuth`.
2. **Audit Logs**: Acciones administrativas deben registrarse en la tabla `audit_logs`.
3. **Hardware Privacy**: Nunca subir archivos `config.enc` reales al repo.
4. **Agent Lifecycle**: Respetar el flujo de activación (Pending -> Active -> Revoked).
