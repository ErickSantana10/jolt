using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

[ComImport, Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAgileObject { }

[ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IActivateAudioInterfaceAsyncOperation {
    void GetActivateResult([Out] out int activateResult, [Out, MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
}

[ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IActivateAudioInterfaceCompletionHandler {
    void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
}

[ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioClient {
    [PreserveSig] int Initialize(int ShareMode, uint StreamFlags, long hnsBufferDuration, long hnsPeriodicity, IntPtr pFormat, IntPtr AudioSessionGuid);
    [PreserveSig] int GetBufferSize(out uint pNumBufferFrames);
    [PreserveSig] int GetStreamLatency(out long phnsLatency);
    [PreserveSig] int GetCurrentPadding(out uint pNumPaddingFrames);
    [PreserveSig] int IsFormatSupported(int ShareMode, IntPtr pFormat, out IntPtr ppClosestMatch);
    [PreserveSig] int GetMixFormat(out IntPtr ppDeviceFormat);
    [PreserveSig] int GetDevicePeriod(out long phnsDefaultDevicePeriod, out long phnsMinimumDevicePeriod);
    [PreserveSig] int Start();
    [PreserveSig] int Stop();
    [PreserveSig] int Reset();
    [PreserveSig] int SetEventHandle(IntPtr eventHandle);
    [PreserveSig] int GetService([MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
}

[ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioCaptureClient {
    [PreserveSig] int GetBuffer(out IntPtr ppData, out uint pNumFramesToRead, out uint pdwFlags, out ulong pu64DevicePosition, out ulong pu64QPCPosition);
    [PreserveSig] int ReleaseBuffer(uint NumFramesRead);
    [PreserveSig] int GetNextPacketSize(out uint pNumFramesInNextPacket);
}

[StructLayout(LayoutKind.Sequential)]
struct AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
    public uint TargetProcessId;
    public int ProcessLoopbackMode; // 0 = INCLUDE_TREE, 1 = EXCLUDE_TREE
}

[StructLayout(LayoutKind.Sequential)]
struct AUDIOCLIENT_ACTIVATION_PARAMS {
    public int ActivationType; // 1 = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
    public AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams;
}

[StructLayout(LayoutKind.Explicit, Size = 24)]
struct PROPVARIANT {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public uint cbSize;
    [FieldOffset(16)] public IntPtr pBlobData;
}

[StructLayout(LayoutKind.Sequential, Pack = 1)]
struct WAVEFORMATEX {
    public ushort wFormatTag;
    public ushort nChannels;
    public uint nSamplesPerSec;
    public uint nAvgBytesPerSec;
    public ushort nBlockAlign;
    public ushort wBitsPerSample;
    public ushort cbSize;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
struct PROCESSENTRY32 {
    public uint dwSize;
    public uint cntUsage;
    public uint th32ProcessID;
    public IntPtr th32DefaultHeapID;
    public uint th32ModuleID;
    public uint cntThreads;
    public uint th32ParentProcessID;
    public int pcPriClassBase;
    public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
    public string szExeFile;
}

class CompletionHandler : IActivateAudioInterfaceCompletionHandler, IAgileObject {
    public ManualResetEvent DoneEvent = new ManualResetEvent(false);
    public int HrResult = -1;
    public object ActivatedInterface = null;

    public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op) {
        try {
            op.GetActivateResult(out HrResult, out ActivatedInterface);
        } catch (Exception ex) {
            HrResult = Marshal.GetHRForException(ex);
        } finally {
            DoneEvent.Set();
        }
    }
}

class Program {
    [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = true)]
    static extern int ActivateAudioInterfaceAsync(
        [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        ref PROPVARIANT activationParams,
        IActivateAudioInterfaceCompletionHandler completionHandler,
        out IActivateAudioInterfaceAsyncOperation activationOperation
    );

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    static volatile bool _running = true;

    static uint FindTargetExcludePid(uint fallbackJoltPid) {
        IntPtr snap = CreateToolhelp32Snapshot(0x00000002, 0);
        if (snap == IntPtr.Zero || snap == new IntPtr(-1)) return fallbackJoltPid;

        try {
            var discordProcs = new List<PROCESSENTRY32>();
            var discordPidSet = new HashSet<uint>();
            var childCount = new Dictionary<uint, int>();

            PROCESSENTRY32 pe = new PROCESSENTRY32();
            pe.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));

            if (Process32First(snap, ref pe)) {
                do {
                    string exe = (pe.szExeFile ?? "").ToLowerInvariant();
                    if (exe == "discord.exe" || exe == "discordptb.exe" || exe == "discordcanary.exe") {
                        discordProcs.Add(pe);
                        discordPidSet.Add(pe.th32ProcessID);
                    }
                } while (Process32Next(snap, ref pe));
            }

            if (discordProcs.Count == 0) {
                return fallbackJoltPid;
            }

            foreach (var p in discordProcs) {
                if (discordPidSet.Contains(p.th32ParentProcessID)) {
                    int cur = 0;
                    childCount.TryGetValue(p.th32ParentProcessID, out cur);
                    childCount[p.th32ParentProcessID] = cur + 1;
                }
            }

            uint bestRootPid = 0;
            int bestChildren = -1;

            foreach (var p in discordProcs) {
                if (!discordPidSet.Contains(p.th32ParentProcessID)) {
                    int c = 0;
                    childCount.TryGetValue(p.th32ProcessID, out c);
                    if (c > bestChildren) {
                        bestChildren = c;
                        bestRootPid = p.th32ProcessID;
                    }
                }
            }

            if (bestRootPid != 0) return bestRootPid;
            return discordProcs[0].th32ProcessID;
        } catch {
            return fallbackJoltPid;
        } finally {
            CloseHandle(snap);
        }
    }

    static bool CreateLoopbackClient(uint excludePid, out IAudioClient outClient, out IAudioCaptureClient outCapture) {
        outClient = null;
        outCapture = null;

        var actParams = new AUDIOCLIENT_ACTIVATION_PARAMS {
            ActivationType = 1, // AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
            ProcessLoopbackParams = new AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                TargetProcessId = excludePid,
                ProcessLoopbackMode = 1 // PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE
            }
        };

        IntPtr pActParams = Marshal.AllocHGlobal(Marshal.SizeOf(actParams));
        IntPtr pWfx = IntPtr.Zero;

        try {
            Marshal.StructureToPtr(actParams, pActParams, false);

            var propVar = new PROPVARIANT {
                vt = 65, // VT_BLOB
                cbSize = (uint)Marshal.SizeOf(actParams),
                pBlobData = pActParams
            };

            var handler = new CompletionHandler();
            IActivateAudioInterfaceAsyncOperation op;
            Guid iidAudioClient = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");

            int hr = ActivateAudioInterfaceAsync("VAD\\Process_Loopback", iidAudioClient, ref propVar, handler, out op);
            if (hr != 0) return false;

            if (!handler.DoneEvent.WaitOne(3000) || handler.HrResult != 0 || handler.ActivatedInterface == null) {
                return false;
            }

            var client = (IAudioClient)handler.ActivatedInterface;

            // 48000 Hz, 2 canais (estéreo), 16-bit PCM (Int16)
            var wfx = new WAVEFORMATEX {
                wFormatTag = 1, // WAVE_FORMAT_PCM
                nChannels = 2,
                nSamplesPerSec = 48000,
                wBitsPerSample = 16,
                nBlockAlign = 4,
                nAvgBytesPerSec = 48000 * 4,
                cbSize = 0
            };

            pWfx = Marshal.AllocHGlobal(Marshal.SizeOf(wfx));
            Marshal.StructureToPtr(wfx, pWfx, false);

            // LOOPBACK (0x00020000) | AUTOCONVERTPCM (0x80000000) | SRC_DEFAULT_QUALITY (0x08000000)
            uint flags = 0x00020000 | 0x80000000 | 0x08000000;
            int initHr = client.Initialize(0, flags, 200000, 0, pWfx, IntPtr.Zero);
            if (initHr != 0) return false;

            object capObj;
            int svcHr = client.GetService(new Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), out capObj);
            if (svcHr != 0 || capObj == null) return false;

            var capture = (IAudioCaptureClient)capObj;
            if (client.Start() != 0) return false;

            outClient = client;
            outCapture = capture;
            return true;
        } catch {
            return false;
        } finally {
            Marshal.FreeHGlobal(pActParams);
            if (pWfx != IntPtr.Zero) Marshal.FreeHGlobal(pWfx);
        }
    }

    static void Main(string[] args) {
        uint fallbackPid = (uint)Process.GetCurrentProcess().Id;
        for (int i = 0; i < args.Length - 1; i++) {
            if (args[i] == "--parent-pid") {
                uint.TryParse(args[i + 1], out fallbackPid);
            }
        }

        // Encerra automaticamente se o stdin fechar (processo pai encerrado)
        Thread stdinWatcher = new Thread(() => {
            try {
                while (Console.In.Read() != -1) { }
            } catch { }
            _running = false;
        });
        stdinWatcher.IsBackground = true;
        stdinWatcher.Start();

        uint currentExcludedPid = FindTargetExcludePid(fallbackPid);
        IAudioClient client = null;
        IAudioCaptureClient capture = null;

        if (!CreateLoopbackClient(currentExcludedPid, out client, out capture)) {
            Console.Error.WriteLine("FAILED_INIT");
            Environment.Exit(1);
            return;
        }

        Console.Error.WriteLine("READY:" + currentExcludedPid);

        Stream stdout = Console.OpenStandardOutput();
        byte[] workBuf = new byte[65536];
        byte[] silenceBuf = new byte[65536];
        int tickCounter = 0;

        try {
            while (_running) {
                tickCounter++;
                // A cada ~2 segundos (400 * 5ms), verifica se o Discord abriu/mudou de PID
                if (tickCounter >= 400) {
                    tickCounter = 0;
                    uint nextPid = FindTargetExcludePid(fallbackPid);
                    if (nextPid != currentExcludedPid) {
                        IAudioClient newClient;
                        IAudioCaptureClient newCapture;
                        if (CreateLoopbackClient(nextPid, out newClient, out newCapture)) {
                            try { client.Stop(); } catch { }
                            client = newClient;
                            capture = newCapture;
                            currentExcludedPid = nextPid;
                            Console.Error.WriteLine("SWITCHED_PID:" + currentExcludedPid);
                        }
                    }
                }

                uint packetLength = 0;
                int hr = capture.GetNextPacketSize(out packetLength);
                if (hr != 0) {
                    // Dispositivo de áudio padrão mudou ou reiniciou; recria o cliente
                    Thread.Sleep(50);
                    uint nextPid = FindTargetExcludePid(fallbackPid);
                    IAudioClient newClient;
                    IAudioCaptureClient newCapture;
                    if (CreateLoopbackClient(nextPid, out newClient, out newCapture)) {
                        try { client.Stop(); } catch { }
                        client = newClient;
                        capture = newCapture;
                        currentExcludedPid = nextPid;
                    }
                    continue;
                }

                if (packetLength == 0) {
                    Thread.Sleep(4);
                    continue;
                }

                while (packetLength > 0 && _running) {
                    IntPtr pData;
                    uint numFrames;
                    uint flags;
                    ulong devPos;
                    ulong qpcPos;

                    int getHr = capture.GetBuffer(out pData, out numFrames, out flags, out devPos, out qpcPos);
                    if (getHr != 0) break;

                    int byteCount = (int)(numFrames * 4); // 2 canais * 2 bytes (Int16)
                    if (byteCount > 0) {
                        if (byteCount > workBuf.Length) {
                            workBuf = new byte[byteCount];
                            silenceBuf = new byte[byteCount];
                        }

                        if ((flags & 2) != 0) {
                            // AUDCLNT_BUFFERFLAGS_SILENT
                            stdout.Write(silenceBuf, 0, byteCount);
                        } else {
                            Marshal.Copy(pData, workBuf, 0, byteCount);
                            stdout.Write(workBuf, 0, byteCount);
                        }
                    }

                    capture.ReleaseBuffer(numFrames);
                    if (capture.GetNextPacketSize(out packetLength) != 0) break;
                }

                stdout.Flush();
                Thread.Sleep(3);
            }
        } catch {
            // Pipe fechado pelo Electron
        } finally {
            try { if (client != null) client.Stop(); } catch { }
        }
    }
}
