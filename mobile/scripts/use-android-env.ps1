$root = Split-Path -Parent $PSScriptRoot
$workspace = Split-Path -Parent $root
$env:JAVA_HOME = Join-Path $workspace 'tools\jdk-21'
$env:ANDROID_HOME = Join-Path $root 'android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = Join-Path $workspace 'tools\gradle-home'
$env:TEMP = Join-Path $root 'tmp'
$env:TMP = $env:TEMP
$env:_JAVA_OPTIONS = "-Dorg.gradle.native.dir=$workspace\tools\gradle-native -Duser.home=$workspace\tools\gradle-home -Djava.io.tmpdir=$root\tmp"
$env:Path = "$env:JAVA_HOME\bin;$workspace\tools\gradle-8.11.1\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;" + $env:Path
Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
Write-Host "GRADLE_USER_HOME=$env:GRADLE_USER_HOME"