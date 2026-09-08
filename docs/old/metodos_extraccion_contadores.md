# Métodos de Extracción de Contadores - STC Cloud Agent

Este documento detalla de manera clara y profesional los métodos técnicos que utiliza el agente local de **STC Cloud** para realizar la recolección automática de contadores y lecturas de impresoras en la red local del cliente. 

Está diseñado para ser compartido con los departamentos de TI y administración de los clientes finales para garantizar la transparencia, la seguridad de la red y el entendimiento del servicio.

---

## 🛠️ Resumen de los 4 Métodos de Extracción

El agente de STC Cloud es multimarca y cuenta con un motor inteligente de cascada que selecciona de forma automática el mejor método de comunicación con cada impresora según su marca, modelo y capacidades técnicas:

```
[Inicio de Escaneo] 
       │
       ├──► 1. EWS (HTTP/HTTPS)  ──► [Lectura Rica en Color/Negro] (Recomendado)
       │
       ├──► 2. SNMP (UDP 161)    ──► [Estándar Universal de Red]
       │
       ├──► 3. PJL (TCP 9100)    ──► [Respaldo Rápido de Motor]
       │
       └──► 4. IPP (TCP 631)     ──► [Respaldo de Protocolo Web]
```

---

### 1. EWS (Embedded Web Server / Servidor Web Embebido)
* **Cómo funciona**: El agente realiza una consulta interna muy ligera vía protocolo web (HTTP o HTTPS en los puertos 80 / 443) directamente a la página de administración del equipo. Analiza de manera inteligente el contenido web (HTML/JSON) y extrae los datos de contadores exactamente igual a como se verían si el usuario entrara a la web del equipo.
* **Información extraída**: Contador Total de Páginas, Desglose detallado de Negro y Color, Copias, Impresiones, Escaneos y estado de Suministros (Tóners, Tambores).
* **Beneficio principal**: Es el método más rico en información y más compatible con multifuncionales modernos (Samsung XOA/SWS, HP SDS, Lexmark, Xerox).

---

### 2. SNMP (Simple Network Management Protocol)
* **Cómo funciona**: Utiliza el protocolo estándar de administración de red de la industria de TI (puerto UDP 161) con una consulta ligera de lectura utilizando la comunidad estándar `public` (comportamiento de solo lectura). Sigue los estándares universales de la industria como `Printer-MIB`.
* **Información extraída**: Contador de páginas totales, serie, modelo y alertas de estado generales del motor de impresión.
* **Beneficio principal**: Estándar universal de la industria. Es soportado por el 99% de las impresoras de red del mercado y requiere cero configuración.

---

### 3. PJL (Printer Job Language)
* **Cómo funciona**: El agente abre una conexión directa y ultrarrápida (puerto TCP 9100 / JetDirect) por unas pocas milésimas de segundo y le envía una consulta nativa en lenguaje de control de impresora (PJL) preguntando por las páginas físicas impresas. El equipo responde directamente a nivel de hardware del motor.
* **Información extraída**: Número de serie del equipo y total de impresiones acumuladas.
* **Beneficio principal**: Método de respaldo extremadamente veloz y ligero. Es la única alternativa viable para impresoras de red muy antiguas o impresoras de escritorio básicas que no soportan SNMP ni páginas de administración web avanzadas.

---

### 4. IPP (Internet Printing Protocol)
* **Cómo funciona**: Consulta el estado de la impresora utilizando el puerto de impresión seguro IPP (puerto TCP 631). Envía una solicitud de consulta de atributos del dispositivo a nivel de spooler de red.
* **Información extraída**: Estado general del equipo, presencia de atascos o falta de papel y contadores acumulados básicos.
* **Beneficio principal**: Gran compatibilidad en redes modernas y respeto a las directivas de seguridad corporativas estrictas.

---

## 🔒 Seguridad, Privacidad y Cero Impacto en la Red

Los clientes finales y sus departamentos de seguridad informática (CISO) pueden estar completamente tranquilos gracias a las siguientes características de diseño del agente:

1. **Cero Lectura de Datos de Impresión**: El agente **NUNCA** intercepta, lee, almacena ni transmite el contenido de los documentos que se imprimen, copian o escanean. El agente solo lee variables estadísticas de contadores numéricos de páginas del hardware.
2. **Cero Tráfico de Red**: Cada consulta a una impresora dura menos de **2 segundos** y se realiza en intervalos configurables (por defecto cada 15 a 60 minutos). Esto representa menos del 0.001% del ancho de banda de la red local.
3. **No Invasivo y Solo Lectura**: El agente nunca envía comandos de escritura, impresión de páginas de prueba o configuraciones a los equipos. Toda la comunicación se realiza bajo canales estándar de Solo Lectura.
4. **Cumplimiento de Seguridad**: Evita realizar "escaneos de puertos agresivos" para prevenir alarmas en sistemas corporativos de prevención de intrusos (IDS/IPS). Primero verifica de forma pasiva que los puertos de impresora estén abiertos antes de intentar cualquier consulta.
