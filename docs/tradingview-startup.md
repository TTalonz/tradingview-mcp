# TradingView Startup

## Locked startup prompt

Start TradingView.

Use safe mode.

Run this exact PowerShell command:
Start-Process -FilePath "C:\Program Files\WindowsApps\TradingView.Desktop_3.0.0.7652_x64__n534cwy3pjxzj\TradingView.exe" -ArgumentList "--remote-debugging-port=9222"

Then do this exactly:
1. Wait for TradingView to open
2. Confirm CDP/MCP connection is live
3. Treat this as a one-window TradingView session only
4. Assume symbol sync must be OFF
5. Read only the current active chart
6. Report only:
   - symbol
   - timeframe
   - total drawings
7. Then wait

Rules:
- one TradingView window only
- multiple tabs allowed inside that window
- do not rely on a second TradingView window
- do not switch tabs unless I explicitly tell you
- do not broad-probe unless the normal path fails
- always prefer the current active chart
- give me only exact commands or exact text to paste

## Locked close prompt

Close TradingView for this session.

Do this exactly:
1. Close the TradingView application
2. Do not touch repo files
3. Do not run probes
4. Report only that TradingView is closed
5. Then wait

Then wait.
