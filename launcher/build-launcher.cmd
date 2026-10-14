@echo off
rem Rebuilds "RAKSHA-PATH X.exe" from launcher\Launcher.cs using the .NET Framework compiler built into Windows.
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe /optimize+ /out:"%~dp0..\RAKSHA-PATH X.exe" "%~dp0Launcher.cs"
