# Abre o Ricardo AI Studio e o mantém atualizado.
# Quando você clica em "Buscar atualização" no app, o servidor baixa o código novo e
# fecha com o código 42; aqui instalamos só o que mudou e abrimos o Studio de novo.

$Editor = $PSScriptRoot
Set-Location $Editor

while ($true) {
    Write-Host ''
    Write-Host '  Abrindo o Ricardo AI Studio... (deixe esta janela aberta enquanto estiver usando)' -ForegroundColor Cyan
    & node (Join-Path $Editor 'app\server.mjs')
    if ($LASTEXITCODE -ne 42) { break }

    Write-Host ''
    Write-Host '  Atualização baixada. Instalando só o que mudou...' -ForegroundColor Cyan
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Editor 'instalar.ps1') -Atualizacao
}
