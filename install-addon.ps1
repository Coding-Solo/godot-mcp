# Godot MCP Addon Installer
# Installs Auto Reload and Runtime addons to your Godot project

param(
    [switch]$AutoReloadOnly,
    [switch]$RuntimeOnly,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Godot MCP Addon Installer" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in a Godot project directory
if (-not (Test-Path "project.godot")) {
    Write-Host "ERROR: project.godot not found!" -ForegroundColor Red
    Write-Host "Please run this script from your Godot project folder." -ForegroundColor Yellow
    exit 1
}

# Create addons directory if it doesn't exist
if (-not (Test-Path "addons")) {
    New-Item -ItemType Directory -Path "addons" | Out-Null
    Write-Host "Created addons/ directory" -ForegroundColor Green
}

$repoUrl = "https://raw.githubusercontent.com/HaD0Yun/godot-mcp/main"

# Function to download a file
function Download-File {
    param($url, $destination)
    
    $dir = Split-Path $destination -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    
    try {
        Invoke-WebRequest -Uri $url -OutFile $destination -UseBasicParsing
        return $true
    } catch {
        return $false
    }
}

# Install Auto Reload addon
function Install-AutoReload {
    Write-Host ""
    Write-Host "Installing Auto Reload addon..." -ForegroundColor Yellow
    
    $addonPath = "addons/auto_reload"
    
    if ((Test-Path $addonPath) -and -not $Force) {
        Write-Host "Auto Reload addon already exists. Use -Force to overwrite." -ForegroundColor Yellow
        return $false
    }
    
    if (Test-Path $addonPath) {
        Remove-Item -Recurse -Force $addonPath
    }
    
    New-Item -ItemType Directory -Path $addonPath -Force | Out-Null
    
    $files = @(
        "auto_reload.gd",
        "plugin.cfg"
    )
    
    $success = $true
    foreach ($file in $files) {
        $url = "$repoUrl/src/addon/auto_reload/$file"
        $dest = "$addonPath/$file"
        
        Write-Host "  Downloading $file..." -ForegroundColor Gray
        if (-not (Download-File $url $dest)) {
            Write-Host "  Failed to download $file" -ForegroundColor Red
            $success = $false
        }
    }
    
    if ($success) {
        Write-Host "Auto Reload addon installed successfully!" -ForegroundColor Green
    }
    return $success
}

# Install Runtime addon
function Install-Runtime {
    Write-Host ""
    Write-Host "Installing Runtime addon..." -ForegroundColor Yellow
    
    $addonPath = "addons/godot_mcp_runtime"
    
    if ((Test-Path $addonPath) -and -not $Force) {
        Write-Host "Runtime addon already exists. Use -Force to overwrite." -ForegroundColor Yellow
        return $false
    }
    
    if (Test-Path $addonPath) {
        Remove-Item -Recurse -Force $addonPath
    }
    
    New-Item -ItemType Directory -Path $addonPath -Force | Out-Null
    
    $files = @(
        "godot_mcp_runtime.gd",
        "mcp_runtime_autoload.gd",
        "plugin.cfg"
    )
    
    $success = $true
    foreach ($file in $files) {
        $url = "$repoUrl/src/addon/godot_mcp_runtime/$file"
        $dest = "$addonPath/$file"
        
        Write-Host "  Downloading $file..." -ForegroundColor Gray
        if (-not (Download-File $url $dest)) {
            Write-Host "  Failed to download $file" -ForegroundColor Red
            $success = $false
        }
    }
    
    if ($success) {
        Write-Host "Runtime addon installed successfully!" -ForegroundColor Green
    }
    return $success
}

# Main installation logic
if ($AutoReloadOnly) {
    Install-AutoReload
} elseif ($RuntimeOnly) {
    Install-Runtime
} else {
    # Install both by default
    Install-AutoReload
    Install-Runtime
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open your project in Godot" -ForegroundColor White
Write-Host "2. Go to Project > Project Settings > Plugins" -ForegroundColor White
Write-Host "3. Enable the installed addon(s)" -ForegroundColor White
Write-Host ""
Write-Host "For more info: https://github.com/HaD0Yun/godot-mcp" -ForegroundColor Gray
