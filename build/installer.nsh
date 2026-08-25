# electron-builder 26.15.x normally looks only under $INSTDIR when closing a
# running app. That misses an existing installation when the user previously
# selected a different directory, after which the old uninstaller fails on
# locked files and reports the misleading "app cannot be closed" message.
#
# Match the product executable exactly instead. The setup and uninstaller have
# different filenames, so this closes only Shwe Pha La POS processes (including
# Electron renderer/GPU children) regardless of the old installation path.
#
# IMPORTANT — this macro is NOT what was actually producing the "cannot be
# closed" dialog in v1.0.7-v1.0.9 (confirmed by inspecting electron-builder's
# own NSIS templates: this macro only replaces the PRE-FLIGHT "is the app
# running" check in allowOnlyOneInstallerInstance.nsh, and that check was
# already being fully bypassed once this macro was defined). The dialog was
# actually coming from a SEPARATE, non-customizable retry loop in
# extractAppPackage.nsh's extractUsing7za: it attempts CopyFiles into
# $OUTDIR, and if a target file is still locked, retries only 5 times with a
# 1-second gap (~5 seconds total) before giving up and showing the exact
# same "cannot be closed" message box — regardless of anything this macro
# does. Our old flat "kill + sleep 1500ms" clearly wasn't giving Windows
# enough time to release the file lock (most likely antivirus real-time
# scanning re-locking the freshly-terminated ~100MB+ exe) before that
# 5-second extraction-retry window ran out.
#
# Fix: don't just wait a fixed amount — loop-verify via tasklist that the
# process is actually gone (up to ~7.5s), then add a generous settle buffer
# on top of that, so by the time extraction's own 5-second retry window
# starts, the lock has had much more real time to clear.
!macro customCheckAppRunning
  DetailPrint `Closing running "${PRODUCT_NAME}" processes...`
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0

  StrCpy $R2 0
  CheckAppClosedLoop:
    IntOp $R2 $R2 + 1
    nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop $0
    ${if} $0 == 0
    ${andIf} $R2 < 15
      Sleep 500
      Goto CheckAppClosedLoop
    ${endIf}

  # Settle buffer even after the process is confirmed gone — Windows can
  # hold the executable's file lock/memory mapping a little longer than the
  # process itself, especially while antivirus is still scanning it.
  DetailPrint `Waiting for file locks to clear...`
  Sleep 2000
!macroend
