import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout, Menu, theme } from 'antd'
import {
  UploadOutlined,
  BarChartOutlined,
  TableOutlined,
  DashboardOutlined,
  FilterOutlined,
  ExperimentOutlined,
  BlockOutlined,
  PieChartOutlined,
  SwapOutlined,
  AppstoreOutlined
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import UploadPage from './pages/UploadPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import ChartPage from './pages/ChartPage.jsx'
import TablePage from './pages/TablePage.jsx'
import FilterPage from './pages/FilterPage.jsx'
import PipelinePage from './pages/PipelinePage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import PivotTablePage from './pages/PivotTablePage.jsx'
import ComparisonPage from './pages/ComparisonPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

const { Header, Sider, Content } = Layout

function App() {
  const [datasetId, setDatasetId] = useState(localStorage.getItem('datasetId') || '')
  const [datasetInfo, setDatasetInfo] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  useEffect(() => {
    if (datasetId) {
      localStorage.setItem('datasetId', datasetId)
    }
  }, [datasetId])

  const menuItems = [
    {
      key: '/upload',
      icon: <UploadOutlined />,
      label: '数据导入',
    },
    {
      key: '/overview',
      icon: <DashboardOutlined />,
      label: '数据概览',
      disabled: !datasetId,
    },
    {
      key: '/charts',
      icon: <PieChartOutlined />,
      label: '图表分析',
      disabled: !datasetId,
    },
    {
      key: '/pivot',
      icon: <AppstoreOutlined />,
      label: '数据透视',
      disabled: !datasetId,
    },
    {
      key: '/pipeline',
      icon: <BlockOutlined />,
      label: '数据管道',
      disabled: !datasetId,
    },
    {
      key: '/dashboard',
      icon: <ExperimentOutlined />,
      label: '交互式仪表盘',
      disabled: !datasetId,
    },
    {
      key: '/comparison',
      icon: <SwapOutlined />,
      label: '数据对比',
      disabled: !datasetId,
    },
    {
      key: '/filters',
      icon: <FilterOutlined />,
      label: '交互筛选',
      disabled: !datasetId,
    },
    {
      key: '/table',
      icon: <TableOutlined />,
      label: '数据表格',
      disabled: !datasetId,
    },
  ]

  const handleDatasetLoaded = (data) => {
    setDatasetId(data.dataset_id)
    setDatasetInfo(data)
    navigate('/overview')
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible>
        <div style={{ height: 64, margin: 16, background: 'rgba(255, 255, 255, 0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
          数据可视化平台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>数据分析与可视化平台</h2>
          {datasetId && datasetInfo && (
            <span style={{ color: '#666' }}>
              当前数据集: {datasetInfo.filename || '数据库数据'} ({datasetInfo.info?.rows} 行 × {datasetInfo.info?.columns} 列)
            </span>
          )}
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: 'auto',
          }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/upload" replace />} />
            <Route path="/upload" element={<UploadPage onDatasetLoaded={handleDatasetLoaded} />} />
            <Route path="/overview" element={datasetId ? <ErrorBoundary><OverviewPage datasetId={datasetId} /></ErrorBoundary> : <Navigate to="/upload" />} />
            <Route path="/charts" element={datasetId ? <ErrorBoundary><ChartPage datasetId={datasetId} datasetInfo={datasetInfo} /></ErrorBoundary> : <Navigate to="/upload" />} />
            <Route path="/pivot" element={datasetId ? <ErrorBoundary><PivotTablePage datasetId={datasetId} datasetInfo={datasetInfo} /></ErrorBoundary> : <Navigate to="/upload" />} />
            <Route path="/pipeline" element={datasetId ? <ErrorBoundary><PipelinePage datasetId={datasetId} datasetInfo={datasetInfo} /></ErrorBoundary> : <Navigate to="/upload" />} />
            <Route path="/dashboard" element={datasetId ? <ErrorBoundary><DashboardPage datasetId={datasetId} datasetInfo={datasetInfo} /></ErrorBoundary> : <Navigate to="/upload" />} />
            <Route path="/comparison" element={datasetId ? <ErrorBoundary><ComparisonPage datasetId={datasetId} datasetInfo={datasetInfo} /></ErrorBoundary> : <Navigate to="/upload" />} />
            <Route path="/filters" element={datasetId ? <ErrorBoundary><FilterPage datasetId={datasetId} datasetInfo={datasetInfo} /></ErrorBoundary> : <Navigate to="/upload" />} />
            <Route path="/table" element={datasetId ? <ErrorBoundary><TablePage datasetId={datasetId} datasetInfo={datasetInfo} /></ErrorBoundary> : <Navigate to="/upload" />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
