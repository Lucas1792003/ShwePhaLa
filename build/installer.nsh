# electron-builder 26.15.x normally looks only under $INSTDIR when closing a
# running app. That misses an existing installation when the user previously
# selected a different directory, after which the old uninstaller fails on
# locked files and reports the misleading "app cannot be closed" message.
#
# Match the product executable exactly instead. The setup and uninstaller have
# different filenames, so this closes only Shwe Pha La POS processes (including
# Electron renderer/GPU children) regardless of the old installation path.
!macro customCheckAppRunning
  DetailPrint `Closing running "${PRODUCT_NAME}" processes...`
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  Sleep 1500
!macroend
