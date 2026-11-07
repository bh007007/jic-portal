<#
.SYNOPSIS
  업체 포털 추출 파일(.json.gz)을 하드디스크에서 쓰기 좋은 테이블 파일로 나눈다.

.DESCRIPTION
  data/raw/*.json.gz  →  data/tables/<테이블>.ndjson  (한 줄에 레코드 하나, 프로그램용)
                         data/tables/<테이블>.csv     (UTF-8 BOM, 엑셀용)
                         data/tables/meta.json
                         docs/data-dictionary.md      (열 이름과 값이 채워진 건수만, 개인정보 없음)

  data/ 폴더는 .gitignore로 GitHub에 올라가지 않는다. docs/data-dictionary.md 에는 값이 들어가지 않는다.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/split-export.ps1
  powershell -ExecutionPolicy Bypass -File scripts/split-export.ps1 -Source data/raw/jic_portal_export_2026-11-07.json.gz
#>
param(
  [string]$Source = "",
  [string]$OutDir = "data/tables",
  [string]$DictPath = "docs/data-dictionary.md"
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $Source) {
  $latest = Get-ChildItem "data/raw" -Filter "*.json.gz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { throw "data/raw 에 .json.gz 파일이 없습니다." }
  $Source = $latest.FullName
}
$Source = (Resolve-Path $Source).Path
New-Item -ItemType Directory -Force $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

Add-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Web.Script.Serialization;

public static class ExportSplitter
{
    // 압축을 풀면서 최상위 키별로 나눈다. 배열은 레코드마다 한 줄(NDJSON), 객체는 <키>.json.
    public static Dictionary<string, int> SplitToNdjson(string gzPath, string outDir)
    {
        var counts = new Dictionary<string, int>();
        var utf8 = new UTF8Encoding(false);
        using (var fs = File.OpenRead(gzPath))
        using (var gz = new GZipStream(fs, CompressionMode.Decompress))
        using (var sr = new StreamReader(gz, Encoding.UTF8, false, 1 << 20))
        {
            int depth = 0; bool inStr = false, esc = false;
            var key = new StringBuilder(); string curKey = null;
            var rec = new StringBuilder(); bool capRec = false;
            var obj = new StringBuilder(); bool capObj = false;
            StreamWriter w = null; bool inArray = false;
            var buf = new char[1 << 20]; int n;
            while ((n = sr.Read(buf, 0, buf.Length)) > 0)
            {
                for (int i = 0; i < n; i++)
                {
                    char c = buf[i];
                    if (capRec) rec.Append(c);
                    if (capObj) obj.Append(c);
                    if (inStr)
                    {
                        if (esc) esc = false;
                        else if (c == '\\') esc = true;
                        else if (c == '"') { inStr = false; if (depth == 1) curKey = key.ToString(); }
                        else if (depth == 1) key.Append(c);
                        continue;
                    }
                    if (c == '"') { inStr = true; if (depth == 1) key.Clear(); continue; }
                    if (c == '{' || c == '[')
                    {
                        if (depth == 1)
                        {
                            if (c == '[') { inArray = true; w = new StreamWriter(Path.Combine(outDir, curKey + ".ndjson"), false, utf8); counts[curKey] = 0; }
                            else { capObj = true; obj.Clear(); obj.Append(c); }
                        }
                        else if (depth == 2 && inArray && c == '{') { capRec = true; rec.Clear(); rec.Append(c); }
                        depth++;
                        continue;
                    }
                    if (c == '}' || c == ']')
                    {
                        depth--;
                        if (capRec && depth == 2) { w.WriteLine(rec.ToString()); counts[curKey]++; capRec = false; }
                        if (capObj && depth == 1) { File.WriteAllText(Path.Combine(outDir, curKey + ".json"), obj.ToString(), utf8); capObj = false; }
                        if (inArray && depth == 1 && c == ']') { w.Dispose(); w = null; inArray = false; }
                    }
                }
            }
        }
        return counts;
    }

    static string Cell(object v, JavaScriptSerializer js)
    {
        if (v == null) return "";
        string s = (v is string) ? (string)v : ((v is Dictionary<string, object> || v is object[] || v is System.Collections.ArrayList) ? js.Serialize(v) : Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture));
        if (s.IndexOfAny(new[] { ',', '"', '\n', '\r' }) >= 0) s = "\"" + s.Replace("\"", "\"\"") + "\"";
        return s;
    }

    // NDJSON 한 개를 CSV로 바꾸고, 열마다 값이 채워진 건수를 돌려준다 (값 자체는 돌려주지 않는다).
    public static List<KeyValuePair<string, int>> NdjsonToCsv(string ndjsonPath, string csvPath)
    {
        var js = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 256 };
        var cols = new List<string>(); var seen = new HashSet<string>(); var filled = new Dictionary<string, int>();
        foreach (var line in File.ReadLines(ndjsonPath, Encoding.UTF8))
        {
            if (line.Length == 0) continue;
            var d = js.Deserialize<Dictionary<string, object>>(line);
            foreach (var kv in d)
            {
                if (seen.Add(kv.Key)) { cols.Add(kv.Key); filled[kv.Key] = 0; }
                if (kv.Value != null && !(kv.Value is string && ((string)kv.Value).Length == 0)) filled[kv.Key]++;
            }
        }
        using (var w = new StreamWriter(csvPath, false, new UTF8Encoding(true)))
        {
            w.WriteLine(string.Join(",", cols));
            var row = new string[cols.Count];
            foreach (var line in File.ReadLines(ndjsonPath, Encoding.UTF8))
            {
                if (line.Length == 0) continue;
                var d = js.Deserialize<Dictionary<string, object>>(line);
                for (int i = 0; i < cols.Count; i++) { object v; row[i] = d.TryGetValue(cols[i], out v) ? Cell(v, js) : ""; }
                w.WriteLine(string.Join(",", row));
            }
        }
        var result = new List<KeyValuePair<string, int>>();
        foreach (var c in cols) result.Add(new KeyValuePair<string, int>(c, filled[c]));
        return result;
    }
}
'@

Write-Host "원본: $Source"
$sw = [Diagnostics.Stopwatch]::StartNew()
$counts = [ExportSplitter]::SplitToNdjson($Source, $OutDir)

$meta = Get-Content -Raw -Encoding UTF8 (Join-Path $OutDir "meta.json") | ConvertFrom-Json
$problems = @()
foreach ($k in $counts.Keys) {
  $expected = $meta.counts.$k
  if ($null -ne $expected -and [int]$expected -ne $counts[$k]) { $problems += "$k : 파일 $($counts[$k]) / 메타 $expected" }
}

$dict = New-Object System.Text.StringBuilder
[void]$dict.AppendLine("# 데이터 사전 (업체 포털 추출본)")
[void]$dict.AppendLine("")
[void]$dict.AppendLine("업체 포털에서 추출한 테이블별 열 이름과, 값이 채워진 레코드 수다. 값은 담지 않는다. ``scripts/split-export.ps1``이 만든다.")
[void]$dict.AppendLine("")
[void]$dict.AppendLine("- 추출 시각: $($meta.extracted_at)")
[void]$dict.AppendLine("- 출처: $($meta.source)")
[void]$dict.AppendLine("- 제외한 필드: $($meta.excluded_fields -join ', ')")
[void]$dict.AppendLine("")
[void]$dict.AppendLine("| 테이블 | 레코드 | 열 |")
[void]$dict.AppendLine("| --- | ---: | ---: |")
$sections = New-Object System.Text.StringBuilder

foreach ($k in $counts.Keys) {
  $nd = Join-Path $OutDir "$k.ndjson"
  if ($counts[$k] -eq 0) { [void]$dict.AppendLine("| $k | 0 | 0 |"); continue }
  $cols = [ExportSplitter]::NdjsonToCsv($nd, (Join-Path $OutDir "$k.csv"))
  [void]$dict.AppendLine("| $k | $($counts[$k]) | $($cols.Count) |")
  [void]$sections.AppendLine("")
  [void]$sections.AppendLine("## $k")
  [void]$sections.AppendLine("")
  [void]$sections.AppendLine("레코드 $($counts[$k])건, 열 $($cols.Count)개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).")
  [void]$sections.AppendLine("")
  [void]$sections.AppendLine("| 열 | 값 있음 |")
  [void]$sections.AppendLine("| --- | ---: |")
  foreach ($c in $cols) { [void]$sections.AppendLine("| ``$($c.Key)`` | $($c.Value) |") }
  Write-Host ("  {0,-18} {1,6} 건  {2,4} 열" -f $k, $counts[$k], $cols.Count)
}
[void]$dict.Append($sections.ToString())
New-Item -ItemType Directory -Force (Split-Path -Parent $DictPath) | Out-Null
[IO.File]::WriteAllText((Join-Path $root $DictPath), $dict.ToString(), (New-Object Text.UTF8Encoding($false)))

$sw.Stop()
if ($problems.Count) { Write-Warning ("건수 불일치: " + ($problems -join '; ')) } else { Write-Host "건수 검증: 메타 정보와 모두 일치" }
Write-Host ("완료 {0:N0}초 → {1}" -f $sw.Elapsed.TotalSeconds, $OutDir)
