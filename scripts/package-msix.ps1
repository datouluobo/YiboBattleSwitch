param(
  [string]$IdentityName = "YiboSoft.YiboBattleSwitch",
  [string]$ApplicationId = "YiboBattleSwitch",
  [string]$Publisher = "CN=YiboSoft",
  [string]$PublisherDisplayName = "YiboSoft",
  [string]$DisplayName = "YiboBattleSwitch"
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$tempOutput = Join-Path $env:TEMP 'YiboBattleSwitch-msix-stage'
$finalOutput = Join-Path $projectRoot 'release-msix'
$fallbackOutput = Join-Path $projectRoot 'release-msix-staged'
$timestampOutput = Join-Path $projectRoot ('release-msix-regenerated-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

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

function Resolve-MakeAppxPath {
  $command = Get-Command makeappx.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\makeappx.exe',
    'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\makeappx.exe'
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw 'makeappx.exe was not found. Install the Windows 10/11 SDK first.'
}

Push-Location $projectRoot
try {
  if (Test-Path -LiteralPath $tempOutput) {
    Remove-Item -LiteralPath $tempOutput -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $tempOutput | Out-Null

  $previousAutoDiscovery = $env:CSC_IDENTITY_AUTO_DISCOVERY
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'

  try {
    $builderArgs = @(
      '--win', 'appx',
      '--x64',
      "-c.directories.output=$tempOutput",
      "-c.appx.identityName=$IdentityName",
      "-c.appx.applicationId=$ApplicationId",
      "-c.appx.publisher=$Publisher",
      "-c.appx.publisherDisplayName=$PublisherDisplayName",
      "-c.appx.displayName=$DisplayName"
    )

    & '.\node_modules\.bin\electron-builder.cmd' @builderArgs
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
  finally {
    if ($null -eq $previousAutoDiscovery) {
      Remove-Item Env:CSC_IDENTITY_AUTO_DISCOVERY -ErrorAction SilentlyContinue
    } else {
      $env:CSC_IDENTITY_AUTO_DISCOVERY = $previousAutoDiscovery
    }
  }

  $appxFile = Get-ChildItem -LiteralPath $tempOutput -Filter *.appx | Select-Object -First 1
  if (-not $appxFile) {
    throw 'electron-builder did not generate the temporary appx package.'
  }

  $makeappx = Resolve-MakeAppxPath
  $unpackDir = Join-Path $tempOutput 'msix-unpacked'
  $msixTempPath = Join-Path $tempOutput ('YiboBattleSwitch-' + ((Get-Content package.json | ConvertFrom-Json).version) + '.msix')

  & $makeappx unpack /o /p $appxFile.FullName /d $unpackDir
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  & $makeappx pack /o /h SHA256 /d $unpackDir /p $msixTempPath
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
  Copy-Item -LiteralPath $msixTempPath -Destination (Join-Path $copyTarget (Split-Path -Leaf $msixTempPath)) -Force
  Copy-Item -LiteralPath (Join-Path $tempOutput 'builder-debug.yml') -Destination (Join-Path $copyTarget 'builder-debug.yml') -Force -ErrorAction SilentlyContinue
  Write-Host "Artifacts copied to: $copyTarget"
}
finally {
  Pop-Location
}
