@echo off
echo ========================================
echo  数据分析与可视化平台 - 后端启动脚本
echo ========================================
echo.

cd backend

if not exist venv (
    echo [1/3] 创建 Python 虚拟环境...
    python -m venv venv
)

echo [2/3] 激活虚拟环境并安装依赖...
call venv\Scripts\activate
pip install -r requirements.txt

echo [3/3] 启动 FastAPI 服务器...
echo.
echo 后端服务将在 http://localhost:8000 启动
echo API 文档: http://localhost:8000/docs
echo.
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

pause
