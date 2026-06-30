param(
  [switch]$DirOnly
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$tempOutput = Join-Path $env:TEMP "YiboBattleSwitch-release"
$finalOutput = Join-Path $projectRoot "release"
$fallbackOutput = Join-Path $projectRoot "release-staged"
$timestampOutput = Join-Path $projectRoot ("release-regenerated-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

function Remove-PathWithRetry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
  )

  if (-not (Test-Path -LiteralPath $TargetPath)) {
    return $true
  }

  for ($attempt = 1; $attempt -le 6; $attempt++) {
    try {
      Remove-Item -LiteralPath $TargetPath -Recurse -Force
      return $true
    }
    catch {
      Start-Sleep -Seconds 2
    }
  }

  return $false
}

Push-Location $projectRoot
try {
  if (Test-Path -LiteralPath $tempOutput) {
    Remove-Item -LiteralPath $tempOutput -Recurse -Force
  }

  $builderArgs = @()
  if ($DirOnly) {
    $builderArgs += "--dir"
  }
  $builderArgs += "--win"
  $builderArgs += "nsis"
  $builderArgs += "-c.directories.output=$tempOutput"

  & ".\node_modules\.bin\electron-builder.cmd" @builderArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  $copyTarget = $finalOutput
  if (-not (Remove-PathWithRetry -TargetPath $finalOutput)) {
    $copyTarget = $fallbackOutput
    if (-not (Remove-PathWithRetry -TargetPath $fallbackOutput)) {
      $copyTarget = $timestampOutput
    }
  }

  New-Item -ItemType Directory -Force -Path $copyTarget | Out-Null
  Copy-Item -Path (Join-Path $tempOutput "*") -Destination $copyTarget -Recurse -Force
  Write-Host "Artifacts copied to: $copyTarget"
}
finally {
  Pop-Location
}
