@echo off
title Supabase Login - Amanecer lock-in
set "PATH=%APPDATA%\npm;%PATH%"
cd /d C:\Users\wirec\codingProjects\consoleai
echo.
echo ============================================================
echo  SUPABASE LOGIN - lock Amanecer in to control the project
echo ============================================================
echo.
echo A browser tab will open. Sign in with the account that owns
echo the "consoleai" project and approve / create the token named
echo amanecer-consoleai. If the browser shows you an access token,
echo paste it ONLY into this window - never into chat.
echo.
supabase login --name amanecer-consoleai
echo.
echo ------------------------------------------------------------
echo If the CLI said success / finished, go back to the Amanecer
echo chat and type:  done
echo If it showed an error, tell Amanecer the exact error text
echo (never paste any token).
echo ------------------------------------------------------------
pause
