# One-off: MD -> HTML (marked) -> PDF via Edge headless. Requires Node/npm for marked.
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$MdPath = Join-Path $ProjectRoot 'docs\accounting-uats.md'
$PdfPath = Join-Path $ProjectRoot 'docs\accounting-uats.pdf'
$TempDir = Join-Path $env:TEMP ("mdpdf-edge-" + [guid]::NewGuid().ToString('n').Substring(0, 12))
$HtmlPath = Join-Path $TempDir 'out.html'

if (-not (Test-Path $MdPath)) { throw "Missing $MdPath" }

New-Item -ItemType Directory -Path $TempDir | Out-Null
try {
  Push-Location $TempDir
  npm init -y 2>$null | Out-Null
  npm install marked@9 --silent 2>$null | Out-Null

  $convertJs = @'
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");
marked.use({ gfm: true });
const mdPath = process.argv[2];
const htmlPath = process.argv[3];
const md = fs.readFileSync(mdPath, "utf8");
const body = marked.parse(md);
const css = `
body{font-family:Segoe UI,system-ui,sans-serif;line-height:1.45;max-width:920px;margin:24px auto;padding:0 16px;color:#111;}
code,pre{font-family:Consolas,monospace;font-size:0.88em;}
pre{background:#f6f8fa;padding:12px 14px;border-radius:6px;overflow-x:auto;border:1px solid #e1e4e8;}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:0.92em;}
th,td{border:1px solid #ccc;padding:8px;text-align:left;vertical-align:top;}
th{background:#f0f0f0;}
h1{font-size:1.75rem;margin-top:0;}
h2{font-size:1.35rem;border-bottom:1px solid #eee;padding-bottom:0.25em;}
h3{font-size:1.1rem;}
`;
const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>" + css + "</style></head><body>" + body + "</body></html>";
fs.writeFileSync(htmlPath, html, "utf8");
'@
  Set-Content -Path (Join-Path $TempDir 'convert.cjs') -Value $convertJs -Encoding UTF8
  node (Join-Path $TempDir 'convert.cjs') $MdPath $HtmlPath

  $edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  if (-not (Test-Path $edge)) {
    $edge = "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
  }
  if (-not (Test-Path $edge)) { throw "Microsoft Edge not found for headless PDF." }

  $absHtml = (Resolve-Path $HtmlPath).Path
  $fileUri = 'file:///' + ($absHtml -replace '\\', '/')

  $args = @(
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    "--print-to-pdf=$PdfPath",
    $fileUri
  )
  & $edge @args | Out-Null
  $deadline = (Get-Date).AddSeconds(15)
  while (-not (Test-Path $PdfPath) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 200
  }
  if (-not (Test-Path $PdfPath)) { throw "PDF was not created at $PdfPath" }
  Write-Host "Wrote $PdfPath"
}
finally {
  Pop-Location
  Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}
