param([switch]$Restart)
if ($Restart) {
  $p = netstat -ano | Select-String ":5173.*LISTENING"
  if ($p) {
    $id = $p.ToString().Trim() -split '\s+' | Select-Object -Last 1
    taskkill /PID $id /F *>$null
    Start-Sleep 2
  }
  Start-Process -NoNewWindow -FilePath "cmd.exe" -WorkingDirectory $PSScriptRoot -ArgumentList "/c npm run dev"
  Start-Sleep 4
}
Invoke-RestMethod -Uri http://localhost:5173/api/reload-scene -Method POST
