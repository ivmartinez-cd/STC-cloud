# STC Cloud - Project Specific Skills

Este archivo coordina las habilidades necesarias para mantener y evolucionar STC Cloud.

## 🛠️ Core Skills
- **snmp-monitor**: Experto en OIDs para HP, Lexmark, Samsung, Ricoh.
- **fastify-security**: Hardening de API, JWT, Rate Limiting y validación de esquemas.
- **crypto-binding**: Manejo de AES-256-GCM con derivación de hardware ID (Sección 9.1).
- **timescale-db**: Gestión de series temporales para contadores de impresión.

## 🎨 Frontend Design Skills (2026 Pro Max)
- **premium-ui-design**: Diseño de interfaces premium con colores vibrantes, paletas cuidadas (ej. HSL), dark modes elegantes, glassmorphism y animaciones fluidas.
- **modern-typography**: Implementación de fuentes modernas (ej. Inter, Roboto, Outfit) y jerarquía visual estricta para una lectura y estética de alto nivel.
- **dynamic-interactions**: Creación de una experiencia viva y "WOW" con micro-animaciones, efectos hover y transiciones suaves que fomenten la interacción.
- **pixel-perfect-components**: Construcción de sistemas de diseño sin componentes genéricos, evitando colores planos básicos y priorizando estéticas "state-of-the-art".

## 📋 Reglas de Desarrollo
1. **Security First**: Todo nuevo endpoint debe pasar por `agentAuth` o `portalAuth`.
2. **Audit Logs**: Acciones administrativas deben registrarse en la tabla `audit_logs`.
3. **Hardware Privacy**: Nunca subir archivos `config.enc` reales al repo.
4. **Agent Lifecycle**: Respetar el flujo de activación (Pending -> Active -> Revoked).
