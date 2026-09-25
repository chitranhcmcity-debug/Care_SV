param(
  [Parameter(Mandatory = $true)][string]$ProjectRoot,
  [Parameter(Mandatory = $true)][string]$Ports
)

$ErrorActionPreference = 'Stop'
$projectPath = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\') + '\'
$processes = Get-CimInstance Win32_Process
$targets = @{}
foreach ($port in $Ports.Split(',')) {
  $listeners = Get-NetTCPConnection -State Listen -LocalPort ([int]$port) -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $currentId = $listener.OwningProcess
    $seen = @{}
    while ($currentId -and -not $seen.ContainsKey($currentId)) {
      $seen[$currentId] = $true
      $entry = $processes | Where-Object ProcessId -eq $currentId | Select-Object -First 1
      if (-not $entry) { break }
      $command = ([string]$entry.CommandLine).Replace('/', '\')
      # Require the checkout's absolute path, not just a common name like server.js.
      if ($entry.Name -eq 'node.exe' -and
          $command.IndexOf($projectPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
          $command -match '(nodemon\\bin\\nodemon\.js|@angular\\cli\\bin\\ng\.js|backend\\server\.js)') {
        $targets[$entry.ProcessId] = $entry.CreationDate
      }
      $currentId = $entry.ParentProcessId
    }
  }
}

foreach ($targetId in $targets.Keys) {
  $live = Get-CimInstance Win32_Process -Filter "ProcessId = $targetId"
  if ($live -and $live.CreationDate -eq $targets[$targetId]) {
    Write-Host "Dang dung server cu cua du an (PID $targetId)..."
    & taskkill.exe /PID $targetId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $targetId -ErrorAction SilentlyContinue)) {
      throw "Khong dung duoc server cu PID $targetId."
    }
  }
}
