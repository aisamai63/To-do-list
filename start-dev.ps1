#!/usr/bin/env pwsh
<#
Simple dev starter for Windows PowerShell.
Starts the backend (node) in a new window and then starts the frontend (npm start) in the current window.

Usage: Open PowerShell in the repo root and run:
  ./start-dev.ps1

This is intentionally minimal — it uses Start-Process so both servers run concurrently.
#>
Write-Host "Starting backend in a new window..."
$backend = Join-Path $PSScriptRoot 'todo-app\server.js'
Start-Process -FilePath "node" -ArgumentList "`"$backend`"" -WorkingDirectory $PSScriptRoot
Start-Sleep -Seconds 2
Write-Host "Starting frontend in this window (will block)..."
Set-Location (Join-Path $PSScriptRoot 'todo-frontend')
npm start
