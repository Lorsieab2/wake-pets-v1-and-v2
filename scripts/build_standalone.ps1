[CmdletBinding()]
param(
  [string]$PetsSource = "",
  [string[]]$PetId = @(),
  [string]$Version = "1.1.0",
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$appDir = Join-Path $repo "app"
$electronDist = Join-Path $appDir "node_modules\electron\dist"
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
if ([string]::IsNullOrWhiteSpace($PetsSource)) {
  $PetsSource = Join-Path $codexHome "pets"
}
$petsSourcePath = if (Test-Path -LiteralPath $PetsSource) { (Resolve-Path $PetsSource).Path } else { $null }

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $repo "release\Wake-Pets-v1-and-v2-$Version"
} else {
  $OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
}

if (-not (Test-Path -LiteralPath (Join-Path $electronDist "electron.exe"))) {
  throw "Electron is not installed at $electronDist. Run npm install in app first."
}
if ($PetId.Count -gt 0 -and -not $petsSourcePath) {
  throw "PetsSource does not exist: $PetsSource"
}

$repoReleaseRoot = [IO.Path]::GetFullPath((Join-Path $repo "release"))
$outputFullPath = [IO.Path]::GetFullPath($OutputDirectory)
if (-not $outputFullPath.StartsWith($repoReleaseRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputDirectory must remain inside $repoReleaseRoot"
}

if (Test-Path -LiteralPath $outputFullPath) {
  Remove-Item -LiteralPath $outputFullPath -Recurse -Force
}
$archivePath = "$outputFullPath.zip"
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

$resourcesApp = Join-Path $outputFullPath "resources\app"
$bundledPets = Join-Path $outputFullPath "pets"
New-Item -ItemType Directory -Path $resourcesApp,$bundledPets -Force | Out-Null

Get-ChildItem -LiteralPath $electronDist -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $outputFullPath $_.Name) -Recurse -Force
}
Move-Item -LiteralPath (Join-Path $outputFullPath "electron.exe") -Destination (Join-Path $outputFullPath "Wake Codex Pets without Codex.exe")

@("main.js", "preload.js", "pet-window.html", "overlay.html", "config-window.html", "package.json") | ForEach-Object {
  Copy-Item -LiteralPath (Join-Path $appDir $_) -Destination (Join-Path $resourcesApp $_) -Force
}

$selectedIds = @($PetId | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
if ($selectedIds.Count -eq 0 -and $petsSourcePath) {
  $selectedIds = @(Get-ChildItem -LiteralPath $petsSourcePath -Directory | Select-Object -ExpandProperty Name)
}
foreach ($id in $selectedIds) {
  if ($id -notmatch "^[a-z0-9][a-z0-9_-]*$") { throw "Invalid pet id: $id" }
  $sourcePet = Join-Path $petsSourcePath $id
  if (-not (Test-Path -LiteralPath (Join-Path $sourcePet "pet.json"))) { throw "Missing pet.json for: $id" }
  Copy-Item -LiteralPath $sourcePet -Destination (Join-Path $bundledPets $id) -Recurse -Force
}

$readme = @"
Wake Pets v1 and v2 $Version

Run "Wake Codex Pets without Codex.exe" to open the standalone pet overlay.
This app does not require Codex or the wake-pets skill to be running.

To add another valid pet, copy its package directory into the adjacent pets folder.
Each package must contain pet.json and its spritesheet.
"@
Set-Content -LiteralPath (Join-Path $outputFullPath "README.txt") -Value $readme -Encoding UTF8

$archiveParent = Split-Path -Parent $outputFullPath
$archiveName = Split-Path -Leaf $outputFullPath
& tar.exe -a -c -f $archivePath -C $archiveParent $archiveName
if ($LASTEXITCODE -ne 0) { throw "tar.exe failed to create $archivePath" }
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
Write-Output "Standalone app: $outputFullPath"
Write-Output "Archive: $archivePath"
Write-Output "SHA256: $hash"
