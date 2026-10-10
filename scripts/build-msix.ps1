# Loomen — MSIX paketleme (Microsoft Store)
# Kullanım: .\scripts\build-msix.ps1 -Version "1.0.0"
# Önce `npm run tauri build -- --no-bundle` ile src-tauri\target\release\loomen.exe üretilmiş olmalı.
# İmzasız MSIX Store'a yüklenir; Microsoft kendisi imzalar.

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$MsixVersion = "$Version.0"

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$TauriTarget = Join-Path $ProjectRoot "src-tauri\target\release"
$ManifestSrc = Join-Path $ProjectRoot "src-tauri\msix\AppxManifest.xml"
$IconsSrc    = Join-Path $ProjectRoot "src-tauri\icons"
$BuildDir    = Join-Path $ProjectRoot "dist-msix"
$OutputMsix  = Join-Path $ProjectRoot "Loomen_${Version}_x64.msix"

$WindowsKitBin = "C:\Program Files (x86)\Windows Kits\10\bin"
function Find-SdkTool([string]$name) {
    Get-ChildItem "$WindowsKitBin\*\x64\$name" -ErrorAction SilentlyContinue |
        Sort-Object { $_.DirectoryName } -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
$MakeAppx = Find-SdkTool "makeappx.exe"
$MakePri  = Find-SdkTool "makepri.exe"
if (-not $MakeAppx -or -not $MakePri) { Write-Error "Windows SDK araçları (makeappx/makepri) bulunamadı."; exit 1 }

$ExePath = Join-Path $TauriTarget "loomen.exe"
if (-not (Test-Path $ExePath)) { Write-Error "loomen.exe bulunamadı: $ExePath"; exit 1 }

if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
New-Item -ItemType Directory -Path "$BuildDir\Assets" | Out-Null

Copy-Item $ExePath "$BuildDir\Loomen.exe"

$Manifest = (Get-Content $ManifestSrc -Encoding UTF8 -Raw) -replace 'Version="MSIX_VERSION"', "Version=`"$MsixVersion`""
Set-Content "$BuildDir\AppxManifest.xml" $Manifest -Encoding UTF8

foreach ($icon in @("StoreLogo.png","Square44x44Logo.png","Square71x71Logo.png","Square150x150Logo.png","Square310x310Logo.png","Wide310x150Logo.png","SplashScreen.png")) {
    $src = Join-Path $IconsSrc $icon
    if (-not (Test-Path $src)) { Write-Error "$icon bulunamadı"; exit 1 }
    Copy-Item $src "$BuildDir\Assets\$icon"
}

$WebView2 = Join-Path $TauriTarget "WebView2Loader.dll"
if (Test-Path $WebView2) { Copy-Item $WebView2 "$BuildDir\WebView2Loader.dll" }

# resources.pri — Store paket doğrulaması için gerekli
$PriConfig = Join-Path $ProjectRoot "dist-msix-priconfig.xml"
if (Test-Path $PriConfig) { Remove-Item $PriConfig -Force }
& $MakePri createconfig /cf $PriConfig /dq "en-US" /o
if ($LASTEXITCODE -ne 0) { Write-Error "makepri createconfig başarısız"; exit 1 }
& $MakePri new /pr $BuildDir /cf $PriConfig /mn "$BuildDir\AppxManifest.xml" /of "$BuildDir\resources.pri" /o
if ($LASTEXITCODE -ne 0) { Write-Error "makepri new başarısız"; exit 1 }
Remove-Item $PriConfig -Force -ErrorAction SilentlyContinue

if (Test-Path $OutputMsix) { Remove-Item $OutputMsix -Force }
& $MakeAppx pack /v /h SHA256 /d $BuildDir /p $OutputMsix
if ($LASTEXITCODE -ne 0) { Write-Error "makeappx başarısız"; exit 1 }

Write-Host "MSIX hazır: $OutputMsix ($([math]::Round((Get-Item $OutputMsix).Length / 1MB, 2)) MB, sürüm $MsixVersion)"
