# Abre o Ricardo AI Studio (sem janela preta) e o mantém atualizado.
# O atalho da Área de Trabalho roda este script escondido; o Studio abre numa janela
# própria. Quando você clica em "Buscar atualização", o motor baixa o código novo e fecha
# com o código 42: aqui instalamos só o que mudou e ligamos o motor de novo.

$Editor = $PSScriptRoot
Set-Location $Editor
$Log = Join-Path $Editor 'studio.log'

function Mostrar-Erro([string]$titulo, [string]$texto) {
    # Sem janela preta, um erro ao abrir precisa aparecer numa caixa de mensagem.
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($texto, $titulo, 'OK', 'Error') | Out-Null
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Mostrar-Erro 'Ricardo AI Studio' 'O Node.js não foi encontrado. Rode o instalar-windows.bat (na pasta do projeto) e tente de novo.'
    exit 1
}

# Outro Studio já está respondendo? (ex.: foi aberto de novo e assumiu o lugar deste)
function Studio-Respondendo {
    try {
        Invoke-WebRequest -Uri 'http://127.0.0.1:3210/api/versao' -UseBasicParsing -TimeoutSec 3 | Out-Null
        return $true
    } catch {
        return $false
    }
}

$primeiraVez = $true
$tentativas = 0
while ($true) {
    if (-not $primeiraVez) {
        # Depois de uma atualização a janela do Studio continua aberta e recarrega sozinha.
        $env:NO_OPEN = '1'
    }
    $inicio = Get-Date
    "==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') abrindo o Studio" | Out-File $Log -Encoding unicode  # mesma codificação do ">>" do PowerShell 5
    & node (Join-Path $Editor 'app\server.mjs') *>> $Log
    $codigo = $LASTEXITCODE
    $primeiraVez = $false
    "==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') o motor fechou (código $codigo)" | Out-File $Log -Append -Encoding unicode

    if ($codigo -eq 42) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Editor 'instalar.ps1') -Atualizacao *>> $Log
        continue
    }
    if ($codigo -ne 0 -and ((Get-Date) - $inicio).TotalSeconds -lt 60) {
        # Outro Studio assumiu o lugar (aberto de novo pelo atalho): está tudo certo.
        if (Studio-Respondendo) { break }
        # Fechou logo no começo sem motivo claro: tenta abrir mais uma vez antes de avisar.
        $tentativas++
        if ($tentativas -le 1) {
            Start-Sleep -Seconds 2
            continue
        }
        $fim = (Get-Content $Log -Tail 15 -ErrorAction SilentlyContinue) -join "`n"
        Mostrar-Erro 'Ricardo AI Studio não abriu' "O Studio não conseguiu abrir. Detalhes:`n`n$fim`n`nTire um print e mande para o Claude."
    }
    break
}
