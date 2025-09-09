@echo off
echo Building executable...
pyinstaller build_app.spec --clean
if exist "dist\AbioticFactorMaps.exe" (
    move "dist\AbioticFactorMaps.exe" "AbioticFactorMaps.exe"
    rmdir /s /q "build" 2>nul
    rmdir /s /q "dist" 2>nul
    echo Done! Created AbioticFactorMaps.exe
) else (
    echo Build failed!
)
pause
