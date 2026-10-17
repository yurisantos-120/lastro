[CmdletBinding()]
param([switch]$PassThru)

# Read-only checks. No installation, PATH changes or Corepack activation.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Stop-EnvironmentCheck {
    param([string]$Code, [string]$Message, [int]$ExitCode)
    Write-Host "[$Code] $Message" -ForegroundColor Red
    exit $ExitCode
}

try {
    $package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    Stop-EnvironmentCheck 'PROJECT_CONFIG_INVALID' 'Nao foi possivel ler package.json.' 15
}

$node = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $node) {
    Stop-EnvironmentCheck 'NODE_NOT_FOUND' "Node.js nao foi encontrado no PATH. Instale Node.js compativel com $($package.engines.node) e reabra o terminal." 10
}
try {
    $nodeVersion = [string](& $node.Source --version 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'Node failed' }
} catch {
    Stop-EnvironmentCheck 'NODE_VERSION_INVALID' 'Nao foi possivel executar node --version.' 11
}

# The repository declares a simple >=major.minor.patch constraint.
# Fail explicitly if the format changes instead of guessing semver behavior.
if ($package.engines.node -notmatch '^>=(\d+\.\d+\.\d+)$') {
    Stop-EnvironmentCheck 'PROJECT_CONFIG_INVALID' 'O verificador precisa ser atualizado para o novo formato de engines.node.' 15
}
$minimumNode = [version]$Matches[1]
if ($nodeVersion.Trim() -notmatch '^v?(\d+\.\d+\.\d+)$') {
    Stop-EnvironmentCheck 'NODE_VERSION_INVALID' "Versao do Node nao suportada: $nodeVersion. Use uma versao estavel." 11
}
if ([version]$Matches[1] -lt $minimumNode) {
    Stop-EnvironmentCheck 'NODE_VERSION_INVALID' "Node $nodeVersion instalado; o projeto exige $($package.engines.node)." 11
}
Write-Host "Node.js: OK ($($nodeVersion.Trim()))"

if ($package.packageManager -notmatch '^pnpm@(\d+\.\d+\.\d+)$') {
    Stop-EnvironmentCheck 'PROJECT_CONFIG_INVALID' 'packageManager deve fixar pnpm@major.minor.patch.' 15
}
$expectedPnpm = $Matches[1]
# Prefer .cmd so a blocked npm-generated .ps1 shim does not prevent startup.
$pnpm = Get-Command pnpm.cmd,pnpm.exe,pnpm -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pnpm) {
    Stop-EnvironmentCheck 'PNPM_NOT_FOUND' "pnpm nao foi encontrado no PATH. Execute manualmente: npm.cmd install -g pnpm@$expectedPnpm . Depois reabra o terminal e confira pnpm.cmd -v. Se o prefixo global nao permitir escrita, consulte o README (instalacao no perfil do usuario)." 12
}
try {
    $pnpmVersion = [string](& $pnpm.Source --version 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'pnpm failed' }
} catch {
    Stop-EnvironmentCheck 'PNPM_VERSION_INVALID' "Falha ao executar pnpm --version. Confira a instalacao: npm.cmd install -g pnpm@$expectedPnpm ." 13
}
if ($pnpmVersion.Trim() -ne $expectedPnpm) {
    Stop-EnvironmentCheck 'PNPM_VERSION_INVALID' "pnpm $($pnpmVersion.Trim()) encontrado; esperado $expectedPnpm. Execute manualmente: npm.cmd install -g pnpm@$expectedPnpm ." 13
}
Write-Host "pnpm: OK ($expectedPnpm)"

function Test-LocalTool {
    param([string]$Name, [string]$ExecutablePath)

    if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
        Write-Host "[DEPENDENCY_MISSING] ${Name}: executavel local ausente." -ForegroundColor Yellow
        return $false
    }
    try {
        # Capture output without exposing native errors or internal paths.
        # A native stderr message alone must not replace the exit-code check.
        $ErrorActionPreference = 'Continue'
        $global:LASTEXITCODE = $null
        $versionOutput = & $ExecutablePath --version 2>&1
        $toolExitCode = $global:LASTEXITCODE
    } catch {
        Write-Host "[DEPENDENCY_BROKEN] $Name encontrado, mas nao pode ser executado." -ForegroundColor Yellow
        return $false
    }
    if ($null -eq $toolExitCode -or $toolExitCode -ne 0) {
        Write-Host "[DEPENDENCY_BROKEN] $Name encontrado, mas falhou ao executar --version (codigo $toolExitCode)." -ForegroundColor Yellow
        return $false
    }
    $versionText = ($versionOutput | Out-String)
    if ($versionText -match '\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?') {
        Write-Host "[OK] $Name disponivel: $($Matches[0])"
    } else {
        Write-Host "[OK] $Name executou --version com sucesso."
    }
    return $true
}

$dependenciesInstalled = $true
$localTools = @(
    @{ Name = 'TypeScript'; Command = 'tsc.cmd' },
    @{ Name = 'Oxlint'; Command = 'oxlint.cmd' },
    @{ Name = 'Vinext'; Command = 'vinext.cmd' },
    @{ Name = 'Vite'; Command = 'vite.cmd' }
)
Push-Location -LiteralPath $projectRoot
try {
    foreach ($tool in $localTools) {
        $executablePath = Join-Path $projectRoot "node_modules/.bin/$($tool.Command)"
        if (-not (Test-LocalTool -Name $tool.Name -ExecutablePath $executablePath)) {
            $dependenciesInstalled = $false
        }
    }
} finally {
    Pop-Location
}
if ($dependenciesInstalled) {
    Write-Host 'Dependencias: OK (TypeScript, Oxlint, Vinext e Vite executados com sucesso)'
} else {
    Write-Host 'Dependencias: ausentes ou incompletas. Execute pnpm install; start-dev.ps1 fara essa etapa automaticamente.' -ForegroundColor Yellow
}

if ($PassThru) {
    [PSCustomObject]@{ ProjectRoot = $projectRoot; PnpmPath = $pnpm.Source; DependenciesInstalled = $dependenciesInstalled }
} elseif (-not $dependenciesInstalled) {
    exit 14
}
