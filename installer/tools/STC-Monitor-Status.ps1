#Requires -Version 5.1
# STC Cloud Monitor - Consola de Estado
# Equivalente a la "DCA Console" de HP SDS Manager

param([string]$ServiceAction = "")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ─── Helpers ─────────────────────────────────────────────────────────────────

function Get-AgentExe {
    $candidates = @(
        (Join-Path $PSScriptRoot "STCCloudMonitor.exe"),
        "C:\Program Files\STC\Monitor\STCCloudMonitor.exe",
        "C:\Program Files (x86)\STC\Monitor\STCCloudMonitor.exe"
    )
    foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
    return $null
}

function Get-AgentStatus {
    $exe = Get-AgentExe
    if (-not $exe) { return $null }
    try {
        $json = & $exe --status 2>$null | Out-String
        if ([string]::IsNullOrWhiteSpace($json)) { return $null }
        return $json | ConvertFrom-Json
    } catch { 
        return $null 
    }
}

function Test-IsAdmin {
    return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]"Administrator")
}

function Invoke-ServiceControl ($Action) {
    if (-not (Test-IsAdmin)) {
        $result = [System.Windows.Forms.MessageBox]::Show(
            "$Action el servicio requiere privilegios de administrador.`n¿Desea continuar?",
            "STC Cloud Monitor", [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Question)
        if ($result -ne [System.Windows.Forms.DialogResult]::Yes) { return $false }

        # Re-lanzar elevado y pasar la acción como parámetro
        $psArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -ServiceAction $Action"
        Start-Process powershell.exe -ArgumentList $psArgs -Verb RunAs -Wait
        return $true
    }

    try {
        if ($Action -eq "Restart") {
            Restart-Service -Name "STCCloudMonitor" -Force -ErrorAction Stop
        } elseif ($Action -eq "Stop") {
            Stop-Service  -Name "STCCloudMonitor" -Force -ErrorAction Stop
        } elseif ($Action -eq "Start") {
            Start-Service -Name "STCCloudMonitor" -ErrorAction Stop
        }
        return $true
    } catch {
        [System.Windows.Forms.MessageBox]::Show(
            "Error al $Action el servicio:`n$_",
            "STC Cloud Monitor", [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error)
        return $false
    }
}

# ─── Manejo de invocacion elevada (reinicio de servicio) ─────────────────────

if ($ServiceAction -ne "") {
    try {
        if ($ServiceAction -eq "Restart") {
            Restart-Service -Name "STCCloudMonitor" -Force -ErrorAction Stop
        } elseif ($ServiceAction -eq "Stop") {
            Stop-Service  -Name "STCCloudMonitor" -Force -ErrorAction Stop
        } elseif ($ServiceAction -eq "Start") {
            Start-Service -Name "STCCloudMonitor" -ErrorAction Stop
        }
        [System.Windows.Forms.MessageBox]::Show(
            "Servicio '$ServiceAction' completado.",
            "STC Cloud Monitor", [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information)
    } catch {
        [System.Windows.Forms.MessageBox]::Show(
            "Error: $_", "STC Cloud Monitor",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error)
    }
    exit
}

# ─── Formulario principal ─────────────────────────────────────────────────────

$form = New-Object System.Windows.Forms.Form
$form.Text = "STC Cloud Monitor - Consola de Estado"
$form.Size = New-Object System.Drawing.Size(480, 440)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.BackColor = [System.Drawing.Color]::White

# ── Encabezado ───────────────────────────────────────────────────────────────

$header = New-Object System.Windows.Forms.Panel
$header.Size     = New-Object System.Drawing.Size(480, 64)
$header.Location = New-Object System.Drawing.Point(0, 0)
$header.BackColor = [System.Drawing.Color]::FromArgb(0, 82, 147)
$form.Controls.Add($header)

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text      = "STC Cloud Monitor"
$lblTitle.ForeColor = [System.Drawing.Color]::White
$lblTitle.Font      = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$lblTitle.Location  = New-Object System.Drawing.Point(14, 9)
$lblTitle.Size      = New-Object System.Drawing.Size(320, 26)
$header.Controls.Add($lblTitle)

$lblSub = New-Object System.Windows.Forms.Label
$lblSub.Text      = "Monitor de Impresoras SNMP"
$lblSub.ForeColor = [System.Drawing.Color]::FromArgb(160, 200, 240)
$lblSub.Font      = New-Object System.Drawing.Font("Segoe UI", 8)
$lblSub.Location  = New-Object System.Drawing.Point(14, 36)
$lblSub.Size      = New-Object System.Drawing.Size(300, 18)
$header.Controls.Add($lblSub)

# Indicador de estado (punto de color) — equivalente al semáforo de HP DCA Console
$dot = New-Object System.Windows.Forms.Panel
$dot.Size      = New-Object System.Drawing.Size(18, 18)
$dot.Location  = New-Object System.Drawing.Point(422, 23)
$dot.BackColor = [System.Drawing.Color]::Gray
$header.Controls.Add($dot)

$lblDotText = New-Object System.Windows.Forms.Label
$lblDotText.Text      = "servicio"
$lblDotText.ForeColor = [System.Drawing.Color]::FromArgb(160, 200, 240)
$lblDotText.Font      = New-Object System.Drawing.Font("Segoe UI", 7)
$lblDotText.Location  = New-Object System.Drawing.Point(408, 44)
$lblDotText.Size      = New-Object System.Drawing.Size(52, 14)
$lblDotText.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$header.Controls.Add($lblDotText)

# ── Filas de información ──────────────────────────────────────────────────────

$y = 78
function Add-Row ($label) {
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text      = "${label}:"
    $lbl.Location  = New-Object System.Drawing.Point(16, $script:y)
    $lbl.Size      = New-Object System.Drawing.Size(140, 20)
    $lbl.ForeColor = [System.Drawing.Color]::FromArgb(90, 90, 90)
    $form.Controls.Add($lbl)

    $val = New-Object System.Windows.Forms.Label
    $val.Text     = "-"
    $val.Location = New-Object System.Drawing.Point(162, $script:y)
    $val.Size     = New-Object System.Drawing.Size(298, 20)
    $val.Font     = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($val)

    $script:y += 28
    return $val
}

$valVersion   = Add-Row "Version"
$valAgentId   = Add-Row "ID del Agente"
$valServicio  = Add-Row "Estado del Servicio"
$valActivado  = Add-Row "Activado"
$valDirectorio = Add-Row "Directorio de datos"

# ── Separador ────────────────────────────────────────────────────────────────

$sep = New-Object System.Windows.Forms.Label
$sep.BorderStyle = [System.Windows.Forms.BorderStyle]::Fixed3D
$sep.Location    = New-Object System.Drawing.Point(16, $y)
$sep.Size        = New-Object System.Drawing.Size(444, 2)
$form.Controls.Add($sep)
$y += 10

# ── Última entrada de log ─────────────────────────────────────────────────────

$lblLog = New-Object System.Windows.Forms.Label
$lblLog.Text      = "Ultima entrada en log:"
$lblLog.Location  = New-Object System.Drawing.Point(16, $y)
$lblLog.Size      = New-Object System.Drawing.Size(200, 20)
$lblLog.ForeColor = [System.Drawing.Color]::FromArgb(90, 90, 90)
$form.Controls.Add($lblLog)
$y += 22

$txtLog = New-Object System.Windows.Forms.TextBox
$txtLog.Location    = New-Object System.Drawing.Point(16, $y)
$txtLog.Size        = New-Object System.Drawing.Size(444, 58)
$txtLog.Multiline   = $true
$txtLog.ReadOnly    = $true
$txtLog.ScrollBars  = [System.Windows.Forms.ScrollBars]::Vertical
$txtLog.BackColor   = [System.Drawing.Color]::FromArgb(245, 245, 245)
$txtLog.Font        = New-Object System.Drawing.Font("Consolas", 8)
$txtLog.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$form.Controls.Add($txtLog)
$y += 66

# ── Botones ───────────────────────────────────────────────────────────────────

$btnRefresh = New-Object System.Windows.Forms.Button
$btnRefresh.Text     = "Actualizar"
$btnRefresh.Location = New-Object System.Drawing.Point(16, $y)
$btnRefresh.Size     = New-Object System.Drawing.Size(94, 30)
$form.Controls.Add($btnRefresh)

$btnRestart = New-Object System.Windows.Forms.Button
$btnRestart.Text     = "Reiniciar Servicio"
$btnRestart.Location = New-Object System.Drawing.Point(126, $y)
$btnRestart.Size     = New-Object System.Drawing.Size(140, 30)
$form.Controls.Add($btnRestart)

$btnLogs = New-Object System.Windows.Forms.Button
$btnLogs.Text     = "Ver Logs"
$btnLogs.Location = New-Object System.Drawing.Point(276, $y)
$btnLogs.Size     = New-Object System.Drawing.Size(90, 30)
$form.Controls.Add($btnLogs)

$btnClose = New-Object System.Windows.Forms.Button
$btnClose.Text     = "Cerrar"
$btnClose.Location = New-Object System.Drawing.Point(376, $y)
$btnClose.Size     = New-Object System.Drawing.Size(84, 30)
$form.Controls.Add($btnClose)

# ─── Lógica de actualización de UI ───────────────────────────────────────────

function Update-StatusUI {
    $s = Get-AgentStatus

    if ($null -eq $s) {
        $exe = Get-AgentExe
        if ($exe) {
            $dot.BackColor        = [System.Drawing.Color]::Orange
            $valServicio.Text     = "Pendiente de activacion"
            $valServicio.ForeColor = [System.Drawing.Color]::DarkOrange
            if ($btnActivateUI) { $btnActivateUI.Visible = $true }
            if ($txtActivateKey) { $txtActivateKey.Visible = $true }
            if ($lblActivateKey) { $lblActivateKey.Visible = $true }
        } else {
            $dot.BackColor        = [System.Drawing.Color]::Red
            $valServicio.Text     = "Agente no encontrado"
            $valServicio.ForeColor = [System.Drawing.Color]::Red
            $txtLog.Text          = "(agente no encontrado en la ruta esperada)"
        }
        $valVersion.Text      = "-"
        $valAgentId.Text      = "-"
        $valActivado.Text     = "No"
        $valDirectorio.Text   = "-"
        return
    }

    $valVersion.Text    = if ($s.version)  { $s.version }  else { "-" }
    if ($s.activated) {
        $valActivado.Text   = "Si"
        $valActivado.ForeColor = [System.Drawing.Color]::DarkGreen
        if ($btnActivateUI) { $btnActivateUI.Visible = $false }
        if ($txtActivateKey) { $txtActivateKey.Visible = $false }
        if ($lblActivateKey) { $lblActivateKey.Visible = $false }
    } else {
        $valActivado.Text   = "No - Pendiente de activacion"
        $valActivado.ForeColor = [System.Drawing.Color]::DarkOrange
        if ($btnActivateUI) { $btnActivateUI.Visible = $true }
        if ($txtActivateKey) { $txtActivateKey.Visible = $true }
        if ($lblActivateKey) { $lblActivateKey.Visible = $true }
    }

    $valDirectorio.Text = if ($s.dataDir) { $s.dataDir }   else { "-" }
    $txtLog.Text        = if ($s.lastLog) { $s.lastLog }   else { "(sin entradas en log)" }

    switch ($s.service) {
        "running" {
            $valServicio.Text      = "En ejecucion"
            $valServicio.ForeColor = [System.Drawing.Color]::DarkGreen
            $dot.BackColor         = [System.Drawing.Color]::LimeGreen
        }
        "stopped" {
            $valServicio.Text      = "Detenido"
            $valServicio.ForeColor = [System.Drawing.Color]::OrangeRed
            $dot.BackColor         = [System.Drawing.Color]::OrangeRed
        }
        "starting" {
            $valServicio.Text      = "Iniciando..."
            $valServicio.ForeColor = [System.Drawing.Color]::DarkOrange
            $dot.BackColor         = [System.Drawing.Color]::Orange
        }
        "not-installed" {
            $valServicio.Text      = "No instalado"
            $valServicio.ForeColor = [System.Drawing.Color]::Red
            $dot.BackColor         = [System.Drawing.Color]::Red
        }
        default {
            $valServicio.Text      = $s.service
            $valServicio.ForeColor = [System.Drawing.Color]::DarkGray
            $dot.BackColor         = [System.Drawing.Color]::Gray
        }
    }
}

# ─── Formulario de Activacion UI ──────────────────────────────────────────────

$y += 10
$lblActivateKey = New-Object System.Windows.Forms.Label
$lblActivateKey.Text     = "Llave de Activacion:"
$lblActivateKey.Location = New-Object System.Drawing.Point(16, $y)
$lblActivateKey.Size     = New-Object System.Drawing.Size(140, 20)
$lblActivateKey.Visible  = $false
$form.Controls.Add($lblActivateKey)

$txtActivateKey = New-Object System.Windows.Forms.TextBox
$txtActivateKey.Location = New-Object System.Drawing.Point(162, $y)
$txtActivateKey.Size     = New-Object System.Drawing.Size(200, 20)
$txtActivateKey.Visible  = $false
$form.Controls.Add($txtActivateKey)

$btnActivateUI = New-Object System.Windows.Forms.Button
$btnActivateUI.Text     = "Activar"
$btnActivateUI.Location = New-Object System.Drawing.Point(370, $y - 2)
$btnActivateUI.Size     = New-Object System.Drawing.Size(90, 24)
$btnActivateUI.Visible  = $false
$btnActivateUI.BackColor = [System.Drawing.Color]::FromArgb(230, 240, 255)
$form.Controls.Add($btnActivateUI)

$btnActivateUI.Add_Click({
    $key = $txtActivateKey.Text.Trim()
    if ($key.Length -ne 64) {
        [System.Windows.Forms.MessageBox]::Show("La llave debe tener 64 caracteres.", "Error de Validacion", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
        return
    }

    $btnActivateUI.Enabled = $false
    $btnActivateUI.Text = "..."
    
    $exe = Get-AgentExe
    $serverUrl = "http://127.0.0.1:3000" # Por defecto para desarrollo, en prod se puede parametrizar

    # Ejecutar activacion
    $out = & $exe --activate $key --server $serverUrl 2>&1 | Out-String
    
    if ($LASTEXITCODE -eq 0) {
        [System.Windows.Forms.MessageBox]::Show("Activacion exitosa.`n`nReiniciando servicio...", "STC Cloud Monitor", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
        Invoke-ServiceControl "Restart"
        Update-StatusUI
    } else {
        [System.Windows.Forms.MessageBox]::Show("Error en activacion:`n$out", "Error", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)
    }

    $btnActivateUI.Enabled = $true
    $btnActivateUI.Text = "Activar"
})

$y += 35

# ─── Eventos ──────────────────────────────────────────────────────────────────

$btnRefresh.Add_Click({
    $btnRefresh.Enabled = $false
    $btnRefresh.Text    = "..."
    Update-StatusUI
    $btnRefresh.Enabled = $true
    $btnRefresh.Text    = "Actualizar"
})

$btnRestart.Add_Click({
    $ok = Invoke-ServiceControl "Restart"
    if ($ok) {
        Start-Sleep -Milliseconds 1800
        Update-StatusUI
    }
})

$btnLogs.Add_Click({
    $exe = Get-AgentExe
    if (-not $exe) {
        [System.Windows.Forms.MessageBox]::Show(
            "No se encontró el agente instalado.",
            "STC Cloud Monitor", [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning)
        return
    }
    try {
        $s = Get-AgentStatus
        $logFile = if ($s -and $s.dataDir) { Join-Path $s.dataDir "agent.log" } else { "C:\ProgramData\STCCloudMonitor\agent.log" }
        if (Test-Path $logFile) {
            Start-Process notepad.exe -ArgumentList $logFile
        } else {
            [System.Windows.Forms.MessageBox]::Show(
                "Log no encontrado:`n$logFile",
                "STC Cloud Monitor", [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Warning)
        }
    } catch {
        [System.Windows.Forms.MessageBox]::Show(
            "Error al abrir log: $_", "STC Cloud Monitor",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error)
    }
})

$btnClose.Add_Click({ $form.Close() })

# ─── Carga inicial ────────────────────────────────────────────────────────────

Update-StatusUI
$form.ShowDialog() | Out-Null
