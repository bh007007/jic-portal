# 샘플 데이터(data-sample/tables)를 Supabase legacy_* 테이블에 올린다.
# 사용: powershell -ExecutionPolicy Bypass -File scripts\upload-sample.ps1 -Url https://<프로젝트>.supabase.co
# secret(service_role) 키는 화면에 보이지 않게 입력받고, 이 창에서만 쓴 뒤 지운다. 파일·기록에 남기지 않는다.
param([Parameter(Mandatory = $true)][string]$Url)

$secure = Read-Host "Supabase secret 키를 붙여 넣고 Enter (화면에 보이지 않음)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:SUPABASE_URL = $Url
  $env:SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = "C:\Program Files\nodejs\node.exe" }
  & $node (Join-Path $PSScriptRoot "upload-to-supabase.mjs") --replace
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
}
