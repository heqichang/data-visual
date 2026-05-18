import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Form, Select, Input, Button, Tabs, message, Spin, Space } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import axios from 'axios'

const { TabPane } = Tabs
const { Option } = Select

function ChartPage({ datasetId, datasetInfo }) {
  const [chartTypes] = useState(['line', 'bar', 'scatter', 'pie', 'ring', 'area', 'box'])
  const [chartType, setChartType] = useState('line')
  const [loading, setLoading] = useState(false)
  const [chartData, setChartData] = useState(null)
  const [chartConfig, setChartConfig] = useState({
    title: '',
    xAxisLabel: '',
    yAxisLabel: '',
  })
  const [form] = Form.useForm()
  const chartRef = React.useRef(null)

  const columns = datasetInfo?.columns || []
  const numericColumns = columns.filter(col => datasetInfo?.info?.column_types?.[col] === 'numeric')
  const categoricalColumns = columns.filter(col => 
    datasetInfo?.info?.column_types?.[col] === 'text' || datasetInfo?.info?.column_types?.[col] === 'boolean'
  )

  useEffect(() => {
    form.setFieldsValue({
      xColumn: numericColumns[0] || '',
      yColumn: numericColumns[1] || '',
      categoryColumn: '',
    })
  }, [columns])

  const loadChartData = async () => {
    const values = form.getFieldsValue()
    if (!values.xColumn || !values.yColumn) {
      message.warning('请选择 X 轴和 Y 轴字段')
      return
    }

    setLoading(true)
    try {
      const response = await axios.post('/api/chart', {
        dataset_id: datasetId,
        chart_type: chartType,
        x_column: values.xColumn,
        y_column: values.yColumn,
        category_column: values.categoryColumn,
        filters: [],
      })
      setChartData(response.data)
    } catch (error) {
      message.error('加载图表数据失败: ' + (error.response?.data?.detail || error.message))
    } finally {
      setLoading(false)
    }
  }

  const getChartOption = () => {
    if (!chartData) return {}

    const baseOption = {
      title: { text: chartConfig.title || `${chartType} 图表`, left: 'center' },
      tooltip: { trigger: chartType === 'scatter' ? 'item' : 'axis' },
      legend: { top: 30 },
      grid: { left: '3%', right: '4%', bottom: '3%', top: 80, containLabel: true },
    }

    switch (chartType) {
      case 'line':
        return {
          ...baseOption,
          xAxis: {
            type: 'category',
            data: chartData.categories,
            name: chartConfig.xAxisLabel,
          },
          yAxis: { type: 'value', name: chartConfig.yAxisLabel },
          series: [{
            type: 'line',
            data: chartData.data,
            smooth: true,
            itemStyle: { color: '#1890ff' },
            areaStyle: { color: 'rgba(24, 144, 255, 0.2)' },
          }],
        }

      case 'bar':
        if (chartData.series) {
          return {
            ...baseOption,
            xAxis: { type: 'category', data: chartData.categories, name: chartConfig.xAxisLabel },
            yAxis: { type: 'value', name: chartConfig.yAxisLabel },
            series: chartData.series.map((s, i) => ({
              type: 'bar',
              name: s.name,
              data: s.data,
            })),
          }
        }
        return {
          ...baseOption,
          xAxis: { type: 'category', data: chartData.categories, name: chartConfig.xAxisLabel },
          yAxis: { type: 'value', name: chartConfig.yAxisLabel },
          series: [{ type: 'bar', data: chartData.data, itemStyle: { color: '#52c41a' } }],
        }

      case 'scatter':
        return {
          ...baseOption,
          tooltip: {
            formatter: (params) => `${chartData.x_name}: ${params.value[0]}<br/>${chartData.y_name}: ${params.value[1]}`,
          },
          xAxis: { type: 'value', name: chartConfig.xAxisLabel || chartData.x_name },
          yAxis: { type: 'value', name: chartConfig.yAxisLabel || chartData.y_name },
          series: [{
            type: 'scatter',
            data: chartData.data,
            itemStyle: { color: '#722ed1', opacity: 0.7 },
            symbolSize: 8,
          }],
        }

      case 'pie':
      case 'ring':
        return {
          ...baseOption,
          tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
          series: [{
            type: 'pie',
            radius: chartType === 'ring' ? ['40%', '70%'] : '60%',
            data: chartData.data,
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)',
              },
            },
          }],
        }

      case 'area':
        return {
          ...baseOption,
          xAxis: { type: 'category', data: chartData.categories, boundaryGap: false, name: chartConfig.xAxisLabel },
          yAxis: { type: 'value', name: chartConfig.yAxisLabel },
          series: [{
            type: 'line',
            data: chartData.data,
            areaStyle: { color: 'rgba(250, 173, 20, 0.3)' },
            itemStyle: { color: '#faad14' },
            smooth: true,
          }],
        }

      case 'box':
        return {
          ...baseOption,
          tooltip: {
            trigger: 'item',
            formatter: (params) => `${params.name}<br/>最小值: ${params.value[0]}<br/>Q1: ${params.value[1]}<br/>中位数: ${params.value[2]}<br/>Q3: ${params.value[3]}<br/>最大值: ${params.value[4]}`,
          },
          xAxis: { type: 'category', data: chartData.categories, name: chartConfig.xAxisLabel },
          yAxis: { type: 'value', name: chartConfig.yAxisLabel },
          series: [{
            type: 'boxplot',
            data: chartData.data,
            itemStyle: { color: '#eb2f96' },
          }],
        }

      default:
        return baseOption
    }
  }

  const exportChart = (type) => {
    if (!chartRef.current) return
    const url = chartRef.current.getEchartsInstance().getDataURL({
      type: type,
      pixelRatio: 2,
      excludeComponents: ['toolbox'],
    })
    const link = document.createElement('a')
    link.download = `chart_${chartType}.${type}`
    link.href = url
    link.click()
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card title="图表配置">
            <Form form={form} layout="vertical">
              <Form.Item label="图表类型">
                <Select value={chartType} onChange={setChartType}>
                  {chartTypes.map(type => (
                    <Option key={type} value={type}>
                      {type === 'line' && '折线图'}
                      {type === 'bar' && '柱状图'}
                      {type === 'scatter' && '散点图'}
                      {type === 'pie' && '饼图'}
                      {type === 'ring' && '环形图'}
                      {type === 'area' && '面积图'}
                      {type === 'box' && '箱线图'}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="xColumn" label={chartType === 'pie' || chartType === 'ring' ? '名称字段' : 'X 轴字段'} rules={[{ required: true }]}>
                <Select placeholder="选择字段">
                  {columns.map(col => (
                    <Option key={col} value={col}>{col}</Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="yColumn" label={chartType === 'pie' || chartType === 'ring' ? '数值字段' : 'Y 轴字段'} rules={[{ required: true }]}>
                <Select placeholder="选择字段">
                  {numericColumns.map(col => (
                    <Option key={col} value={col}>{col}</Option>
                  ))}
                </Select>
              </Form.Item>
              {chartType === 'bar' && (
                <Form.Item name="categoryColumn" label="分组字段（可选）">
                  <Select placeholder="选择分组字段" allowClear>
                    {categoricalColumns.map(col => (
                      <Option key={col} value={col}>{col}</Option>
                    ))}
                  </Select>
                </Form.Item>
              )}
              <Form.Item label="图表标题">
                <Input
                  placeholder="输入图表标题"
                  value={chartConfig.title}
                  onChange={(e) => setChartConfig({ ...chartConfig, title: e.target.value })}
                />
              </Form.Item>
              <Form.Item label="X 轴标签">
                <Input
                  placeholder="X 轴标签"
                  value={chartConfig.xAxisLabel}
                  onChange={(e) => setChartConfig({ ...chartConfig, xAxisLabel: e.target.value })}
                />
              </Form.Item>
              <Form.Item label="Y 轴标签">
                <Input
                  placeholder="Y 轴标签"
                  value={chartConfig.yAxisLabel}
                  onChange={(e) => setChartConfig({ ...chartConfig, yAxisLabel: e.target.value })}
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" onClick={loadChartData} loading={loading} block>
                  生成图表
                </Button>
              </Form.Item>
            </Form>

            {chartData && (
              <div style={{ marginTop: 16 }}>
                <Button.Group>
                  <Button icon={<DownloadOutlined />} onClick={() => exportChart('png')}>导出 PNG</Button>
                  <Button icon={<DownloadOutlined />} onClick={() => exportChart('svg')}>导出 SVG</Button>
                </Button.Group>
              </div>
            )}
          </Card>
        </Col>
        <Col span={18}>
          <Card title="图表预览">
            {loading ? (
              <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
            ) : chartData ? (
              <ReactECharts
                ref={chartRef}
                option={getChartOption()}
                style={{ height: 600 }}
                notMerge={true}
                lazyUpdate={true}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 100, color: '#999' }}>
                请在左侧配置图表参数并点击"生成图表"
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default ChartPage
