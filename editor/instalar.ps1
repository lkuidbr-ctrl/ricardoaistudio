# Instalador do editor de vídeos para Windows.
# Rode com dois cliques no "instalar-windows.bat" (na pasta principal do projeto).
# Pode rodar de novo quantas vezes quiser: ele pula o que já está instalado e atualiza o resto.
# Com -Atualizacao (usado pelo botão "Buscar atualização" do app) ele não faz perguntas.

param([switch]$Atualizacao)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # deixa os downloads bem mais rápidos no PowerShell 5
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Editor = $PSScriptRoot
Set-Location $Editor

function Titulo([string]$texto) { Write-Host ''; Write-Host "==> $texto" -ForegroundColor Cyan }
function Ok([string]$texto) { Write-Host "    OK  $texto" -ForegroundColor Green }
function Aviso([string]$texto) { Write-Host "    !!  $texto" -ForegroundColor Yellow }

function Atualizar-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}

# Lembra o que já foi instalado (por "impressão digital" dos arquivos) para pular
# o que não mudou. Fica em editor\.estado-instalacao.json.
$ArquivoEstado = Join-Path $Editor '.estado-instalacao.json'
$Estado = @{}
if (Test-Path $ArquivoEstado) {
    try {
        (Get-Content $ArquivoEstado -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $Estado[$_.Name] = $_.Value }
    } catch {
        $Estado = @{}  # arquivo corrompido: refaz tudo
    }
}
function Impressao([string[]]$caminhos) {
    $arquivos = foreach ($c in $caminhos) {
        $alvo = Join-Path $Editor $c
        if (Test-Path $alvo -PathType Container) { Get-ChildItem $alvo -Recurse -File | Sort-Object FullName }
        elseif (Test-Path $alvo) { Get-Item $alvo }
    }
    $partes = ($arquivos | ForEach-Object { (Get-FileHash $_.FullName -Algorithm SHA256).Hash }) -join ''
    $sha = [Security.Cryptography.SHA256]::Create()
    return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($partes))) -replace '-', ''
}
function JaFeito([string]$chave, [string]$impressao) { return $Estado[$chave] -eq $impressao }
function MarcarFeito([string]$chave, [string]$impressao) {
    $Estado[$chave] = $impressao
    $Estado | ConvertTo-Json | Set-Content $ArquivoEstado -Encoding UTF8
}

# Roda um programa e devolve o código de saída e tudo o que ele escreveu. No PowerShell do
# Windows, com $ErrorActionPreference = 'Stop', qualquer texto na saída de erro (como um
# "Traceback" do Python) derrubaria o instalador; aqui isso é só lido, não vira erro.
function Saida([scriptblock]$comando) {
    $anterior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $linhas = @(& $comando 2>&1 | ForEach-Object { "$_" })
        $codigo = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $anterior
    }
    return [pscustomobject]@{ Codigo = $codigo; Linhas = $linhas; Ultima = ($linhas | Where-Object { $_.Trim() } | Select-Object -Last 1) }
}

function Rodar([string]$descricao, [scriptblock]$comando) {
    & $comando
    if ($LASTEXITCODE -ne 0) { throw "$descricao falhou (código $LASTEXITCODE)." }
}

function Winget-Instalar([string]$id, [string]$nome) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "Não achei o winget para instalar o $nome. Atualize o 'Instalador de Aplicativo' na Microsoft Store, ou instale o $nome manualmente e rode este instalador de novo."
    }
    Write-Host "    Instalando $nome (pode pedir permissão do Windows)..."
    & winget install -e --id $id --accept-source-agreements --accept-package-agreements --silent
    Atualizar-Path
}

# Devolve @(exe, argumentos...) de um Python 3.10 a 3.13, ou $null.
function Achar-Python {
    $candidatos = @(
        @('py', '-3.12'), @('py', '-3.13'), @('py', '-3.11'), @('py', '-3.10'),
        @("$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"),
        @("$env:ProgramFiles\Python312\python.exe"),
        @('python')
    )
    foreach ($c in $candidatos) {
        $exe = $c[0]
        if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { continue }
        # O "python" da Microsoft Store é só um atalho que abre a loja; testa de verdade.
        $argumentos = @($c | Select-Object -Skip 1) + @('-c', 'import sys; print(sys.version_info[1] if sys.version_info[0] == 3 else 0)')
        try { $menor = & $exe @argumentos 2>$null } catch { continue }
        if ($LASTEXITCODE -eq 0 -and "$menor" -match '^\d+$' -and [int]"$menor" -ge 10 -and [int]"$menor" -le 13) {
            return ,$c
        }
    }
    return $null
}

try {
    Write-Host ''
    Write-Host '  Editor de vídeos curtos - instalação no Windows' -ForegroundColor White
    Write-Host '  (leva uns 10-20 minutos na primeira vez; deixe a janela aberta)'

    # Arquivos baixados em ZIP vêm "bloqueados" pelo Windows; libera os do projeto.
    Get-ChildItem -Path (Split-Path $Editor -Parent) -Recurse -Include *.ps1, *.bat -ErrorAction SilentlyContinue |
        Unblock-File -ErrorAction SilentlyContinue

    try {
        $livre = (Get-PSDrive -Name $Editor.Substring(0, 1)).Free
        if ($livre -lt 10GB) {
            Aviso ("Só {0:N0} GB livres no disco. A instalação usa uns 5 GB e cada vídeo exportado ocupa espaço." -f ($livre / 1GB))
        }
    } catch {
        $livre = $null  # não deu para medir o disco; segue a instalação
    }

    # ---------------------------------------------------------------- Node.js
    Titulo '1/6  Node.js'
    $nodeOk = $false
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $versao = (& node --version) -replace '^v', ''
        $nodeOk = [int]($versao.Split('.')[0]) -ge 20
    }
    if (-not $nodeOk) {
        Winget-Instalar 'OpenJS.NodeJS.LTS' 'Node.js'
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            throw 'O Node.js foi instalado, mas o Windows ainda não o encontra. Feche esta janela e rode o instalador de novo.'
        }
    }
    Ok "Node.js $(& node --version)"

    # ---------------------------------------------------------------- Python
    Titulo '2/6  Python'
    $python = Achar-Python
    if (-not $python) {
        Winget-Instalar 'Python.Python.3.12' 'Python 3.12'
        $python = Achar-Python
        if (-not $python) {
            throw 'O Python foi instalado, mas o Windows ainda não o encontra. Feche esta janela e rode o instalador de novo.'
        }
    }
    $pyExe = $python[0]
    $pyArgs = @($python | Select-Object -Skip 1)
    Ok "Python $(& $pyExe @pyArgs --version)"

    # ---------------------------------------------------------------- Editor (Node)
    Titulo '3/6  Editor (Remotion)'
    $impNpm = Impressao @('package.json', 'package-lock.json')
    if ((Test-Path (Join-Path $Editor 'node_modules')) -and (JaFeito 'npm' $impNpm)) {
        Ok 'pacotes do editor já instalados'
    } else {
        Rodar 'npm install' { & npm install --no-fund --no-audit }
        MarcarFeito 'npm' $impNpm
        Ok 'pacotes do editor instalados'
    }
    $impApp = Impressao @('app\src', 'app\vite.config.mjs', 'src', 'package-lock.json')
    if ((Test-Path (Join-Path $Editor 'app\dist\index.html')) -and (JaFeito 'interface' $impApp)) {
        Ok 'interface já preparada'
    } else {
        Rodar 'Preparar a interface' { & npm run app:build }
        MarcarFeito 'interface' $impApp
        Ok 'interface preparada'
    }

    # ---------------------------------------------------------------- Scripts (Python)
    Titulo '4/6  Scripts de IA (Whisper, recorte, voz...)'
    $venvPy = Join-Path $Editor '.venv\Scripts\python.exe'
    if (-not (Test-Path $venvPy)) {
        Rodar 'Criar o ambiente Python' { & $pyExe @pyArgs -m venv (Join-Path $Editor '.venv') }
    }
    if (-not $Estado['pip-atualizado']) {
        Rodar 'Atualizar o pip' { & $venvPy -m pip install --upgrade pip --quiet }
        MarcarFeito 'pip-atualizado' 'sim'
    }

    # As IAs locais (Whisper, recorte da pessoa, voz) precisam do "Microsoft Visual C++
    # Redistributable"; sem ele, dão erro de DLL ao abrir.
    $sistema = Join-Path $env:WINDIR 'System32'
    if (-not (Test-Path (Join-Path $sistema 'vcruntime140_1.dll')) -or -not (Test-Path (Join-Path $sistema 'msvcp140.dll'))) {
        try {
            Winget-Instalar 'Microsoft.VCRedist.2015+.x64' 'Microsoft Visual C++ (necessário para a IA)'
        } catch {
            Aviso "Não consegui instalar o Visual C++: $($_.Exception.Message)"
        }
    }

    # O PyTorch e o Piper não são mais usados (o recorte da pessoa e a voz agora rodam no ONNX,
    # bem mais leve). Instalações antigas: remove, liberando de 1 a 3 GB de disco.
    $mexeu = $false
    foreach ($velho in @('torch', 'piper-tts')) {
        if ((Saida { & $venvPy -m pip show $velho }).Codigo -eq 0) {
            Rodar "Remover $velho (não é mais necessário)" { & $venvPy -m pip uninstall -y $velho torchvision }
            $mexeu = $true
        }
    }

    $impPip = Impressao @('scripts\requirements.txt')
    if (JaFeito 'pip' $impPip) {
        Ok 'scripts de IA já instalados'
    } else {
        Rodar 'Instalar os scripts' { & $venvPy -m pip install -r (Join-Path $Editor 'scripts\requirements.txt') }
        MarcarFeito 'pip' $impPip
        $mexeu = $true
        Ok 'scripts de IA instalados'
    }
    if ($mexeu) {
        # Os instaladores baixados ficam guardados no cache do pip (podem passar de 2 GB): apaga.
        Saida { & $venvPy -m pip cache purge } | Out-Null
    }

    # ---------------------------------------------------------------- atualizações e atalhos
    # (O Claude entra só pela chave da API, colada no app: não há mais login pelo navegador.)
    Titulo '5/6  Atualizações e atalho'

    # Git: usado pelo botão "Buscar atualização" do app (baixa só o que mudou).
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Winget-Instalar 'Git.Git' 'Git'
    }
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Ok "$(& git --version)"
    } else {
        Aviso 'Não consegui instalar o Git; o botão de atualizar do app não vai funcionar.'
    }


    # Atalhos: abrem o Studio sem janela preta (PowerShell escondido + janela de app).
    $desktop = [Environment]::GetFolderPath('Desktop')
    $menuIniciar = Join-Path ([Environment]::GetFolderPath('Programs')) 'Ricardo AI Studio.lnk'
    $shell = New-Object -ComObject WScript.Shell
    foreach ($destino in @((Join-Path $desktop 'Ricardo AI Studio.lnk'), $menuIniciar)) {
        $lnk = $shell.CreateShortcut($destino)
        $lnk.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $Editor 'iniciar.ps1')`""
        $lnk.WorkingDirectory = $Editor
        $lnk.WindowStyle = 7  # minimizado: nem pisca na tela
        $lnk.IconLocation = (Join-Path $Editor 'app\icone.ico') + ',0'
        $lnk.Description = 'Editor de vídeos curtos com IA'
        $lnk.Save()
    }
    # Atalhos antigos (versões anteriores): o terminal não é mais necessário no dia a dia.
    Remove-Item (Join-Path $desktop 'Editor de Vídeo.lnk'), (Join-Path $desktop 'Terminal do Editor.lnk') -ErrorAction SilentlyContinue
    Ok 'atalho "Ricardo AI Studio" na Área de Trabalho e no Menu Iniciar'

    if ($Atualizacao) {
        Write-Host ''
        Write-Host '  Atualização concluída! Abrindo o Studio de novo...' -ForegroundColor Green
        exit 0
    }

    # ---------------------------------------------------------------- Pexels + atalhos
    Titulo '6/6  Últimos ajustes'
    if (-not [Environment]::GetEnvironmentVariable('PEXELS_API_KEY', 'User')) {
        Write-Host '    Para o B-roll automático, pegue uma chave grátis em https://www.pexels.com/api/'
        $chave = Read-Host '    Cole a chave do Pexels (ou só Enter para pular)'
        if ($chave.Trim()) {
            [Environment]::SetEnvironmentVariable('PEXELS_API_KEY', $chave.Trim(), 'User')
            Ok 'chave do Pexels salva'
        }
    } else {
        Ok 'chave do Pexels já configurada'
    }



    Write-Host ''
    Write-Host '  Tudo pronto!' -ForegroundColor Green
    Write-Host '  Abra o atalho "Ricardo AI Studio" na Área de Trabalho e arraste seu vídeo para a janela.'
    Write-Host '  Ele abre numa janela própria; quando você fecha a janela, ele se desliga sozinho.'
    Write-Host ''
    exit 0
} catch {
    Write-Host ''
    Write-Host "  ERRO: $($_.Exception.Message)" -ForegroundColor Red
    if ($Atualizacao) { Write-Host '  O Studio vai abrir mesmo assim; se algo não funcionar, rode o instalar-windows.bat.' }
    Write-Host '  Tire um print desta janela e mande para o Claude que ele ajuda a resolver.'
    Write-Host ''
    exit 1
}
