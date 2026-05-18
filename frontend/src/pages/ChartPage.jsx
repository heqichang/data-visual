import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Form, Select, Input, Button, Tabs, message, Spin, Space, InputNumber, Switch } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import axios from 'axios'

const { TabPane } = Tabs
const { Option } = Select

const chartTypeGroups = [
  {
    name: '基础图表',
    types: [
      { value: 'line', label: '折线图' },
      { value: 'bar', label: '柱状图' },
      { value: 'scatter', label: '散点图' },
      { value: 'pie', label: '饼图' },
      { value: 'ring', label: '环形图' },
      { value: 'area', label: '面积图' },
      { value: 'box', label: '箱线图' },
    ]
  },
  {
    name: '高级图表',
    types: [
      { value: 'sankey', label: '桑基图' },
      { value: 'funnel', label: '漏斗图' },
      { value: 'radar', label: '雷达图' },
      { value: 'heatmap', label: '热力图' },
      { value: 'calendar_heatmap', label: '日历热力图' },
      { value: 'treemap', label: '树状图' },
      { value: 'sunburst', label: '旭日图' },
      { value: 'combo', label: '组合图' },
      { value: 'waterfall', label: '瀑布图' },
    ]
  },
]

function ChartPage({ datasetId, datasetInfo }) {
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
  const dateColumns = columns.filter(col => datasetInfo?.info?.column_types?.[col] === 'date')

  useEffect(() => {
    form.setFieldsValue({
      xColumn: numericColumns[0] || '',
      yColumn: numericColumns[1] || '',
      categoryColumn: '',
      sourceColumn: categoricalColumns[0] || '',
      targetColumn: categoricalColumns[1] || '',
      valueColumn: numericColumns[0] || '',
      barColumn: numericColumns[0] || '',
      lineColumn: numericColumns[1] || '',
      stageColumn: categoricalColumns[0] || '',
      indicatorColumns: numericColumns.slice(0, 5),
      hierarchyColumns: categoricalColumns.slice(0, 3),
    })
  }, [columns])

  const loadChartData = async () => {
    const values = form.getFieldsValue()
    
    setLoading(true)
    try {
      const config = {
        source_column: values.sourceColumn,
        target_column: values.targetColumn,
        value_column: values.valueColumn,
        bar_column: values.barColumn,
        line_column: values.lineColumn,
        stage_column: values.stageColumn,
        indicator_columns: values.indicatorColumns,
        hierarchy_columns: values.hierarchyColumns,
      }

      const response = await axios.post('http://localhost:8000/api/chart', {
        dataset_id: datasetId,
        chart_type: chartType,
        x_column: values.xColumn,
        y_column: values.yColumn,
        category_column: values.categoryColumn,
        filters: [],
        config,
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

      case 'sankey':
        return {
          ...baseOption,
          tooltip: { trigger: 'item', formatter: '{b}: {c}' },
          series: [{
            type: 'sankey',
            data: chartData.nodes,
            links: chartData.links,
            emphasis: { focus: 'adjacency' },
            lineStyle: { color: 'gradient', curveness: 0.5 },
            left: '10%',
            right: '10%',
            top: 60,
            bottom: 30,
          }],
        }

      case 'funnel':
        return {
          ...baseOption,
          tooltip: { trigger: 'item', formatter: '{b}: {c}' },
          series: [{
            type: 'funnel',
            data: chartData.data,
            label: { show: true, position: 'inside' },
            itemStyle: { borderColor: '#fff', borderWidth: 2 },
          }],
        }

      case 'radar':
        return {
          ...baseOption,
          tooltip: { trigger: 'item' },
          legend: { data: chartData.series?.map(s => s.name) || [], bottom: 10 },
          radar: { indicator: chartData.indicators, center: ['50%', '55%'], radius: '60%' },
          series: [{
            type: 'radar',
            data: chartData.series,
            areaStyle: { opacity: 0.3 },
          }],
        }

      case 'heatmap':
        return {
          ...baseOption,
          tooltip: { position: 'top', formatter: (params) => `${params.marker} ${chartData.y_categories[params.value[1]]} - ${chartData.x_categories[params.value[0]]}: ${params.value[2]}` },
          grid: { height: '50%', top: 60 },
          xAxis: { type: 'category', data: chartData.x_categories, splitArea: { show: true } },
          yAxis: { type: 'category', data: chartData.y_categories, splitArea: { show: true } },
          visualMap: { min: 0, max: Math.max(...chartData.data.map(d => d[2])), calculable: true, orient: 'horizontal', left: 'center', bottom: '5%' },
          series: [{
            type: 'heatmap',
            data: chartData.data,
            label: { show: false },
            emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
          }],
        }

      case 'calendar_heatmap':
        return {
          ...baseOption,
          tooltip: { position: 'top' },
          visualMap: { min: 0, max: Math.max(...chartData.data.map(d => d[1])), calculable: true, orient: 'horizontal', left: 'center', bottom: 20 },
          calendar: {
            top: 60,
            left: 30,
            right: 30,
            cellSize: ['auto', 15],
            range: chartData.data?.[0]?.[0] ? [chartData.data[0][0], chartData.data[chartData.data.length - 1][0]] : [],
            itemStyle: { borderWidth: 0.5 },
            yearLabel: { show: true },
          },
          series: [{
            type: 'heatmap',
            coordinateSystem: 'calendar',
            data: chartData.data,
          }],
        }

      case 'treemap':
        return {
          ...baseOption,
          tooltip: { trigger: 'item', formatter: '{b}: {c}' },
          series: [{
            type: 'treemap',
            data: chartData.data,
            label: { show: true, formatter: '{b}' },
            breadcrumb: { show: true },
            levels: [
              { itemStyle: { borderWidth: 0, gapWidth: 5 } },
              { itemStyle: { gapWidth: 1 } },
            ],
          }],
        }

      case 'sunburst':
        return {
          ...baseOption,
          tooltip: { trigger: 'item', formatter: '{b}: {c}' },
          series: [{
            type: 'sunburst',
            data: chartData.data,
            radius: [0, '90%'],
            label: { rotate: 'radial' },
            emphasis: { focus: 'ancestor' },
          }],
        }

      case 'combo':
        return {
          ...baseOption,
          tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
          legend: { data: [chartData.bar_name, chartData.line_name], top: 30 },
          xAxis: { type: 'category', data: chartData.categories, axisPointer: { type: 'shadow' } },
          yAxis: [
            { type: 'value', name: chartData.bar_name, position: 'left' },
            { type: 'value', name: chartData.line_name, position: 'right' },
          ],
          series: [
            { name: chartData.bar_name, type: 'bar', data: chartData.bar_data, yAxisIndex: 0, itemStyle: { color: '#52c41a' } },
            { name: chartData.line_name, type: 'line', data: chartData.line_data, yAxisIndex: 1, itemStyle: { color: '#1890ff' }, smooth: true },
          ],
        }

      case 'waterfall':
        const waterData = chartData.data || []
        return {
          ...baseOption,
          tooltip: { trigger: 'axis', formatter: (params) => {
            const data = params[0]
            const d = waterData[data.dataIndex]
            return `${d.name}<br/>${d.type === 'total' ? '总计' : d.type === 'increase' ? '增加' : '减少'}: ${data.value}`
          }},
          xAxis: { type: 'category', data: waterData.map(d => d.name) },
          yAxis: { type: 'value' },
          series: [{
            type: 'bar',
            data: waterData.map(d => d.value),
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

  const renderConfigFields = () => {
    const commonFields = (
      <>
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
      </>
    )

    switch (chartType) {
      case 'sankey':
        return (
          <>
            <Form.Item name="sourceColumn" label="源列" rules={[{ required: true }]}>
              <Select placeholder="选择源列">
                {columns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="targetColumn" label="目标列" rules={[{ required: true }]}>
              <Select placeholder="选择目标列">
                {columns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="valueColumn" label="数值列" rules={[{ required: true }]}>
              <Select placeholder="选择数值列">
                {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            {commonFields}
          </>
        )

      case 'funnel':
        return (
          <>
            <Form.Item name="stageColumn" label="阶段列" rules={[{ required: true }]}>
              <Select placeholder="选择阶段列">
                {columns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="valueColumn" label="数值列" rules={[{ required: true }]}>
              <Select placeholder="选择数值列">
                {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            {commonFields}
          </>
        )

      case 'radar':
        return (
          <>
            <Form.Item name="categoryColumn" label="分类列（可选）">
              <Select placeholder="选择分类列" allowClear>
                {categoricalColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="indicatorColumns" label="指标列" rules={[{ required: true }]}>
              <Select mode="multiple" placeholder="选择指标列">
                {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            {commonFields}
          </>
        )

      case 'heatmap':
        return (
          <>
            <Form.Item name="xColumn" label="X轴列" rules={[{ required: true }]}>
              <Select placeholder="选择X轴列">
                {columns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="categoryColumn" label="Y轴列" rules={[{ required: true }]}>
              <Select placeholder="选择Y轴列">
                {columns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="yColumn" label="数值列" rules={[{ required: true }]}>
              <Select placeholder="选择数值列">
                {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            {commonFields}
          </>
        )

      case 'calendar_heatmap':
        return (
          <>
            <Form.Item name="xColumn" label="日期列" rules={[{ required: true }]}>
              <Select placeholder="选择日期列">
                {dateColumns.length > 0 ? dateColumns.map(col => <Option key={col} value={col}>{col}</Option>) : columns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="yColumn" label="数值列" rules={[{ required: true }]}>
              <Select placeholder="选择数值列">
                {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            {commonFields}
          </>
        )

      case 'treemap':
      case 'sunburst':
        return (
          <>
            <Form.Item name="hierarchyColumns" label="层级列" rules={[{ required: true }]}>
              <Select mode="multiple" placeholder="按层级顺序选择列">
                {columns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="yColumn" label="数值列" rules={[{ required: true }]}>
              <Select placeholder="选择数值列">
                {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            {commonFields}
          </>
        )

      case 'combo':
        return (
          <>
            <Form.Item name="xColumn" label="X轴列" rules={[{ required: true }]}>
              <Select placeholder="选择X轴列">
                {columns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="barColumn" label="柱状图列" rules={[{ required: true }]}>
              <Select placeholder="选择柱状图数值列">
                {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="lineColumn" label="折线图列" rules={[{ required: true }]}>
              <Select placeholder="选择折线图数值列">
                {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            {commonFields}
          </>
        )

      case 'waterfall':
        return (
          <>
            <Form.Item name="xColumn" label="类别列" rules={[{ required: true }]}>
              <Select placeholder="选择类别列">
                {columns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="yColumn" label="数值列" rules={[{ required: true }]}>
              <Select placeholder="选择数值列">
                {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            {commonFields}
          </>
        )

      default:
        return (
          <>
            <Form.Item name="xColumn" label={chartType === 'pie' || chartType === 'ring' ? '名称字段' : 'X 轴字段'} rules={[{ required: true }]}>
              <Select placeholder="选择字段">
                {columns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="yColumn" label={chartType === 'pie' || chartType === 'ring' ? '数值字段' : 'Y 轴字段'} rules={[{ required: true }]}>
              <Select placeholder="选择字段">
                {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
              </Select>
            </Form.Item>
            {chartType === 'bar' && (
              <Form.Item name="categoryColumn" label="分组字段（可选）">
                <Select placeholder="选择分组字段" allowClear>
                  {categoricalColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
                </Select>
              </Form.Item>
            )}
            {commonFields}
          </>
        )
    }
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card title="图表配置">
            <Form form={form} layout="vertical">
              <Form.Item label="图表类型">
                <Select value={chartType} onChange={setChartType}>
                  {chartTypeGroups.map(group => (
                    <Select.OptGroup key={group.name} label={group.name}>
                      {group.types.map(type => (
                        <Option key={type.value} value={type.value}>{type.label}</Option>
                      ))}
                    </Select.OptGroup>
                  ))}
                </Select>
              </Form.Item>
              {renderConfigFields()}
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
