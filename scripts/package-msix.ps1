param(
  [string]$IdentityName = "YiboSoft.YiboBattleSwitch",
  [string]$ApplicationId = "YiboBattleSwitch",
  [string]$Publisher = "CN=7919EC65-9786-42C0-8811-15FD14EECFE0",
  [string]$PublisherDisplayName = "YiboSoft",
  [string]$DisplayName = "YiboBattleSwitch",
  [string]$TargetMinVersion = "10.0.17763.0",
  [string]$TargetMaxVersionTested = "10.0.17763.0"
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

function Update-AppxManifestTargetVersions {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,
    [Parameter(Mandatory = $true)]
    [string]$MinVersion,
    [Parameter(Mandatory = $true)]
    [string]$MaxVersionTested
  )

  [xml]$manifestXml = Get-Content -LiteralPath $ManifestPath
  $packageNode = $manifestXml.Package
  if (-not $packageNode) {
    throw "Appx manifest does not contain a Package node: $ManifestPath"
  }

  $namespaceUri = $packageNode.NamespaceURI
  $namespaceManager = New-Object System.Xml.XmlNamespaceManager($manifestXml.NameTable)
  $namespaceManager.AddNamespace('appx', $namespaceUri)

  $targetDeviceFamilyNode = $manifestXml.SelectSingleNode('//appx:Package/appx:Dependencies/appx:TargetDeviceFamily', $namespaceManager)
  if (-not $targetDeviceFamilyNode) {
    throw "Appx manifest does not contain a TargetDeviceFamily node: $ManifestPath"
  }

  $targetDeviceFamilyNode.SetAttribute('MinVersion', $MinVersion)
  $targetDeviceFamilyNode.SetAttribute('MaxVersionTested', $MaxVersionTested)
  $manifestXml.Save($ManifestPath)
}

function Set-MsixTileAssets {
  param(
    [Parameter(Mandatory = $true)]
    [string]$UnpackDirectory,
    [Parameter(Mandatory = $true)]
    [string]$IconPath
  )

  Add-Type -AssemblyName System.Drawing
  $sourceIcon = New-Object System.Drawing.Icon($IconPath, 256, 256)
  try {
    foreach ($assetName in @(
      'Square150x150Logo.png',
      'Square44x44Logo.png',
      'StoreLogo.png',
      'Wide310x150Logo.png'
    )) {
      $assetPath = Join-Path $UnpackDirectory (Join-Path 'assets' $assetName)
      if (-not (Test-Path -LiteralPath $assetPath)) {
        throw "MSIX tile asset was not generated: $assetPath"
      }

      $existingAsset = [System.Drawing.Image]::FromFile($assetPath)
      try {
        $canvas = New-Object System.Drawing.Bitmap($existingAsset.Width, $existingAsset.Height)
      }
      finally {
        $existingAsset.Dispose()
      }

      try {
        $graphics = [System.Drawing.Graphics]::FromImage($canvas)
        try {
          $graphics.Clear([System.Drawing.Color]::Transparent)
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

          # Windows applies the tile background. Keep the icon at a consistent,
          # readable size instead of baking the former white placeholder into it.
          $iconSize = [Math]::Round([Math]::Min($canvas.Width, $canvas.Height) * 0.56)
          $iconX = [Math]::Round(($canvas.Width - $iconSize) / 2)
          $iconY = [Math]::Round(($canvas.Height - $iconSize) / 2)
          $graphics.DrawIcon($sourceIcon, (New-Object System.Drawing.Rectangle($iconX, $iconY, $iconSize, $iconSize)))
        }
        finally {
          $graphics.Dispose()
        }

        $canvas.Save($assetPath, [System.Drawing.Imaging.ImageFormat]::Png)
      }
      finally {
        $canvas.Dispose()
      }
    }
  }
  finally {
    $sourceIcon.Dispose()
  }
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

  $manifestPath = Join-Path $unpackDir 'AppxManifest.xml'
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "AppxManifest.xml was not found after unpack: $manifestPath"
  }
  Set-MsixTileAssets -UnpackDirectory $unpackDir -IconPath (Join-Path $projectRoot 'assets\icons\app-icon.ico')
  Update-AppxManifestTargetVersions -ManifestPath $manifestPath -MinVersion $TargetMinVersion -MaxVersionTested $TargetMaxVersionTested

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
