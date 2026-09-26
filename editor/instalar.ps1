# Instalador do editor de vídeos para Windows.
# Rode com dois cliques no "instalar-windows.bat" (na pasta principal do projeto).
# Pode rodar de novo quantas vezes quiser: ele pula o que já está instalado e atualiza o resto.

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
    Rodar 'npm install' { & npm install --no-fund --no-audit }
    Rodar 'Preparar a interface' { & npm run app:build }
    Ok 'pacotes do editor instalados'

    # ---------------------------------------------------------------- Scripts (Python)
    Titulo '4/6  Scripts de IA (Whisper, recorte, voz...)'
    $venvPy = Join-Path $Editor '.venv\Scripts\python.exe'
    if (-not (Test-Path $venvPy)) {
        Rodar 'Criar o ambiente Python' { & $pyExe @pyArgs -m venv (Join-Path $Editor '.venv') }
    }
    Rodar 'Atualizar o pip' { & $venvPy -m pip install --upgrade pip --quiet }

    $nvidia = $false
    try {
        $nvidia = [bool](Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'NVIDIA' })
    } catch {
        $nvidia = $false  # sem como detectar a placa: usa a versão para processador, que sempre funciona
    }
    if ($nvidia) {
        Write-Host '    Placa NVIDIA encontrada: instalando o PyTorch com aceleração (download grande, ~2,5 GB)...'
        $indice = 'https://download.pytorch.org/whl/cu126'
    } else {
        Write-Host '    Sem placa NVIDIA: instalando o PyTorch para processador (~200 MB)...'
        $indice = 'https://download.pytorch.org/whl/cpu'
    }
    Rodar 'Instalar o PyTorch' { & $venvPy -m pip install torch torchvision --index-url $indice }
    Rodar 'Instalar os scripts' { & $venvPy -m pip install -r (Join-Path $Editor 'scripts\requirements.txt') }
    Ok 'scripts de IA instalados'

    # ---------------------------------------------------------------- ant (login do Claude)
    Titulo '5/6  Login no Claude (ferramenta "ant")'
    $pastaAnt = Join-Path $env:LOCALAPPDATA 'Programs\ant'
    if (-not (Get-Command ant -ErrorAction SilentlyContinue)) {
        $arq = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
        $url = $null
        try {
            $release = Invoke-RestMethod 'https://api.github.com/repos/anthropics/anthropic-cli/releases/latest' -Headers @{ 'User-Agent' = 'ricardoaistudio-instalador' }
            $url = ($release.assets | Where-Object { $_.name -like "*_windows_$arq.zip" } | Select-Object -First 1).browser_download_url
        } catch {
            $url = $null  # sem acesso à API do GitHub: usa a versão fixa abaixo
        }
        if (-not $url) {
            $url = "https://github.com/anthropics/anthropic-cli/releases/download/v1.35.0/ant_1.35.0_windows_$arq.zip"
        }
        $zip = Join-Path $env:TEMP 'ant-windows.zip'
        $tmp = Join-Path $env:TEMP 'ant-windows'
        Write-Host "    Baixando $url"
        Invoke-WebRequest $url -OutFile $zip -UseBasicParsing
        if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
        Expand-Archive $zip -DestinationPath $tmp -Force
        $antExe = Get-ChildItem $tmp -Recurse -Filter 'ant.exe' | Select-Object -First 1
        if (-not $antExe) { throw 'Não achei o ant.exe dentro do arquivo baixado.' }
        New-Item -ItemType Directory -Force -Path $pastaAnt | Out-Null
        Copy-Item $antExe.FullName (Join-Path $pastaAnt 'ant.exe') -Force
        Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue

        $pathUsuario = [Environment]::GetEnvironmentVariable('Path', 'User')
        if (($pathUsuario -split ';') -notcontains $pastaAnt) {
            [Environment]::SetEnvironmentVariable('Path', ($pathUsuario.TrimEnd(';') + ';' + $pastaAnt), 'User')
        }
        Atualizar-Path
    }
    Ok "ant $(& ant --version)"

    if ([Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'User') -or [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'Machine')) {
        Aviso 'Existe uma ANTHROPIC_API_KEY no seu Windows: ela passa na frente do login.'
        Aviso 'Para usar o login, apague essa variável em "Editar as variáveis de ambiente".'
    }
    Write-Host ''
    & ant auth status
    Write-Host ''
    $resposta = Read-Host '    Fazer login no Claude agora? Abre o navegador. (S/n)'
    if ($resposta -notmatch '^[nN]') {
        & ant auth login
        if ($LASTEXITCODE -ne 0) { Aviso 'O login não terminou. Depois, rode "ant auth login" no Terminal do Editor.' }
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

    $desktop = [Environment]::GetFolderPath('Desktop')
    $shell = New-Object -ComObject WScript.Shell
    foreach ($atalho in @(
        @{ Nome = 'Ricardo AI Studio'; Alvo = 'abrir-editor.bat'; Descricao = 'Abre o editor de vídeos no navegador' },
        @{ Nome = 'Terminal do Editor'; Alvo = 'terminal-editor.bat'; Descricao = 'Terminal pronto para rodar os scripts' }
    )) {
        $lnk = $shell.CreateShortcut((Join-Path $desktop "$($atalho.Nome).lnk"))
        $lnk.TargetPath = Join-Path $Editor $atalho.Alvo
        $lnk.WorkingDirectory = $Editor
        $lnk.Description = $atalho.Descricao
        $lnk.Save()
    }
    # Remove o atalho antigo (versão sem interface visual)
    Remove-Item (Join-Path $desktop 'Editor de Vídeo.lnk') -ErrorAction SilentlyContinue
    Ok 'atalho "Ricardo AI Studio" criado na Área de Trabalho'


    Write-Host ''
    Write-Host '  Tudo pronto!' -ForegroundColor Green
    Write-Host '  Abra o atalho "Ricardo AI Studio" na Área de Trabalho e arraste seu vídeo para a janela.'
    Write-Host '  Ele abre no navegador; deixe a janela preta aberta enquanto estiver usando.'
    Write-Host ''
    exit 0
} catch {
    Write-Host ''
    Write-Host "  ERRO: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '  Tire um print desta janela e mande para o Claude que ele ajuda a resolver.'
    Write-Host ''
    exit 1
}
