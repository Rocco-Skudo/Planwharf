$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CalcWindow {
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder text, int count);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr child, string className, string title);
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
 [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")] public static extern IntPtr ReadText(IntPtr h, uint msg, IntPtr count, System.Text.StringBuilder text);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, EnumProc callback, IntPtr data);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder name, int count);
 public static IntPtr Child(IntPtr parent, string kind, string text) {
   IntPtr found = IntPtr.Zero;
   EnumChildWindows(parent, delegate(IntPtr h, IntPtr data) {
     var type = new System.Text.StringBuilder(256); GetClassName(h, type, 256);
     var label = new System.Text.StringBuilder(1024); ReadText(h, 0x000D, (IntPtr)1024, label);
     if (type.ToString().ToUpperInvariant().Contains(kind) && (text == null || label.ToString() == text)) { found = h; return false; } return true;
   }, IntPtr.Zero);
   return found;
 }
 public delegate bool EnumProc(IntPtr h, IntPtr data);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr data);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 public static IntPtr ForProcess(int pid) {
   IntPtr found = IntPtr.Zero;
   EnumWindows(delegate(IntPtr h, IntPtr data) { uint owner; GetWindowThreadProcessId(h, out owner); var title = new System.Text.StringBuilder(256); GetWindowText(h, title, 256); if(owner == pid && title.ToString() == "Calcolatrice") { found = h; return false; } return true; }, IntPtr.Zero);
   return found;
 }

 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int command);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect rect);
 public struct Rect { public int Left, Top, Right, Bottom; }
}
'@
$notebook = Get-Content (Join-Path $PSScriptRoot 'calculator-run/notebook.json') -Raw | ConvertFrom-Json
$appDir = $notebook.project.folder
$outDir = Join-Path $PSScriptRoot 'calculator-run'
$results = [System.Collections.Generic.List[object]]::new()
$proc = Start-Process -FilePath (Join-Path $appDir 'Calculator.exe') -WorkingDirectory $appDir -WindowStyle Hidden -PassThru
try {
    for ($n = 0; $n -lt 50; $n++) { $handle = [CalcWindow]::ForProcess($proc.Id); if ($handle -ne [IntPtr]::Zero) { break }; Start-Sleep -Milliseconds 100 }
    if ($handle -eq [IntPtr]::Zero) { throw 'Calculator has no main window' }
    [void][CalcWindow]::ShowWindow($handle, 5)
    Start-Sleep -Milliseconds 500
    $window = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
    $displayHandle = [CalcWindow]::Child($handle, '.EDIT.', $null)
    if ($displayHandle -eq [IntPtr]::Zero) { throw 'Display native handle missing' }
    $displayCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'Display')
    $accessibleDisplay = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $displayCondition)
    $results.Add([pscustomobject]@{ name = 'UIAutomation stable display identity'; expected = 'Display'; actual = $(if ($accessibleDisplay) { $accessibleDisplay.Current.Name } else { '' }); pass = [bool]($accessibleDisplay -and $accessibleDisplay.Current.Name -eq 'Display') })
    function Capture-Window($filename) {
        $rect = New-Object CalcWindow+Rect
        [void][CalcWindow]::GetWindowRect($handle, [ref]$rect)
        $bitmap = New-Object System.Drawing.Bitmap(($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top))
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $dc = $graphics.GetHdc()
        try { [void][CalcWindow]::PrintWindow($handle, $dc, 0) } finally { $graphics.ReleaseHdc($dc) }
        $bitmap.Save((Join-Path $outDir $filename))
        $graphics.Dispose(); $bitmap.Dispose()
    }
    $keyboard = New-Object -ComObject WScript.Shell
    function Read-Display {
        $text = New-Object System.Text.StringBuilder(1024)
        [void][CalcWindow]::ReadText($displayHandle, 0x000D, [IntPtr]1024, $text)
        $text.ToString()
    }
    function Check-Result($name, $expected) {
        $actual = Read-Display
        $results.Add([pscustomobject]@{ name = $name; expected = $expected; actual = $actual; pass = ($actual -eq $expected) })
    }
    function Keys($text) { [void]$keyboard.AppActivate($proc.Id); Start-Sleep -Milliseconds 80; $keyboard.SendKeys($text); Start-Sleep -Milliseconds 180 }
    function Button($name) {
        $buttonHandle = [CalcWindow]::Child($handle, '.BUTTON.', $name)
        if ($buttonHandle -eq [IntPtr]::Zero) { throw "Button missing: $name" }
        [void][CalcWindow]::SendMessage($buttonHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)
        Start-Sleep -Milliseconds 100
    }
    $results.Add([pscustomobject]@{ name = 'Executable native GUI launch'; expected = 'Calcolatrice'; actual = $window.Current.Name; pass = ($window.Current.Name -eq 'Calcolatrice') })
    Button '2'; Button '+'; Button '3'; Button '='; Check-Result 'Button addition' '5'
    Keys '{ESC}9-12{ENTER}'; Check-Result 'Keyboard subtraction negative result' '-3'
    Keys '{ESC}6*7{ENTER}'; Check-Result 'Keyboard multiplication' '42'
    Keys '{ESC}7/2{ENTER}'; Check-Result 'Keyboard division decimal' '3,5'
    Keys '{ESC}0.1{+}0.2{ENTER}'; Check-Result 'Decimal dot exact' '0,3'
    Keys '{ESC}1,5{+}2,25{ENTER}'; Check-Result 'Decimal comma' '3,75'
    Keys '{ESC}-5*-2{ENTER}'; Check-Result 'Unary negative numbers' '10'
    Keys '{ESC}10/0{ENTER}'; Check-Result 'Division by zero' 'Impossibile dividere per zero'
    Capture-Window 'calculator-error.png'
    Keys '{ESC}'; Check-Result 'Escape clears error' ''
    Keys '123{BACKSPACE}'; Check-Result 'Backspace' '12'
    Keys '{ESC}45c'; Check-Result 'Lowercase c clears' ''
    Keys '89C'; Check-Result 'Uppercase C clears' ''
    Keys '{ESC}2{+}3*4{ENTER}'; Check-Result 'Precedence' '14'
    Keys '{ESC}0.1{+}0.2{ENTER}'
    Capture-Window 'calculator-gui.png'
} finally {
    if (-not $proc.HasExited) { [void]$proc.CloseMainWindow(); if (-not $proc.WaitForExit(2000)) { $proc.Kill() } }
    $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $outDir 'gui-results.json')
}
$results | Format-Table -AutoSize
if ($results.Where({ -not $_.pass }).Count) { exit 1 }
