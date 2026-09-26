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

    # Placa NVIDIA só compensa com 4 GB ou mais de memória de vídeo. Placas menores/antigas
    # (ex.: GTX 750 Ti, 2 GB) rendem pouco e costumam falhar; o processador faz o mesmo
    # trabalho e ainda economiza ~2 GB de download e de disco.
    $memoriaNvidia = 0
    try {
        # O valor do registro é exato; o AdapterRAM do WMI trava em 4 GB, mas serve de reserva.
        $chaves = Get-ItemProperty 'HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*' -ErrorAction SilentlyContinue |
            Where-Object { "$($_.DriverDesc)" -match 'NVIDIA' }
        foreach ($c in $chaves) {
            $q = $c.'HardwareInformation.qwMemorySize'
            if ($q) { $memoriaNvidia = [Math]::Max($memoriaNvidia, [double]$q) }
        }
        if (-not $memoriaNvidia) {
            Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'NVIDIA' } |
                ForEach-Object { $memoriaNvidia = [Math]::Max($memoriaNvidia, [double]$_.AdapterRAM) }
        }
    } catch {
        $memoriaNvidia = 0  # sem como detectar a placa: usa a versão para processador, que sempre funciona
    }
    $gbPlaca = [Math]::Round($memoriaNvidia / 1GB, 1)
    if ($memoriaNvidia -ge 3.5GB) {
        Write-Host "    Placa NVIDIA com $gbPlaca GB: instalando o PyTorch com aceleração (download grande, ~2,5 GB)..."
        $indice = 'https://download.pytorch.org/whl/cu126'
        $querCuda = $true
    } else {
        if ($memoriaNvidia -gt 0) {
            Write-Host "    Placa NVIDIA com só $gbPlaca GB: vou usar o processador, que rende igual e é mais estável."
        }
        Write-Host '    Instalando o PyTorch para processador (~200 MB)...'
        $indice = 'https://download.pytorch.org/whl/cpu'
        $querCuda = $false
    }

    # O PyTorch (e outras IAs) precisam do "Microsoft Visual C++ Redistributable"; sem ele,
    # o "import torch" falha com erro de DLL.
    $sistema = Join-Path $env:WINDIR 'System32'
    if (-not (Test-Path (Join-Path $sistema 'vcruntime140_1.dll')) -or -not (Test-Path (Join-Path $sistema 'msvcp140.dll'))) {
        try {
            Winget-Instalar 'Microsoft.VCRedist.2015+.x64' 'Microsoft Visual C++ (necessário para a IA)'
        } catch {
            Aviso "Não consegui instalar o Visual C++: $($_.Exception.Message)"
        }
    }

    # PyTorch: instala se não houver; reinstala se estiver quebrado ou for do tipo errado
    # (ex.: CUDA numa placa fraca); se já estiver certo, não mexe (economiza minutos).
    $testeTorch = { & $venvPy -c "import torch, torchvision; print('cuda' if torch.version.cuda else 'cpu')" }
    $teste = Saida $testeTorch
    $atual = if ($teste.Codigo -eq 0) { "$($teste.Ultima)".Trim() } else { $null }
    $instalado = (Saida { & $venvPy -m pip show torch }).Codigo -eq 0
    $mexeu = $false
    if (-not $atual -and $instalado) {
        Write-Host "    O PyTorch está instalado mas não abre ($($teste.Ultima)). Reinstalando..."
        Rodar 'Reinstalar o PyTorch' { & $venvPy -m pip install --force-reinstall torch torchvision --index-url $indice }
        $mexeu = $true
    } elseif (-not $atual) {
        Rodar 'Instalar o PyTorch' { & $venvPy -m pip install torch torchvision --index-url $indice }
        $mexeu = $true
    } elseif (($atual -eq 'cuda') -ne $querCuda) {
        Write-Host "    Trocando o PyTorch ($atual) pela versão certa para este computador..."
        Rodar 'Trocar o PyTorch' { & $venvPy -m pip install --force-reinstall --no-deps torch torchvision --index-url $indice }
        $mexeu = $true
    } else {
        Ok "PyTorch ($atual) já instalado"
    }
    if ($mexeu) {
        $teste = Saida $testeTorch
        if ($teste.Codigo -eq 0) {
            Ok "PyTorch ($("$($teste.Ultima)".Trim())) funcionando"
        } else {
            # Só o "Recortar a pessoa" depende do PyTorch: o resto do Studio segue funcionando.
            Aviso "O PyTorch não abre: $($teste.Ultima)"
            Aviso 'O "Recortar a pessoa" não vai funcionar até isso ser resolvido; o resto funciona. Mande um print para o Claude.'
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

    # ---------------------------------------------------------------- ant (login do Claude)
    Titulo '5/6  Login no Claude e atualizações'
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
