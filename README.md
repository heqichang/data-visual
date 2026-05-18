# 数据分析与可视化平台

基于 Python FastAPI + React 的数据分析与可视化平台。

## 功能特性

### 1. 数据导入
- 支持 CSV / Excel / JSON 文件上传
- 支持 MySQL / PostgreSQL / SQLite 数据库连接
- 数据预览（前 100 行）
- 字段类型自动推断（数值/文本/日期/布尔）
- 编码自动检测
- 数据概览统计（行数、列数、空值率、唯一值数）

### 2. 数据概览
- 字段统计摘要（均值/中位数/标准差/分位数/极值）
- 数值字段分布直方图
- 分类字段值计数柱状图
- 字段间相关性热力图
- 数据质量评分

### 3. 基础图表
- 折线图
- 柱状图（支持分组）
- 散点图
- 饼图 / 环形图
- 面积图
- 箱线图
- 图表配置（标题、轴标签）
- 图表导出（PNG / SVG）

### 4. 交互筛选
- 数值范围滑块筛选
- 分类多选筛选
- 日期范围筛选
- WebSocket 实时联动更新
- 筛选条件保存
- 筛选结果数据量提示

### 5. 数据表格
- 点击列头排序
- 分页浏览（支持自定义每页条数）
- 表格搜索
- 数值条件格式化着色
- 表格导出（CSV）

## 技术栈

**后端:**
- Python 3.8+
- FastAPI - Web 框架
- Pandas - 数据处理
- SQLAlchemy - 数据库连接
- Uvicorn - ASGI 服务器

**前端:**
- React 18
- Ant Design - UI 组件库
- ECharts - 图表库
- Axios - HTTP 客户端
- Vite - 构建工具

## 快速开始

### 环境要求
- Python 3.8 或更高版本
- Node.js 16 或更高版本
- npm 或 yarn

### 启动后端服务

```bash
# 方式一：使用启动脚本（Windows）
start-backend.bat

# 方式二：手动启动
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

后端服务启动后：
- 服务地址: http://localhost:8000
- API 文档: http://localhost:8000/docs

### 启动前端服务

```bash
# 方式一：使用启动脚本（Windows）
start-frontend.bat

# 方式二：手动启动
cd frontend
npm install
npm run dev
```

前端服务启动后：
- 访问地址: http://localhost:3000

## 使用说明

1. **导入数据**: 在"数据导入"页面上传 CSV/Excel/JSON 文件，或连接数据库
2. **查看概览**: 导入成功后自动跳转到"数据概览"页面，查看数据统计信息
3. **创建图表**: 在"基础图表"页面选择图表类型和字段，生成可视化图表
4. **交互筛选**: 在"交互筛选"页面添加筛选条件，实时查看筛选结果
5. **浏览数据**: 在"数据表格"页面查看完整数据，支持排序、搜索和导出

## 示例数据

项目提供了示例数据文件 `sample_data/sales_data.csv`，包含模拟的销售数据，可用于测试平台功能。

## 项目结构

```
data-visual/
├── backend/                 # 后端代码
│   ├── main.py             # FastAPI 主程序
│   └── requirements.txt    # Python 依赖
├── frontend/               # 前端代码
│   ├── src/
│   │   ├── pages/          # 页面组件
│   │   ├── App.jsx         # 主应用组件
│   │   └── main.jsx        # 入口文件
│   ├── package.json        # npm 依赖
│   └── vite.config.js      # Vite 配置
├── sample_data/            # 示例数据
├── start-backend.bat       # 后端启动脚本
└── start-frontend.bat      # 前端启动脚本
```

## API 接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/upload` | POST | 上传文件 |
| `/api/database` | POST | 连接数据库 |
| `/api/dataset/{id}/overview` | GET | 获取数据概览 |
| `/api/dataset/{id}/histogram/{col}` | GET | 获取直方图数据 |
| `/api/chart` | POST | 获取图表数据 |
| `/api/dataset/{id}/data` | GET | 获取表格数据 |
| `/api/dataset/{id}/export` | GET | 导出数据 |
| `/ws/{id}` | WebSocket | 筛选联动 |
