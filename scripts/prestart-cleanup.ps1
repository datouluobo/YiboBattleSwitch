param(
  [string]$Workspace = ""
)

$ErrorActionPreference = "SilentlyContinue"

if ([string]::IsNullOrWhiteSpace($Workspace)) {
  $Workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$normalizedWorkspace = $Workspace.ToLowerInvariant()
$filter = "Name = 'electron.exe' OR Name = 'YiboBattleSwitch.exe'"

try {
  $targets = Get-CimInstance Win32_Process -Filter $filter | Where-Object {
    $commandLine = "$($_.CommandLine)".ToLowerInvariant()
    $executablePath = "$($_.ExecutablePath)".ToLowerInvariant()
    ($commandLine -like ("*" + $normalizedWorkspace + "*")) -or
    ($executablePath -like ($normalizedWorkspace + "*"))
  }

  foreach ($target in $targets) {
    try {
      Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue
    }
    catch {
    }
  }
}
catch {
}
