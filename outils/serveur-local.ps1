# Petit serveur web local pour tester le quiz : sh/powershell outils/serveur-local.ps1 puis http://localhost:8765/
# (Le site ne fonctionne pas en ouvrant index.html directement : les modules JS et le JSON doivent passer par http.)
param([int]$Port = 8765)
$root = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.webmanifest' = 'application/manifest+json'
  '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.md' = 'text/markdown; charset=utf-8'
}
$l = New-Object Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Quiz géo : http://localhost:$Port/   (Ctrl+C pour arrêter)"
try {
  while ($l.IsListening) {
    $ctx = $l.GetContext()
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/') -replace '/', '\')))
      if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $ctx.Response.ContentType = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
        $ctx.Response.Headers['Cache-Control'] = 'no-store'
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $ctx.Response.StatusCode = 404
      }
    } catch { $ctx.Response.StatusCode = 500 }
    $ctx.Response.Close()
  }
} finally { $l.Stop() }
