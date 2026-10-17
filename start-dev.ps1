[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Write-Host '====================================='
Write-Host 'Lastro - Ambiente de desenvolvimento'
Write-Host '====================================='

# Use the script location, including when launched from another directory.
Push-Location -LiteralPath $PSScriptRoot
try {
    $environment = & (Join-Path $PSScriptRoot 'scripts/check-environment.ps1') -PassThru
    if (-not $environment) {
        if ($LASTEXITCODE) { exit $LASTEXITCODE }
        exit 1
    }
    if (-not $environment.DependenciesInstalled) {
        Write-Host 'Instalando dependencias do projeto...'
        try {
            & $environment.PnpmPath install --frozen-lockfile
            $installCode = $LASTEXITCODE
        } catch {
            Write-Host '[DEPENDENCY_INSTALL_FAILED] Nao foi possivel executar pnpm install. Confira a instalacao do pnpm.' -ForegroundColor Red
            exit 20
        }
        if ($installCode -ne 0) {
            Write-Host "[DEPENDENCY_INSTALL_FAILED] pnpm install terminou com codigo $installCode. Confira o erro acima, a rede e as permissoes da pasta do projeto." -ForegroundColor Red
            exit 20
        }
    }
    Write-Host 'Iniciando sistema...'
    try {
        & $environment.PnpmPath dev
        $serverCode = $LASTEXITCODE
    } catch {
        Write-Host '[DEV_SERVER_FAILED] Nao foi possivel executar pnpm dev. Confira a instalacao do pnpm e a pasta do projeto.' -ForegroundColor Red
        exit 21
    }
    if ($serverCode -ne 0) {
        Write-Host "[DEV_SERVER_FAILED] pnpm dev terminou com codigo $serverCode. Confira a mensagem do Vinext acima. Ctrl+C tambem pode resultar em codigo diferente de zero." -ForegroundColor Red
        exit 21
    }
} finally {
    Pop-Location
}
