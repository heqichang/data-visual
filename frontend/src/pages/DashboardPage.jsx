import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  Card,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Table,
  Tag,
  message,
  Drawer,
  List,
  Popconfirm,
  Tabs,
  Slider,
  DatePicker,
  Dropdown,
  Menu,
  Empty,
} from 'antd'
import {
  PlusOutlined,
  SaveOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  SettingOutlined,
  BarChartOutlined,
  FullscreenOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  FilterOutlined,
  DatabaseOutlined,
} from '@ant-design/icons'
import axios from 'axios'
import ReactECharts from 'echarts-for-react'

const ReactGridLayout = WidthProvider(Responsive)

const chartTypes = [
  { type: 'bar', label: '柱状图', icon: <BarChartOutlined /> },
  { type: 'line', label: '折线图', icon: <BarChartOutlined /> },
  { type: 'pie', label: '饼图', icon: <BarChartOutlined /> },
  { type: 'scatter', label: '散点图', icon: <BarChartOutlined /> },
  { type: 'area', label: '面积图', icon: <BarChartOutlined /> },
  { type: 'box', label: '箱线图', icon: <BarChartOutlined /> },
  { type: 'sankey', label: '桑基图', icon: <BarChartOutlined /> },
  { type: 'funnel', label: '漏斗图', icon: <BarChartOutlined /> },
  { type: 'radar', label: '雷达图', icon: <BarChartOutlined /> },
  { type: 'heatmap', label: '热力图', icon: <BarChartOutlined /> },
  { type: 'calendar_heatmap', label: '日历热力图', icon: <BarChartOutlined /> },
  { type: 'treemap', label: '树状图', icon: <BarChartOutlined /> },
  { type: 'sunburst', label: '旭日图', icon: <BarChartOutlined /> },
  { type: 'combo', label: '组合图', icon: <BarChartOutlined /> },
  { type: 'waterfall', label: '瀑布图', icon: <BarChartOutlined /> },
]

const widgetTypes = [
  { type: 'chart', label: '图表组件', icon: <BarChartOutlined /> },
  { type: 'filter', label: '筛选器组件', icon: <FilterOutlined /> },
  { type: 'table', label: '表格组件', icon: <DatabaseOutlined /> },
  { type: 'stat', label: '统计卡片', icon: <DatabaseOutlined /> },
]

function ChartWidget({ widget, datasetId, columns, globalFilters, onRemove }) {
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (widget.config?.chart_type && datasetId) {
      fetchChartData()
    }
  }, [widget.config, datasetId, globalFilters])

  const fetchChartData = async () => {
    setLoading(true)
    try {
      const allFilters = [
        ...(widget.config.filters || []),
        ...(globalFilters || []),
      ]

      const response = await axios.post('http://localhost:8000/api/chart', {
        dataset_id: datasetId,
        chart_type: widget.config.chart_type,
        x_column: widget.config.x_column,
        y_column: widget.config.y_column,
        category_column: widget.config.category_column,
        filters: allFilters,
        config: widget.config,
      })
      setChartData(response.data)
    } catch (error) {
      console.error('Chart error:', error)
    } finally {
      setLoading(false)
    }
  }

  const getChartOption = () => {
    if (!chartData) return {}

    const { chart_type } = widget.config

    switch (chart_type) {
      case 'bar':
      case 'line':
      case 'area':
        if (chartData.series) {
          return {
            tooltip: { trigger: 'axis' },
            legend: { data: chartData.series.map(s => s.name) },
            xAxis: { type: 'category', data: chartData.categories },
            yAxis: { type: 'value' },
            series: chartData.series.map(s => ({
              ...s,
              type: chart_type === 'area' ? 'line' : chart_type,
              areaStyle: chart_type === 'area' ? {} : undefined,
            })),
          }
        }
        return {
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: chartData.categories },
          yAxis: { type: 'value' },
          series: [{
            data: chartData.data,
            type: chart_type === 'area' ? 'line' : chart_type,
            areaStyle: chart_type === 'area' ? {} : undefined,
          }],
        }

      case 'pie':
      case 'ring':
        return {
          tooltip: { trigger: 'item' },
          series: [{
            type: 'pie',
            radius: chart_type === 'ring' ? ['40%', '70%'] : '70%',
            data: chartData.data,
          }],
        }

      case 'scatter':
        return {
          tooltip: { trigger: 'item' },
          xAxis: { type: 'value', name: chartData.x_name },
          yAxis: { type: 'value', name: chartData.y_name },
          series: [{
            type: 'scatter',
            data: chartData.data,
          }],
        }

      case 'box':
        return {
          tooltip: { trigger: 'item' },
          xAxis: { type: 'category', data: chartData.categories },
          yAxis: { type: 'value' },
          series: [{
            type: 'boxplot',
            data: chartData.data,
          }],
        }

      case 'sankey':
        return {
          tooltip: { trigger: 'item' },
          series: [{
            type: 'sankey',
            data: chartData.nodes,
            links: chartData.links,
            emphasis: { focus: 'adjacency' },
            lineStyle: { color: 'gradient', curveness: 0.5 },
          }],
        }

      case 'funnel':
        return {
          tooltip: { trigger: 'item' },
          series: [{
            type: 'funnel',
            data: chartData.data,
          }],
        }

      case 'radar':
        return {
          tooltip: { trigger: 'item' },
          radar: { indicator: chartData.indicators },
          series: [{
            type: 'radar',
            data: chartData.series,
          }],
        }

      case 'heatmap':
        return {
          tooltip: { position: 'top' },
          xAxis: { type: 'category', data: chartData.x_categories },
          yAxis: { type: 'category', data: chartData.y_categories },
          visualMap: { min: 0, max: 100, calculable: true },
          series: [{
            type: 'heatmap',
            data: chartData.data,
          }],
        }

      case 'calendar_heatmap':
        return {
          tooltip: { position: 'top' },
          calendar: {
            top: 30,
            left: 30,
            right: 30,
            cellSize: ['auto', 13],
            range: chartData.data?.[0]?.[0] ? [chartData.data[0][0], chartData.data[chartData.data.length - 1][0]] : [],
            itemStyle: { borderWidth: 0.5 },
            yearLabel: { show: true },
          },
          visualMap: { min: 0, max: 100, calculable: true },
          series: [{
            type: 'heatmap',
            coordinateSystem: 'calendar',
            data: chartData.data,
          }],
        }

      case 'treemap':
        return {
          tooltip: { trigger: 'item' },
          series: [{
            type: 'treemap',
            data: chartData.data,
          }],
        }

      case 'sunburst':
        return {
          tooltip: { trigger: 'item' },
          series: [{
            type: 'sunburst',
            data: chartData.data,
            radius: [0, '90%'],
          }],
        }

      case 'combo':
        return {
          tooltip: { trigger: 'axis' },
          legend: { data: [chartData.bar_name, chartData.line_name] },
          xAxis: { type: 'category', data: chartData.categories },
          yAxis: [
            { type: 'value', name: chartData.bar_name },
            { type: 'value', name: chartData.line_name },
          ],
          series: [
            { name: chartData.bar_name, type: 'bar', data: chartData.bar_data, yAxisIndex: 0 },
            { name: chartData.line_name, type: 'line', data: chartData.line_data, yAxisIndex: 1 },
          ],
        }

      case 'waterfall':
        const waterData = chartData.data || []
        const categories = waterData.map(d => d.name)
        const values = waterData.map(d => d.value)
        return {
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: categories },
          yAxis: { type: 'value' },
          series: [{
            type: 'bar',
            data: values,
            itemStyle: {
              color: (params) => {
                const d = waterData[params.dataIndex]
                if (d.type === 'total') return '#1890ff'
                if (d.type === 'increase') return '#52c41a'
                return '#ff4d4f'
              },
            },
          }],
        }

      default:
        return {}
    }
  }

  return (
    <Card
      size="small"
      title={widget.config?.title || '图表'}
      loading={loading}
      extra={
        <Space>
          <Button type="text" size="small" icon={<ReloadOutlined />} onClick={fetchChartData} />
          <Popconfirm title="确定删除该组件？" onConfirm={onRemove} okText="确定" cancelText="取消">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        {chartData ? (
          <ReactECharts option={getChartOption()} style={{ height: '100%' }} />
        ) : (
          <Empty description="请配置图表" />
        )}
      </div>
    </Card>
  )
}

function FilterWidget({ widget, columns, onChange, onRemove }) {
  const [form] = Form.useForm()
  const [filterType, setFilterType] = useState(widget.config?.filter_type || 'select')

  const renderFilterInput = () => {
    const { column } = widget.config || {}

    switch (filterType) {
      case 'select':
        return (
          <Form.Item name="value">
            <Select
              mode="multiple"
              placeholder="选择值"
              style={{ width: '100%' }}
              onChange={(val) => onChange && onChange({ column, filter_type: 'in', value: val })}
            >
              {columns?.map(col => (
                <Select.Option key={col} value={col}>{col}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        )
      case 'range':
        return (
          <Form.Item name="value">
            <Slider
              range
              onChange={(val) => onChange && onChange({ column, filter_type: 'range', value: val })}
            />
          </Form.Item>
        )
      case 'date_range':
        return (
          <Form.Item name="value">
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              onChange={(dates) => {
                if (dates) {
                  onChange && onChange({
                    column,
                    filter_type: 'date_range',
                    value: [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')],
                  })
                }
              }}
            />
          </Form.Item>
        )
      default:
        return null
    }
  }

  return (
    <Card
      size="small"
      title={widget.config?.title || '筛选器'}
      extra={
        <Popconfirm title="确定删除该组件？" onConfirm={onRemove} okText="确定" cancelText="取消">
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      }
      style={{ height: '100%' }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="column" label="字段">
          <Select
            placeholder="选择字段"
            onChange={(val) => form.setFieldsValue({ column: val })}
          >
            {columns?.map(col => (
              <Select.Option key={col} value={col}>{col}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item label="筛选类型">
          <Select value={filterType} onChange={setFilterType}>
            <Select.Option value="select">多选筛选</Select.Option>
            <Select.Option value="range">数值范围</Select.Option>
            <Select.Option value="date_range">日期范围</Select.Option>
          </Select>
        </Form.Item>
        {renderFilterInput()}
      </Form>
    </Card>
  )
}

function TableWidget({ widget, datasetId, globalFilters, onRemove }) {
  const [data, setData] = useState([])
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })

  useEffect(() => {
    if (datasetId) {
      fetchData()
    }
  }, [datasetId, pagination.current, pagination.pageSize, globalFilters])

  const fetchData = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`http://localhost:8000/api/dataset/${datasetId}/data`, {
        params: {
          page: pagination.current,
          page_size: pagination.pageSize,
        },
      })
      setData(response.data.data)
      setColumns(response.data.columns.map(col => ({ title: col, dataIndex: col, key: col })))
      setPagination(p => ({ ...p, total: response.data.total }))
    } catch (error) {
      console.error('Table error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card
      size="small"
      title={widget.config?.title || '数据表格'}
      loading={loading}
      extra={
        <Space>
          <Button type="text" size="small" icon={<ReloadOutlined />} onClick={fetchData} />
          <Popconfirm title="确定删除该组件？" onConfirm={onRemove} okText="确定" cancelText="取消">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Table
          size="small"
          dataSource={data}
          columns={columns}
          pagination={pagination}
          onChange={(p) => setPagination(p)}
          scroll={{ x: 'max-content', y: 300 }}
        />
      </div>
    </Card>
  )
}

function StatWidget({ widget, datasetId, onRemove }) {
  const [value, setValue] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (widget.config?.column && datasetId) {
      fetchStat()
    }
  }, [widget.config, datasetId])

  const fetchStat = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`http://localhost:8000/api/dataset/${datasetId}/overview`)
      const stats = response.data.statistics?.[widget.config.column]
      const aggFunc = widget.config.agg_func || 'sum'

      if (stats) {
        if (aggFunc === 'sum') {
          setValue(stats.mean * response.data.info.rows)
        } else {
          setValue(stats[aggFunc])
        }
      }
    } catch (error) {
      console.error('Stat error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card
      size="small"
      loading={loading}
      extra={
        <Popconfirm title="确定删除该组件？" onConfirm={onRemove} okText="确定" cancelText="取消">
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      }
      style={{ height: '100%' }}
    >
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: 8 }}>
          {widget.config?.title || widget.config?.column}
        </div>
        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1890ff' }}>
          {value !== null ? (typeof value === 'number' ? value.toLocaleString() : value) : '-'}
        </div>
      </div>
    </Card>
  )
}

export default function DashboardPage({ datasetId, datasetInfo }) {
  const [layout, setLayout] = useState([])
  const [widgets, setWidgets] = useState({})
  const [dashboards, setDashboards] = useState([])
  const [saveModalVisible, setSaveModalVisible] = useState(false)
  const [loadModalVisible, setLoadModalVisible] = useState(false)
  const [configDrawerVisible, setConfigDrawerVisible] = useState(false)
  const [selectedWidget, setSelectedWidget] = useState(null)
  const [globalFilters, setGlobalFilters] = useState([])
  const [variables, setVariables] = useState([])
  const [autoRefresh, setAutoRefresh] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [saveForm] = Form.useForm()
  const [configForm] = Form.useForm()
  const [isEditing, setIsEditing] = useState(true)
  const refreshTimerRef = useRef(null)

  const columns = datasetInfo?.columns || []

  useEffect(() => {
    if (autoRefresh && !isEditing) {
      refreshTimerRef.current = setInterval(() => {
        setLayout([...layout])
      }, autoRefresh * 1000)
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
      }
    }
  }, [autoRefresh, isEditing])

  const addWidget = (type) => {
    const id = `widget_${Date.now()}`
    const newWidget = {
      i: id,
      x: 0,
      y: Infinity,
      w: 6,
      h: 8,
      type,
      config: {},
    }

    setLayout([...layout, newWidget])
    setWidgets({ ...widgets, [id]: { type, config: {} } })
    setSelectedWidget({ id, ...newWidget })
    configForm.setFieldsValue({ type, ...newWidget.config })
    setConfigDrawerVisible(true)
  }

  const removeWidget = (id) => {
    setLayout(layout.filter(item => item.i !== id))
    const newWidgets = { ...widgets }
    delete newWidgets[id]
    setWidgets(newWidgets)
  }

  const onLayoutChange = (currentLayout) => {
    setLayout(currentLayout)
  }

  const saveWidgetConfig = () => {
    configForm.validateFields().then((values) => {
      const { type, ...config } = values
      setWidgets({
        ...widgets,
        [selectedWidget.id]: { type, config },
      })
      setConfigDrawerVisible(false)
      message.success('配置已保存')
    })
  }

  const saveDashboard = () => {
    saveForm.validateFields().then(async (values) => {
      try {
        const response = await axios.post('http://localhost:8000/api/dashboard/save', {
          name: values.name,
          description: values.description,
          layout,
          widgets,
          filters: globalFilters,
          variables,
          auto_refresh: autoRefresh,
        })
        message.success('仪表盘保存成功')
        setSaveModalVisible(false)
        saveForm.resetFields()
      } catch (error) {
        message.error('保存失败: ' + error.message)
      }
    })
  }

  const loadDashboards = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/dashboard/list')
      setDashboards(response.data.dashboards)
      setLoadModalVisible(true)
    } catch (error) {
      message.error('加载失败: ' + error.message)
    }
  }

  const loadDashboard = (dashboard) => {
    setLayout(dashboard.layout)
    setWidgets(dashboard.widgets)
    setGlobalFilters(dashboard.filters || [])
    setVariables(dashboard.variables || [])
    setAutoRefresh(dashboard.auto_refresh)
    setLoadModalVisible(false)
    message.success('仪表盘加载成功')
  }

  const exportToPDF = () => {
    message.info('PDF导出功能需要后端配合，当前为演示版本')
  }

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  const renderWidget = (item) => {
    const widget = widgets[item.i]
    if (!widget) return null

    const props = {
      widget: { ...item, ...widget },
      datasetId,
      columns,
      globalFilters,
      onRemove: () => removeWidget(item.i),
    }

    switch (widget.type) {
      case 'chart':
        return <ChartWidget {...props} />
      case 'filter':
        return <FilterWidget {...props} onChange={(filter) => setGlobalFilters([filter])} />
      case 'table':
        return <TableWidget {...props} />
      case 'stat':
        return <StatWidget {...props} />
      default:
        return <div>未知组件类型</div>
    }
  }

  const widgetMenu = (
    <Menu onClick={({ key }) => addWidget(key)}>
      {widgetTypes.map(w => (
        <Menu.Item key={w.type} icon={w.icon}>
          {w.label}
        </Menu.Item>
      ))}
    </Menu>
  )

  const chartWidgetMenu = (
    <Menu onClick={({ key }) => {
      const id = `widget_${Date.now()}`
      const newWidget = {
        i: id,
        x: 0,
        y: Infinity,
        w: 8,
        h: 10,
        type: 'chart',
        config: { chart_type: key },
      }
      setLayout([...layout, newWidget])
      setWidgets({ ...widgets, [id]: { type: 'chart', config: { chart_type: key } } })
    }}>
      {chartTypes.map(c => (
        <Menu.Item key={c.type} icon={c.icon}>
          {c.label}
        </Menu.Item>
      ))}
    </Menu>
  )

  if (!datasetId) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
        请先导入数据
      </div>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 10, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Dropdown overlay={widgetMenu}>
            <Button icon={<PlusOutlined />}>添加组件</Button>
          </Dropdown>
          <Dropdown overlay={chartWidgetMenu}>
            <Button icon={<BarChartOutlined />}>添加图表</Button>
          </Dropdown>
          <Button
            type={isEditing ? 'primary' : 'default'}
            icon={isEditing ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? '预览模式' : '编辑模式'}
          </Button>
        </Space>
        <Space>
          {!isEditing && (
            <Select
              placeholder="自动刷新"
              style={{ width: 120 }}
              value={autoRefresh}
              onChange={setAutoRefresh}
              allowClear
            >
              <Select.Option value={5}>5秒</Select.Option>
              <Select.Option value={10}>10秒</Select.Option>
              <Select.Option value={30}>30秒</Select.Option>
              <Select.Option value={60}>1分钟</Select.Option>
            </Select>
          )}
          <Button icon={<SaveOutlined />} onClick={() => setSaveModalVisible(true)}>
            保存仪表盘
          </Button>
          <Button icon={<FolderOpenOutlined />} onClick={loadDashboards}>
            加载仪表盘
          </Button>
          <Button icon={<FullscreenOutlined />} onClick={toggleFullscreen}>
            全屏
          </Button>
          <Button icon={<DownloadOutlined />} onClick={exportToPDF}>
            导出PDF
          </Button>
        </Space>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
        {layout.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#999' }}>
            <DatabaseOutlined style={{ fontSize: 48, marginBottom: 16 }} />
            <div>点击上方按钮添加组件</div>
          </div>
        ) : (
          <ReactGridLayout
            className="layout"
            layouts={{ lg: layout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 24, md: 20, sm: 12, xs: 8, xxs: 4 }}
            rowHeight={30}
            isDraggable={isEditing}
            isResizable={isEditing}
            onLayoutChange={onLayoutChange}
          >
            {layout.map(item => (
              <div key={item.i} data-grid={item}>
                {renderWidget(item)}
              </div>
            ))}
          </ReactGridLayout>
        )}
      </div>

      <Drawer
        title="组件配置"
        placement="right"
        width={400}
        open={configDrawerVisible}
        onClose={() => setConfigDrawerVisible(false)}
        extra={
          <Button type="primary" onClick={saveWidgetConfig}>保存</Button>
        }
      >
        <Form form={configForm} layout="vertical">
          <Form.Item name="title" label="标题">
            <Input placeholder="请输入标题" />
          </Form.Item>
          {selectedWidget?.type === 'chart' && (
            <>
              <Form.Item name="chart_type" label="图表类型">
                <Select>
                  {chartTypes.map(c => (
                    <Select.Option key={c.type} value={c.type}>{c.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="x_column" label="X轴列">
                <Select>
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="y_column" label="Y轴列">
                <Select>
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="category_column" label="分类列">
                <Select allowClear>
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="source_column" label="源列（桑基图）">
                <Select allowClear>
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="target_column" label="目标列（桑基图）">
                <Select allowClear>
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="value_column" label="数值列">
                <Select allowClear>
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="bar_column" label="柱状图列（组合图）">
                <Select allowClear>
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="line_column" label="折线图列（组合图）">
                <Select allowClear>
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="hierarchy_columns" label="层级列（树状图/旭日图）">
                <Select mode="multiple">
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="indicator_columns" label="指标列（雷达图）">
                <Select mode="multiple">
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="stage_column" label="阶段列（漏斗图）">
                <Select allowClear>
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          )}
          {selectedWidget?.type === 'stat' && (
            <>
              <Form.Item name="column" label="统计列">
                <Select>
                  {columns.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="agg_func" label="聚合函数">
                <Select>
                  <Select.Option value="sum">求和</Select.Option>
                  <Select.Option value="mean">平均</Select.Option>
                  <Select.Option value="max">最大值</Select.Option>
                  <Select.Option value="min">最小值</Select.Option>
                </Select>
              </Form.Item>
            </>
          )}
        </Form>
      </Drawer>

      <Modal
        title="保存仪表盘"
        open={saveModalVisible}
        onCancel={() => setSaveModalVisible(false)}
        footer={null}
      >
        <Form form={saveForm} layout="vertical">
          <Form.Item name="name" label="仪表盘名称" rules={[{ required: true }]}>
            <Input placeholder="请输入仪表盘名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入描述" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={saveDashboard} block>保存</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="加载仪表盘"
        open={loadModalVisible}
        onCancel={() => setLoadModalVisible(false)}
        footer={null}
        width={600}
      >
        {dashboards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            暂无保存的仪表盘
          </div>
        ) : (
          <List
            dataSource={dashboards}
            renderItem={(dashboard) => (
              <List.Item
                actions={[
                  <Button type="link" onClick={() => loadDashboard(dashboard)}>加载</Button>,
                ]}
              >
                <List.Item.Meta
                  title={dashboard.name}
                  description={dashboard.description || `创建于 ${dashboard.created_at}`}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  )
}
