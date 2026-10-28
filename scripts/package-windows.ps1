[CmdletBinding()]
param(
    [string]$Version,
    [string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

if ($env:OS -ne 'Windows_NT') {
    throw 'Windows packaging must run on Windows to validate executable version resources.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$tauriConfig = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri/tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$cargo = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri/Cargo.toml') -Raw -Encoding UTF8
$cargoPackage = [regex]::Match($cargo, '(?ms)^\[package\]\s*(.*?)(?=^\[|\z)')
$cargoVersion = [regex]::Match($cargoPackage.Groups[1].Value, '(?m)^version\s*=\s*"([^"]+)"\s*$')

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = [string]$package.version
}
if ($Version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$') {
    throw "Invalid release version: $Version"
}
if (-not $cargoVersion.Success -or $Version -cne $package.version -or $Version -cne $tauriConfig.version -or $Version -cne $cargoVersion.Groups[1].Value) {
    throw 'Release version must match package.json, tauri.conf.json and Cargo.toml.'
}

$releaseDirectory = Join-Path $projectRoot 'src-tauri/target/release'
$executable = Join-Path $releaseDirectory 'cornerbits.exe'
$nsisDirectory = Join-Path $releaseDirectory 'bundle/nsis'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Missing release executable: $executable"
}
if (-not (Test-Path -LiteralPath $nsisDirectory -PathType Container)) {
    throw 'Missing NSIS installer directory. Build with the release Tauri config first.'
}
$installers = @(Get-ChildItem -LiteralPath $nsisDirectory -File -Filter '*.exe')
if ($installers.Count -ne 1) {
    throw "Expected exactly one NSIS installer, found $($installers.Count). Use a fresh build output."
}
$expectedInstallerName = "CornerBits_${Version}_x64-setup.exe"
if ($installers[0].Name -cne $expectedInstallerName) {
    throw "Expected installer $expectedInstallerName, found $($installers[0].Name)."
}

foreach ($buildFile in @($executable, $installers[0].FullName)) {
    $versionInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($buildFile)
    if ($versionInfo.ProductVersion -cne $Version) {
        throw "Executable version mismatch in ${buildFile}: expected $Version, found $($versionInfo.ProductVersion)."
    }
    if ($versionInfo.ProductName -cne 'CornerBits') {
        throw "Unexpected executable product in ${buildFile}: $($versionInfo.ProductName)."
    }
}

# Validate the application PE machine; an NSIS setup launcher itself may be x86.
$binaryReader = [System.IO.BinaryReader]::new([System.IO.File]::OpenRead($executable))
try {
    if ($binaryReader.ReadUInt16() -ne 0x5A4D) { throw 'Application is not a Windows executable.' }
    $binaryReader.BaseStream.Position = 0x3C
    $peOffset = $binaryReader.ReadInt32()
    if ($peOffset -lt 0 -or $peOffset -gt ($binaryReader.BaseStream.Length - 6)) { throw 'Invalid PE header offset.' }
    $binaryReader.BaseStream.Position = $peOffset
    if ($binaryReader.ReadUInt32() -ne 0x4550 -or $binaryReader.ReadUInt16() -ne 0x8664) {
        throw 'The application must be a Windows x64 executable.'
    }
}
finally {
    $binaryReader.Dispose()
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $projectRoot ".tools/releases/$Version"
}
elseif (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $projectRoot $OutputDirectory
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $OutputDirectory) {
    if (-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)) {
        throw "Output path is not a directory: $OutputDirectory"
    }
    if (@(Get-ChildItem -LiteralPath $OutputDirectory -Force).Count -ne 0) {
        throw "Output directory must be empty. Existing files are never removed: $OutputDirectory"
    }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$portableName = "CornerBits_${Version}_windows-x64.zip"
$portablePath = Join-Path $OutputDirectory $portableName
$installerPath = Join-Path $OutputDirectory $expectedInstallerName
$portableReadme = @"
CornerBits $Version - Windows x64 portable executable

1. Extract the ZIP to a folder, then run cornerbits.exe.
2. Microsoft Edge WebView2 Runtime must already be installed. If it is missing,
   use the CornerBits setup installer (internet required for WebView2), or install
   the Evergreen Runtime from https://developer.microsoft.com/microsoft-edge/webview2/
3. The app runs as a desktop widget. Use its system tray menu to find or exit it.
4. Game progress is stored in %APPDATA%\dev.cornerbits.app, not beside the EXE.
   Existing installed and portable copies use the same data. Export a backup
   from the app before switching versions or moving to another computer.

This ZIP contains only the application and this README. It does not include
WebView2, save files, exported backups, Node.js, Rust, or development tools.
"@

# Write only the explicitly named build output and generated instructions.
$archive = [System.IO.Compression.ZipFile]::Open($portablePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $entry = $archive.CreateEntry('cornerbits.exe', [System.IO.Compression.CompressionLevel]::Optimal)
    $entry.LastWriteTime = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
    $sourceStream = [System.IO.File]::OpenRead($executable)
    try {
        $entryStream = $entry.Open()
        try { $sourceStream.CopyTo($entryStream) }
        finally { $entryStream.Dispose() }
    }
    finally { $sourceStream.Dispose() }
    $readmeEntry = $archive.CreateEntry('README.txt', [System.IO.Compression.CompressionLevel]::Optimal)
    $readmeEntry.LastWriteTime = $entry.LastWriteTime
    $writer = [System.IO.StreamWriter]::new($readmeEntry.Open(), $utf8)
    try { $writer.Write($portableReadme.Replace("`r`n", "`n")) }
    finally { $writer.Dispose() }
}
finally {
    $archive.Dispose()
}
[System.IO.File]::Copy($installers[0].FullName, $installerPath, $false)
$checksumLines = foreach ($artifact in @($portablePath, $installerPath)) {
    $hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $([System.IO.Path]::GetFileName($artifact))"
}
[System.IO.File]::WriteAllText((Join-Path $OutputDirectory 'SHA256SUMS.txt'), ($checksumLines -join "`n") + "`n", $utf8)
Write-Output "Packaged CornerBits $Version in $OutputDirectory"
Get-Item -LiteralPath $portablePath, $installerPath, (Join-Path $OutputDirectory 'SHA256SUMS.txt') | Select-Object Name, Length
