# Estrategia de Instalación: Monitor STC Cloud

Este documento recopila el brainstorming y el roadmap para la creación de un instalador profesional basado en el estándar de HP SDS Manager.

---

## 1. Análisis de Referencia (HP SDS Manager)
La guía de HP describe una aplicación que:
- **Detección de Entorno**: Verifica requisitos (Windows, conexión).
- **Proceso Guiado**: Pantallas de bienvenida, términos, y configuración.
- **Configuración Post-Instalación**: Configuración de Proxy, comunidad SNMP e intervalos de escaneo.
- **Servicio en Segundo Plano**: Se instala como un servicio de Windows (DCA - Data Collection Application).
- **Consola de Estado**: Una pequeña aplicación de bandeja (tray) o ventana para ver si el servicio está corriendo y cuándo fue el último escaneo.

## 2. Propuesta para STC Cloud Monitor

### Fase A: El Instalador (Setup)
Usaremos un framework como **Inno Setup** para empaquetar el agente.
1. **Bienvenida**: Logo de STC Cloud y explicación del propósito.
2. **Requisitos**: Verificación automática de privilegios de administrador.
3. **Clave de Activación**: Campo obligatorio para ingresar la `KEY` antes de finalizar.
4. **Instalación del Servicio**: Registro automático de `STCCloudMonitor.exe` como servicio usando `node-windows`.

### Fase B: Interfaz de Configuración Local (Monitor UI)
Propondremos una pequeña UI (ventana simple):
- **Dashboard Local**: ID del agente, estado del servicio y fecha del último heartbeat.
- **Configuración de Red**: Override de comunidad SNMP local.
- **Logs en Vivo**: Visualización de `agent.log` en tiempo real.

---

## 3. Roadmap de Implementación (PHASE_INSTALLER)

### Fase 1: Preparación del Agente (CLI & IPC)
- [ ] Implementar un comando de salud (`--status`) que devuelva JSON.
- [ ] Separar la lógica de activación del agente principal.
- [ ] Asegurar que el binario `STCCloudMonitor.exe` contenga metadatos de versión.

### Fase 2: El Instalador de Windows (Inno Setup)
- [ ] **Script base**: Creación del `.iss` para `C:\Program Files\STC\Monitor`.
- [ ] **Pantalla de Activación**: Página personalizada para pedir y validar la `KEY`.
- [ ] **Instalación de Servicio**: Registro automático al finalizar el setup.

### Fase 3: Monitor de Estado (Tray App / UI)
- [ ] **UI Minimalista**: App de bandeja para ver el estado rápido.
- [ ] **Botonera**: "Reiniciar Servicio", "Ver Logs", "Forzar Scan".

### Fase 4: Despliegue Masivo
- [ ] **Parámetros Silenciosos**: Soporte para `/VERYSILENT /KEY=XXXX`.
- [ ] **Generación de MSI**: Para despliegue vía GPO/Active Directory.
