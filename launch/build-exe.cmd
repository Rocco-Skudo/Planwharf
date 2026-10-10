@echo off
setlocal
cd /d "%~dp0"
set CSC=
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not defined CSC if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not defined CSC (
  echo csc.exe was not found. .NET Framework 4 is required to build Planwharf.exe.
  exit /b 1
)
"%CSC%" /nologo /target:winexe /optimize+ /out:"%~dp0..\Planwharf.exe" /r:System.Windows.Forms.dll /r:System.dll Planwharf.cs
if errorlevel 1 exit /b 1
echo Built %~dp0..\Planwharf.exe
