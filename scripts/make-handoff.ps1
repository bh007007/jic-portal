<#
.SYNOPSIS
  인수인계용 압축 파일을 만든다: handoff/jic-portal-handoff-YYYY-MM-DD.zip

.DESCRIPTION
  Git이 관리하는 파일(커밋된 것 + 아직 커밋 안 했지만 .gitignore 대상이 아닌 것)만 담는다.
  data/, node_modules/, *.json.gz, handoff/ 는 .gitignore로 빠지고, 마지막에 한 번 더 검사한다.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/make-handoff.ps1
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$files = git ls-files --cached --others --exclude-standard | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
$blocked = $files | Where-Object { $_ -match '^(data/|handoff/|node_modules/)|\.json\.gz$|(^|/)\.env' }
if ($blocked) { throw "압축에 넣으면 안 되는 파일이 있습니다: $($blocked -join ', ')" }

New-Item -ItemType Directory -Force 'handoff' | Out-Null
$zipPath = Join-Path $root ("handoff\jic-portal-handoff-{0}.zip" -f (Get-Date -Format 'yyyy-MM-dd'))
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($f in $files) {
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $root $f), 'jic-portal/' + $f, [IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $zip.Dispose() }

$size = (Get-Item $zipPath).Length / 1KB
Write-Host ("완료: {0} ({1:N0} KB, 파일 {2}개)" -f $zipPath, $size, $files.Count)
