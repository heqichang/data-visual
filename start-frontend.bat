@echo off
echo ========================================
echo  数据分析与可视化平台 - 前端启动脚本
echo ========================================
echo.

cd frontend

if not exist node_modules (
    echo [1/2] 安装 npm 依赖...
    npm install
)

echo [2/2] 启动 React 开发服务器...
echo.
echo 前端服务将在 http://localhost:3000 启动
echo.
npm run dev

pause
