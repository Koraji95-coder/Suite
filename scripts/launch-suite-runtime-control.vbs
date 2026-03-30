Option Explicit

Dim shell
Dim fso
Dim scriptDir
Dim powerShellExe
Dim powerShellScript
Dim command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
powerShellExe = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
powerShellScript = fso.BuildPath(scriptDir, "launch-suite-runtime-control.ps1")

command = """" & powerShellExe & """ -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & powerShellScript & """ -AutoBootstrap"

shell.Run command, 0, False
