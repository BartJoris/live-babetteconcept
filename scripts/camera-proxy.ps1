# Camera Snapshot Proxy voor Babette Concept
# Draait op de Windows PC (Dell OptiPlex) en stuurt snapshot-requests door naar de camera's.
#
# Gebruik:
#   PowerShell -ExecutionPolicy Bypass -File camera-proxy.ps1
#
# Of als Windows Service via NSSM:
#   nssm install CameraProxy "powershell.exe" "-ExecutionPolicy Bypass -File C:\scripts\camera-proxy.ps1"
#
# Test:
#   http://192.168.1.79:9090/snapshot/1  -> Snapshot van camera 172.16.1.101
#   http://192.168.1.79:9090/health      -> Status check

$Port = 9090

$Cameras = @{
    "1" = @{ Name = "Winkel Ingang";  IP = "172.16.1.101" }
    "2" = @{ Name = "Camera 2";       IP = "172.16.1.102" }
    "3" = @{ Name = "Camera 3";       IP = "172.16.1.103" }
    "4" = @{ Name = "Camera 4";       IP = "172.16.1.104" }
}

# Camera credentials (pas aan naar je eigen instellingen)
$CameraUser = "admin"
$CameraPass = "your_camera_password"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")

try {
    $listener.Start()
    Write-Host "Camera Proxy gestart op poort $Port" -ForegroundColor Green
    Write-Host "Druk Ctrl+C om te stoppen" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Endpoints:"
    foreach ($key in $Cameras.Keys | Sort-Object) {
        $cam = $Cameras[$key]
        Write-Host "  http://192.168.1.79:$Port/snapshot/$key  ->  $($cam.Name) ($($cam.IP))"
    }
    Write-Host "  http://192.168.1.79:$Port/health  ->  Status check"
    Write-Host ""
}
catch {
    Write-Host "FOUT: Kan niet luisteren op poort $Port. Draai als Administrator." -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $path = $request.Url.AbsolutePath

        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $($request.HttpMethod) $path" -NoNewline

        # Health check
        if ($path -eq "/health") {
            $body = [System.Text.Encoding]::UTF8.GetBytes('{"status":"ok","cameras":' + $Cameras.Count + '}')
            $response.ContentType = "application/json"
            $response.StatusCode = 200
            $response.OutputStream.Write($body, 0, $body.Length)
            $response.Close()
            Write-Host " -> 200 OK" -ForegroundColor Green
            continue
        }

        # Snapshot request: /snapshot/{nummer}
        if ($path -match "^/snapshot/(\d+)$") {
            $cameraNum = $Matches[1]
            $camera = $Cameras[$cameraNum]

            if (-not $camera) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Camera niet gevonden"}')
                $response.ContentType = "application/json"
                $response.StatusCode = 404
                $response.OutputStream.Write($body, 0, $body.Length)
                $response.Close()
                Write-Host " -> 404 Camera $cameraNum niet gevonden" -ForegroundColor Yellow
                continue
            }

            $url = "http://$($camera.IP)/cgi-bin/snapshot.cgi?channel=0"

            try {
                $cred = New-Object System.Net.NetworkCredential($CameraUser, $CameraPass)
                $webRequest = [System.Net.HttpWebRequest]::Create($url)
                $webRequest.Credentials = $cred
                $webRequest.Timeout = 10000
                $webRequest.Method = "GET"

                $webResponse = $webRequest.GetResponse()
                $stream = $webResponse.GetResponseStream()

                $memStream = New-Object System.IO.MemoryStream
                $stream.CopyTo($memStream)
                $imageBytes = $memStream.ToArray()

                $stream.Close()
                $webResponse.Close()
                $memStream.Close()

                $response.ContentType = "image/jpeg"
                $response.StatusCode = 200
                $response.Headers.Add("Cache-Control", "no-store, must-revalidate")
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.OutputStream.Write($imageBytes, 0, $imageBytes.Length)
                $response.Close()

                Write-Host " -> 200 OK ($($imageBytes.Length) bytes) [$($camera.Name)]" -ForegroundColor Green
            }
            catch {
                $errMsg = $_.Exception.Message
                $body = [System.Text.Encoding]::UTF8.GetBytes("{`"error`":`"$errMsg`"}")
                $response.ContentType = "application/json"
                $response.StatusCode = 502
                $response.OutputStream.Write($body, 0, $body.Length)
                $response.Close()
                Write-Host " -> 502 FOUT: $errMsg" -ForegroundColor Red
            }
        }
        else {
            $body = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Onbekend pad","hint":"Gebruik /snapshot/1 t/m /snapshot/4"}')
            $response.ContentType = "application/json"
            $response.StatusCode = 404
            $response.OutputStream.Write($body, 0, $body.Length)
            $response.Close()
            Write-Host " -> 404" -ForegroundColor Yellow
        }
    }
    catch [System.Net.HttpListenerException] {
        break
    }
    catch {
        Write-Host "Fout: $($_.Exception.Message)" -ForegroundColor Red
    }
}

$listener.Stop()
Write-Host "Proxy gestopt." -ForegroundColor Yellow
