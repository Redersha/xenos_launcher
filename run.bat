@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

REM 查找分发包目录
for /d %%i in (dist-pkg\xenos-launcher-windows-*) do (
    if exist "%%i\xl.cmd" (
        echo 启动 Xenos Launcher...
        call "%%i\xl.cmd" %*
        goto :eof
    )
)

REM 没有分发包，尝试 bundle
if exist "dist-bundle\xl.js" (
    echo 未找到分发包，使用 bundle + 系统 Node.js 启动...
    node dist-bundle\xl.js %*
    goto :eof
)

echo 未找到构建产物，请先运行: npm run bundle ^&^& npm run pack:win
pause
