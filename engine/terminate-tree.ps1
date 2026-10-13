param([Parameter(Mandatory = $true)][int]$RootProcessId)
$ErrorActionPreference = 'Stop'
# Only the supplied worker and its observed descendants are termination targets.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class PlanwharfProcessTree {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct Entry {
        public uint size, usage, pid; public IntPtr heap;
        public uint module, threads, parent; public int priority; public uint flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string executable;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32FirstW(IntPtr snapshot, ref Entry entry);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32NextW(IntPtr snapshot, ref Entry entry);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr process, uint timeout);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static Dictionary<uint,uint> Parents() {
        IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
        if (snapshot == new IntPtr(-1)) throw new System.ComponentModel.Win32Exception();
        try {
            var parents = new Dictionary<uint,uint>(); var entry = new Entry(); entry.size = (uint)Marshal.SizeOf(typeof(Entry));
            if (!Process32FirstW(snapshot, ref entry)) throw new System.ComponentModel.Win32Exception();
            do { parents[entry.pid] = entry.parent; } while (Process32NextW(snapshot, ref entry));
            return parents;
        } finally { CloseHandle(snapshot); }
    }
    public static bool Stop(uint root) {
        var known = new HashSet<uint>(); var terminated = new HashSet<uint>(); known.Add(root);
        for (int pass = 0; pass < 4; pass++) {
            var parents = Parents(); bool added;
            foreach (uint pid in terminated) if (parents.ContainsKey(pid)) return false;
            do { added = false; foreach (var pair in parents) if (known.Contains(pair.Value) && known.Add(pair.Key)) added = true; } while (added);
            var handles = new List<IntPtr>();
            try {
                // Open handles before termination, so recycled PIDs cannot change targets.
                foreach (uint pid in known) if (parents.ContainsKey(pid)) {
                    IntPtr handle = OpenProcess(0x100001, false, pid);
                    if (handle == IntPtr.Zero) { if (Marshal.GetLastWin32Error() == 87) continue; return false; }
                    handles.Add(handle);
                }
                if (handles.Count == 0) return true;
                foreach (IntPtr handle in handles) if (!TerminateProcess(handle, 1) && WaitForSingleObject(handle, 0) != 0) return false;
                foreach (IntPtr handle in handles) if (WaitForSingleObject(handle, 2000) != 0) return false;
                foreach (uint pid in known) if (parents.ContainsKey(pid)) terminated.Add(pid);
            } finally { foreach (IntPtr handle in handles) CloseHandle(handle); }
        }
        var final = Parents(); foreach (uint pid in known) if (final.ContainsKey(pid)) return false;
        return true;
    }
}
'@
if ($RootProcessId -le 0 -or -not [PlanwharfProcessTree]::Stop([uint32]$RootProcessId)) { exit 1 }
exit 0
