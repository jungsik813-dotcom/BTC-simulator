param([switch]$NoBrowser,[int]$BasePort=5175)
$ErrorActionPreference='Stop'
$simRoot=Split-Path -Parent $PSScriptRoot
$mutex=New-Object System.Threading.Mutex($false,'Local\BtcSimulatorLauncher')
$locked=$false
function Get-SimulatorState([int]$port) {
  try { $response=Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:'+ $port +'/') -TimeoutSec 1; if($response.Content -match 'content="btc-asset-simulator"|<title>Asset Simulator</title>'){return 'ready'} } catch {}
  $probe=New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback,$port)
  try {$probe.Start();return 'free'} catch {return 'occupied'} finally {$probe.Stop()}
}
try {
  $locked=$mutex.WaitOne(30000)
  if(-not $locked){throw 'Another launch is in progress. Try again shortly.'}
  $port=$null
  # First reuse this app, even if another app occupies the default port.
  for($candidate=$BasePort;$candidate -lt $BasePort+20;$candidate++){
    if((Get-SimulatorState $candidate) -eq 'ready'){$port=$candidate;break}
  }
  if($null -eq $port){
    $node=Get-Command node.exe -ErrorAction SilentlyContinue
    if(-not $node){throw 'Node.js was not found. Install Node.js first.'}
    $vite=Join-Path $simRoot 'node_modules/vite/bin/vite.js'
    if(-not (Test-Path -LiteralPath $vite)){throw 'Dependencies are missing. Run npm.cmd install in the simulator folder.'}
    for($candidate=$BasePort;$candidate -lt $BasePort+20;$candidate++){
      if((Get-SimulatorState $candidate) -eq 'free'){$port=$candidate;break}
    }
    if($null -eq $port){throw 'No available simulator port was found.'}
    $server=Start-Process -FilePath $node.Source -ArgumentList @(('"'+$vite+'"'),'--host','127.0.0.1','--port',[string]$port,'--strictPort') -WorkingDirectory $simRoot -WindowStyle Hidden -PassThru
    $ready=$false
    for($attempt=0;$attempt -lt 40;$attempt++){
      Start-Sleep -Milliseconds 500
      if((Get-SimulatorState $port) -eq 'ready'){$ready=$true;break}
      $server.Refresh()
      if($server.HasExited){throw 'The simulator server exited. Run npm.cmd run dev to inspect the error.'}
    }
    if(-not $ready){throw 'The simulator did not respond in time.'}
  }
  $url='http://127.0.0.1:'+ $port +'/'
  Write-Output $url
  if(-not $NoBrowser){Start-Process $url}
} catch {
  Write-Host ('Simulator launch failed: '+$_.Exception.Message) -ForegroundColor Red
  exit 1
} finally {
  if($locked){$mutex.ReleaseMutex()}
  $mutex.Dispose()
}
